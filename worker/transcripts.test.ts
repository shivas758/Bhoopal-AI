import { afterEach, describe, expect, test, vi } from 'vitest'
import type { AdminAnswers, DiagnoseResult } from '../shared/types'
import { handleAdminAnswers } from './admin'
import { handleChat } from './chat'
import { handleDiagnose } from './diagnose'
import worker from './index'
import { cleanUp, saveTranscript, voteTranscript } from './store'

// The owner's "Recent answers": every question and answer kept 7 days in the transcripts table, the thumbs
// attached to it, and the endpoint that lists it.

const DAY_MS = 86400_000
const TOKEN = 'a-long-random-admin-token-for-tests-0002'
const bearer = { authorization: `Bearer ${TOKEN}` }

interface Call {
  sql: string
  params: unknown[]
}

/** A D1 that records every statement and answers reads from `rowsFor`. */
function fakeDb(rowsFor: (sql: string, params: unknown[]) => Record<string, unknown>[] = () => []) {
  const calls: Call[] = []
  const statement = (sql: string, params: unknown[] = []) => ({
    sql,
    params,
    bind: (...p: unknown[]) => statement(sql, p),
    async run() {
      calls.push({ sql, params })
      return { success: true, results: [] }
    },
    async first() {
      calls.push({ sql, params })
      return rowsFor(sql, params)[0] ?? null
    },
    async all() {
      calls.push({ sql, params })
      return { success: true, results: rowsFor(sql, params) }
    },
  })
  const db = {
    prepare: (sql: string) => statement(sql),
    async batch(statements: ReturnType<typeof statement>[]) {
      calls.push(...statements.map(({ sql, params }) => ({ sql, params })))
      return statements.map((s) => ({ success: true, results: rowsFor(s.sql, s.params) }))
    },
  }
  return { db: db as unknown as D1Database, calls }
}

/** An ExecutionContext whose queued work can be awaited, including work queued while awaiting. */
function fakeCtx() {
  const waits: Promise<unknown>[] = []
  const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} } as unknown as ExecutionContext
  const settled = async () => {
    for (let i = 0; i < waits.length; i++) await waits[i]
  }
  return { ctx, settled }
}

afterEach(() => vi.unstubAllGlobals())

describe('the store', () => {
  test('a transcript is written in column order, with long text cut', async () => {
    const { db, calls } = fakeDb()
    await saveTranscript(db, { kind: 'chat', qid: 'abc', lang: 'en', outcome: 'answered', question: 'q', answer: 'x'.repeat(20_000) }, 123)
    expect(calls[0].sql).toMatch(/^INSERT INTO transcripts \(created, kind, phone, qid, lang, state, district, model, outcome, question, answer, vote, ms\)/)
    expect(calls[0].params).toEqual([123, 'chat', null, 'abc', 'en', null, null, null, 'answered', 'q', 'x'.repeat(12_000), null])
  })

  test('a thumb goes to the newest answer with that id from the last 7 days', async () => {
    const { db, calls } = fakeDb()
    await voteTranscript(db, 'chat', 'abc', 'up', 10 * DAY_MS)
    expect(calls[0].sql).toBe(
      'UPDATE transcripts SET vote = ? WHERE id = (SELECT id FROM transcripts WHERE kind = ? AND qid = ? AND created > ? ORDER BY created DESC, id DESC LIMIT 1)',
    )
    expect(calls[0].params).toEqual(['up', 'chat', 'abc', 3 * DAY_MS])
  })

  test('the daily clean-up deletes transcripts older than 7 days', async () => {
    const { db, calls } = fakeDb()
    const now = 100 * DAY_MS
    await cleanUp(db, now)
    expect(calls.find((c) => c.sql.includes('FROM transcripts'))).toEqual({ sql: 'DELETE FROM transcripts WHERE created < ?', params: [now - 7 * DAY_MS] })
  })

  test('without a database nothing is kept and nothing fails', async () => {
    await expect(saveTranscript(undefined, { kind: 'chat', lang: 'en', outcome: 'answered', question: 'q', answer: 'a' })).resolves.toBeUndefined()
    await expect(voteTranscript(undefined, 'chat', 'abc', 'down')).resolves.toBeUndefined()
  })
})

describe('what the Worker keeps', () => {
  const sse = (...events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join('')
  const text = (t: string, finishReason?: string) => ({ candidates: [{ content: { parts: [{ text: t }] }, ...(finishReason ? { finishReason } : {}) }] })

  test('a chat answer is kept with its question, place, model and outcome', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/model-t:')
          ? new Response(sse(text('Mix dry leaves and dung. '), text('Turn it weekly. 🌱', 'STOP')), { headers: { 'content-type': 'text/event-stream' } })
          : new Response('unexpected', { status: 500 }),
      ),
    )
    const { db, calls } = fakeDb()
    const { ctx, settled } = fakeCtx()
    const env = { GEMINI_API_KEY: 'test', GEMINI_MODELS: 'model-t', USER_AGENT: 'test', DB: db } as unknown as Env
    const request = new Request('https://bhoopal.test/api/chat', {
      method: 'POST',
      body: JSON.stringify({ lang: 'te', state: 'Telangana', district: 'Nalgonda', messages: [{ role: 'user', text: 'How do I make compost at home?' }] }),
    })
    await (await handleChat(request, env, ctx, '9876543210')).text()
    await settled()
    const saved = calls.filter((c) => c.sql.startsWith('INSERT INTO transcripts'))
    expect(saved).toHaveLength(1)
    expect(saved[0].params).toEqual([
      expect.any(Number),
      'chat',
      '9876543210',
      expect.any(String),
      'te',
      'Telangana',
      'Nalgonda',
      'model-t',
      'answered',
      'How do I make compost at home?',
      'Mix dry leaves and dung. Turn it weekly. 🌱',
      expect.any(Number),
    ])
  })

  test('a photo check gets an id, and its note and result are kept without the photo', async () => {
    const result = {
      is_plant_image: true,
      image_quality: 'good',
      crop: 'Tomato',
      crop_matches_farmer: true,
      looks_healthy: false,
      summary: 'The leaves show curling.',
      retake_tips: '',
      possible_problems: [
        {
          name: 'Leaf curl virus',
          type: 'disease',
          likelihood: 'high',
          signs: 'Curled yellow leaves',
          safe_steps: ['Remove affected plants'],
          expert_options: '',
        },
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/model-p:generateContent')
          ? Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] }, finishReason: 'STOP' }] })
          : new Response('unexpected', { status: 500 }),
      ),
    )
    const { db, calls } = fakeDb()
    const { ctx, settled } = fakeCtx()
    const env = { GEMINI_API_KEY: 'test', GEMINI_MODELS: 'model-p', USER_AGENT: 'test', DB: db } as unknown as Env
    const request = new Request('https://bhoopal.test/api/diagnose', {
      method: 'POST',
      body: JSON.stringify({ image: 'AAAA', mimeType: 'image/jpeg', lang: 'te', state: 'Telangana', crop: 'Tomato', note: 'leaves curling since Monday' }),
    })
    const res = await handleDiagnose(request, env, ctx, '9876543210')
    expect(res.status).toBe(200)
    const body = (await res.json()) as DiagnoseResult
    expect(body.id).toMatch(/^[0-9a-f]{8}$/)
    expect(body.summary).toBe('The leaves show curling.')
    await settled()
    const saved = calls.filter((c) => c.sql.startsWith('INSERT INTO transcripts'))
    expect(saved).toHaveLength(1)
    const [, kind, phone, qid, lang, state, , model, outcome, question, answer] = saved[0].params
    expect([kind, phone, qid, lang, state, model, outcome]).toEqual(['photo', '9876543210', body.id, 'te', 'Telangana', 'model-p', 'answered'])
    expect(question).toBe('Crop: Tomato. leaves curling since Monday')
    expect(answer).toBe('Crop: Tomato\nThe leaves show curling.\n• Leaf curl virus [high]: Curled yellow leaves')
    expect(JSON.stringify(saved[0].params)).not.toContain('AAAA')
  })

  test('thumbs down from the app is attached to the kept answer', async () => {
    const { db, calls } = fakeDb()
    const { ctx, settled } = fakeCtx()
    const env = { DB: db, DATA_LIMITER: { limit: async () => ({ success: true }) } } as unknown as Env
    const request = new Request('https://bhoopal.test/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'chat', vote: 'down', id: 'k3j9x', model: 'model-t', lang: 'te' }),
    })
    const before = Date.now()
    expect((await worker.fetch(request as Parameters<typeof worker.fetch>[0], env, ctx)).status).toBe(204)
    await settled()
    const vote = calls.find((c) => c.sql.startsWith('UPDATE transcripts SET vote'))!
    expect(vote.params.slice(0, 3)).toEqual(['down', 'chat', 'k3j9x'])
    expect(vote.params[3] as number).toBeGreaterThanOrEqual(before - 7 * DAY_MS)
    expect(vote.params[3] as number).toBeLessThanOrEqual(Date.now() - 7 * DAY_MS)
  })

  test('a vote without an answer id (older app bundles) is counted but attached to nothing', async () => {
    const { db, calls } = fakeDb()
    const { ctx, settled } = fakeCtx()
    const env = { DB: db, DATA_LIMITER: { limit: async () => ({ success: true }) } } as unknown as Env
    const request = new Request('https://bhoopal.test/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'photo', vote: 'up', lang: 'te' }),
    })
    expect((await worker.fetch(request as Parameters<typeof worker.fetch>[0], env, ctx)).status).toBe(204)
    await settled()
    expect(calls).toEqual([])
  })
})

describe('GET /api/admin/answers', () => {
  const get = (query = '') => new Request(`https://bhoopal.test/api/admin/answers${query}`, { headers: bearer })
  const row = (id: number) => ({
    id,
    created: 1_700_000_000_000 + id,
    kind: 'chat',
    phone: '9876543210',
    lang: 'te',
    state: 'Telangana',
    district: null,
    model: 'model-t',
    outcome: 'answered',
    question: 'q',
    answer: 'a',
    vote: null,
    ms: 1200,
  })

  test('404 without a secret, 401 with the wrong one', async () => {
    const { db } = fakeDb()
    expect((await handleAdminAnswers(get(), { DB: db } as Env)).status).toBe(404)
    const wrong = new Request('https://bhoopal.test/api/admin/answers', { headers: { authorization: 'Bearer another-long-token-that-is-not-right' } })
    expect((await handleAdminAnswers(wrong, { DB: db, ADMIN_TOKEN: TOKEN } as Env)).status).toBe(401)
  })

  test('one page, newest first, no filters', async () => {
    const { db, calls } = fakeDb(() => [row(2), row(1)])
    const res = await handleAdminAnswers(get(), { DB: db, ADMIN_TOKEN: TOKEN } as Env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as AdminAnswers
    expect(body.rows.map((r) => r.id)).toEqual([2, 1])
    expect(body.more).toBe(false)
    expect(calls[0].sql).toBe(
      'SELECT id, created, kind, phone, lang, state, district, model, outcome, question, answer, vote, ms FROM transcripts ORDER BY created DESC, id DESC LIMIT ?',
    )
    expect(calls[0].params).toEqual([51])
  })

  test('filters, an escaped search phrase and the next page', async () => {
    const { db, calls } = fakeDb(() => [row(3), row(2), row(1)])
    const res = await handleAdminAnswers(get('?kind=photo&vote=down&lang=te&q=50%25_x&before=1700000000005&limit=2'), { DB: db, ADMIN_TOKEN: TOKEN } as Env)
    const body = (await res.json()) as AdminAnswers
    expect(body.rows.map((r) => r.id)).toEqual([3, 2])
    expect(body.more).toBe(true)
    expect(calls[0].sql).toContain(
      "WHERE kind = ? AND vote = ? AND lang = ? AND (question LIKE ? ESCAPE '\\' OR answer LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\') AND created < ? ORDER BY created DESC",
    )
    expect(calls[0].params).toEqual(['photo', 'down', 'te', '%50\\%\\_x%', '%50\\%\\_x%', '%50\\%\\_x%', 1700000000005, 3])
  })

  test('unknown filter values are ignored and the page size is capped', async () => {
    const { db, calls } = fakeDb()
    const res = await handleAdminAnswers(get('?kind=video&vote=maybe&lang=xx&before=-1&limit=999'), { DB: db, ADMIN_TOKEN: TOKEN } as Env)
    expect(((await res.json()) as AdminAnswers).rows).toEqual([])
    expect(calls[0].sql).not.toContain('WHERE')
    expect(calls[0].params).toEqual([201])
  })
})

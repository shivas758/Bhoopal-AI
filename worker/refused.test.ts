import { afterEach, expect, test, vi } from 'vitest'
import type { ChatEvent } from '../shared/types'
import { BACKUP_MODEL } from './backupAi'
import { handleChat } from './chat'

// Its own file: the "refused here" pause is module state, as it is per isolate in production.

const sse = (...events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join('')
const text = (t: string, finishReason?: string) => ({ candidates: [{ content: { parts: [{ text: t }] }, ...(finishReason ? { finishReason } : {}) }] })
// What Gemini answers when the Worker runs somewhere the API isn't offered (seen from Cloudflare's Hong Kong).
const REFUSED = () =>
  Response.json({ error: { code: 400, message: 'User location is not supported for the API use.', status: 'FAILED_PRECONDITION' } }, { status: 400 })

afterEach(() => vi.unstubAllGlobals())

async function chat(gemini: Record<string, () => Response>) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const model = Object.keys(gemini).find((m) => String(input).includes(`/${m}:`))
      if (!model) return new Response('unexpected', { status: 500 })
      calls.push(model)
      return gemini[model]()
    }),
  )
  const backup = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode('data: {"response":"Mix dry leaves and dung. 🌱"}\n\ndata: [DONE]\n\n'))
      c.close()
    },
  })
  const env = {
    GEMINI_API_KEY: 'test',
    GEMINI_MODELS: Object.keys(gemini).join(','),
    USER_AGENT: 'test',
    AI: { run: async () => backup },
  } as unknown as Env
  const waits: Promise<unknown>[] = []
  const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} } as unknown as ExecutionContext
  const request = new Request('https://bhoopal.test/api/chat', {
    method: 'POST',
    body: JSON.stringify({ lang: 'en', messages: [{ role: 'user', text: 'How do I make compost at home?' }] }),
  })
  const body = await (await handleChat(request, env, ctx)).text()
  await Promise.all(waits)
  const events = body
    .split('\n\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => JSON.parse(l.slice(5)) as ChatEvent)
  return { calls, events }
}

const answer = (events: ChatEvent[]) => events.map((e) => (e.type === 'text' ? e.text : '')).join('')

test('one model refusing is about that model: the next one answers', async () => {
  const { calls, events } = await chat({ 'model-a': REFUSED, 'model-b': () => new Response(sse(text('Mix dry leaves and dung.', 'STOP'))) })
  expect(calls).toEqual(['model-a', 'model-b'])
  expect(events.find((e) => e.type === 'meta')).toMatchObject({ model: 'model-b' })
  expect(events.at(-1)?.type).toBe('done')
})

test('every model refusing this location: the backup model answers instead of an error', async () => {
  const { calls, events } = await chat({ 'model-c': REFUSED, 'model-d': REFUSED })
  expect(calls).toEqual(['model-c', 'model-d'])
  expect(events.find((e) => e.type === 'meta')).toMatchObject({ model: BACKUP_MODEL })
  expect(answer(events)).toBe('Mix dry leaves and dung. 🌱')
  expect(events.map((e) => e.type)).not.toContain('error')
  expect(events.at(-1)?.type).toBe('done')
})

test('right after, Gemini is not asked again: straight to the backup model', async () => {
  const { calls, events } = await chat({ 'model-c': REFUSED, 'model-d': REFUSED })
  expect(calls).toEqual([])
  expect(events.find((e) => e.type === 'meta')).toMatchObject({ model: BACKUP_MODEL })
  expect(events.at(-1)?.type).toBe('done')
})

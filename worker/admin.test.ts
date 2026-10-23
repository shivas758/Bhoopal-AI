import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { AdminStats } from '../shared/types'
import { handleAdminStats, isAdmin } from './admin'
import { noteActivity } from './store'

const TOKEN = 'a-long-random-admin-token-for-tests-0001'
const DAY_MS = 86400_000
// 15:30 IST on 23 Oct 2026.
const NOW = Date.parse('2026-10-23T10:00:00Z')
const dayNum = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS)

type Row = Record<string, unknown>

/** A D1 that answers worker/admin.ts's statements from canned rows, chosen by what the SQL says. */
function fakeStore(rows: Partial<Record<'totals' | 'signups' | 'activity' | 'lastActive' | 'users' | 'byState' | 'byLang', Row[]>> = {}) {
  const pick = (sql: string): Row[] => {
    if (sql.includes('AS pushSubs')) return rows.totals ?? [{ users: 0, sessions: 0, pushSubs: 0, newToday: 0, new7: 0, new30: 0 }]
    if (sql.includes('date(created')) return rows.signups ?? []
    if (sql.includes('max(day) AS last')) return rows.lastActive ?? []
    if (sql.includes('LEFT JOIN activity')) return rows.users ?? []
    if (sql.includes('GROUP BY state')) return rows.byState ?? []
    if (sql.includes('GROUP BY lang')) return rows.byLang ?? []
    if (sql.includes('FROM activity WHERE day >= ? GROUP BY day')) return rows.activity ?? []
    throw new Error(`unexpected SQL: ${sql}`)
  }
  const calls: { sql: string; params: unknown[] }[] = []
  const statement = (sql: string, params: unknown[] = []) => ({
    sql,
    params,
    bind: (...p: unknown[]) => statement(sql, p),
  })
  const db = {
    prepare: (sql: string) => statement(sql),
    async batch(statements: ReturnType<typeof statement>[]) {
      calls.push(...statements)
      return statements.map((s) => ({ success: true, results: pick(s.sql) }))
    },
  }
  return { db: db as unknown as D1Database, calls }
}

const get = (path: string, headers: Record<string, string> = {}) => new Request(`https://bhoopal.test${path}`, { headers })
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the owner token', () => {
  test('matches only the configured secret', async () => {
    const env = { ADMIN_TOKEN: TOKEN } as Env
    expect(await isAdmin(get('/api/admin/stats', bearer(TOKEN)), env)).toBe(true)
    expect(await isAdmin(get('/api/admin/stats', bearer(`${TOKEN}x`)), env)).toBe(false)
    expect(await isAdmin(get('/api/admin/stats', bearer(TOKEN.slice(0, -1))), env)).toBe(false)
    expect(await isAdmin(get('/api/admin/stats'), env)).toBe(false)
    expect(await isAdmin(get('/api/admin/stats', { authorization: TOKEN }), env)).toBe(false)
  })
  test('a base64 token (openssl rand -base64 32) with +, / and = works', async () => {
    const base64 = 'Qk/hoo+Pal+token/with+slashes+and+plus=='
    const env = { ADMIN_TOKEN: base64 } as Env
    expect(await isAdmin(get('/api/admin/stats', bearer(base64)), env)).toBe(true)
    expect(await isAdmin(get('/api/admin/stats', bearer(base64.replace('+', '-'))), env)).toBe(false)
  })
  test('a short or missing secret never opens the page', async () => {
    expect(await isAdmin(get('/api/admin/stats', bearer('short-secret-is-bad!')), { ADMIN_TOKEN: 'short-secret-is-bad!' } as Env)).toBe(false)
    expect(await isAdmin(get('/api/admin/stats', bearer(TOKEN)), {} as Env)).toBe(false)
  })
  test('the route is a 404 without a secret and a 401 with the wrong one', async () => {
    const { db } = fakeStore()
    expect((await handleAdminStats(get('/api/admin/stats', bearer(TOKEN)), { DB: db } as Env)).status).toBe(404)
    const wrong = await handleAdminStats(get('/api/admin/stats', bearer('another-long-token-that-is-not-right')), { DB: db, ADMIN_TOKEN: TOKEN } as Env)
    expect(wrong.status).toBe(401)
    expect(await wrong.json()).toEqual({ error: 'unauthorized' })
  })
})

describe('the numbers', () => {
  test('a zero-filled window in India dates, with the store rows placed on their days', async () => {
    const { db, calls } = fakeStore({
      totals: [{ users: 12, sessions: 9, pushSubs: 3, newToday: 1, new7: 4, new30: 10 }],
      signups: [
        { day: '2026-10-23', n: 1 },
        { day: '2026-10-20', n: 3 },
        { day: '2026-09-01', n: 99 }, // outside the window: ignored
      ],
      activity: [{ day: '2026-10-22', active: 5, opens: 7, logins: 1, chats: 9, photos: 2 }],
      lastActive: [
        { phone: '9000000001', last: '2026-10-23' },
        { phone: '9000000002', last: '2026-10-18' },
        { phone: '9000000003', last: '2026-10-01' },
      ],
      users: [{ phone: '9000000001', created: NOW - 3 * DAY_MS, lastSeen: NOW, opens: 7, logins: 1, chats: 9, photos: 2, activeDays: 1 }],
      byState: [{ state: 'Telangana', n: 2 }],
      byLang: [{ lang: 'te', n: 3 }],
    })
    const res = await handleAdminStats(get('/api/admin/stats?days=7', bearer(TOKEN)), { DB: db, ADMIN_TOKEN: TOKEN } as Env)
    expect(res.status).toBe(200)
    const stats = (await res.json()) as AdminStats

    expect(stats.days).toBe(7)
    expect(stats.generated).toBe(NOW)
    expect(stats.daily.map((d) => d.day)).toEqual(['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'])
    expect(stats.daily.map((d) => d.signups)).toEqual([0, 0, 0, 3, 0, 0, 1])
    expect(stats.daily[5]).toEqual({ day: '2026-10-22', signups: 0, active: 5, opens: 7, logins: 1, chats: 9, photos: 2 })
    expect(stats.daily[6].active).toBe(0)

    expect(stats.totals).toEqual({ users: 12, sessions: 9, pushSubs: 3, newToday: 1, new7: 4, new30: 10, activeToday: 1, active7: 2, active30: 3 })
    expect(stats.users).toHaveLength(1)
    expect(stats.push).toEqual({ byState: [{ state: 'Telangana', n: 2 }], byLang: [{ lang: 'te', n: 3 }] })
    // Without CF_ANALYTICS_TOKEN the AI section is left out, not empty.
    expect(stats.ai).toBeUndefined()

    // The window starts at the first India date, as a date for activity and as a moment for users.created.
    const activity = calls.find((c) => c.sql.includes('FROM activity WHERE day >= ? GROUP BY day'))!
    expect(activity.params).toEqual(['2026-10-17'])
    const signups = calls.find((c) => c.sql.includes('date(created'))!
    expect(signups.params).toEqual([Date.parse('2026-10-17T00:00:00+05:30')])
  })

  test('days outside 1..90 are clamped, and nonsense means 30', async () => {
    const env = { DB: fakeStore().db, ADMIN_TOKEN: TOKEN } as Env
    for (const [query, days] of [
      ['?days=500', 90],
      ['?days=0', 1],
      ['?days=abc', 30],
      ['', 30],
    ] as const) {
      const stats = (await (await handleAdminStats(get(`/api/admin/stats${query}`, bearer(TOKEN)), env)).json()) as AdminStats
      expect(stats.daily, query).toHaveLength(days)
    }
  })
})

describe('the AI section (Analytics Engine)', () => {
  const env = (extra: Partial<Env> = {}) =>
    ({
      DB: fakeStore().db,
      ADMIN_TOKEN: TOKEN,
      CF_ANALYTICS_TOKEN: 'cf-token',
      CF_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
      STATS_DATASET: 'bhoopal_events',
      ...extra,
    }) as Env

  test('asks the SQL API for the window and reads its JSON (big numbers come as strings)', async () => {
    const sqls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const sql = String(init.body)
        sqls.push(sql)
        expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/analytics_engine/sql')
        expect((init.headers as Record<string, string>).authorization).toBe('Bearer cf-token')
        const data = sql.includes('AS dayNum')
          ? [
              { kind: 'chat', outcome: 'answered', dayNum: dayNum(2026, 10, 23), n: '7' },
              { kind: 'chat', outcome: 'cached', dayNum: dayNum(2026, 10, 23), n: 2 },
              { kind: 'chat', outcome: 'daily_limit', dayNum: dayNum(2026, 10, 22), n: '1' },
              { kind: 'photo', outcome: 'answered', dayNum: dayNum(2026, 10, 22), n: 3 },
              { kind: 'feedback', outcome: 'down', dayNum: dayNum(2026, 10, 22), n: 1 },
              { kind: 'chat', outcome: 'answered', dayNum: dayNum(2026, 10, 1), n: 50 }, // before the window
            ]
          : sql.includes('AS model')
            ? [{ model: 'gemini-3.6-flash', outcome: 'answered', n: '7', ms: '4321.9' }]
            : sql.includes('AS lang')
              ? [{ kind: 'chat', lang: 'te', n: 9 }]
              : [{ kind: 'chat', state: 'Telangana', n: 9 }]
        return new Response(JSON.stringify({ meta: [], data, rows: data.length }))
      }),
    )
    const stats = (await (await handleAdminStats(get('/api/admin/stats?days=7', bearer(TOKEN)), env())).json()) as AdminStats
    expect(sqls).toHaveLength(4)
    for (const sql of sqls) {
      expect(sql).toContain('FROM bhoopal_events')
      expect(sql).toContain("INTERVAL '7' DAY")
      expect(sql).toContain('SUM(_sample_interval)')
    }
    expect(stats.ai?.error).toBeUndefined()
    expect(stats.ai?.daily).toEqual([
      { day: '2026-10-22', chats: 1, photos: 3, answered: 3, failed: 1, up: 0, down: 1 },
      { day: '2026-10-23', chats: 9, photos: 0, answered: 9, failed: 0, up: 0, down: 0 },
    ])
    expect(stats.ai?.outcomes).toEqual([
      { kind: 'chat', outcome: 'answered', n: 7 },
      { kind: 'chat', outcome: 'cached', n: 2 },
      { kind: 'chat', outcome: 'daily_limit', n: 1 },
      { kind: 'feedback', outcome: 'down', n: 1 },
      { kind: 'photo', outcome: 'answered', n: 3 },
    ])
    expect(stats.ai?.models).toEqual([{ model: 'gemini-3.6-flash', outcome: 'answered', n: 7, ms: 4322 }])
    expect(stats.ai?.langs).toEqual([{ kind: 'chat', lang: 'te', n: 9 }])
    expect(stats.ai?.states).toEqual([{ kind: 'chat', state: 'Telangana', n: 9 }])
  })

  test('a failing SQL API leaves the rest of the page working', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"errors":[{"message":"Authentication error"}]}', { status: 401 })),
    )
    const res = await handleAdminStats(get('/api/admin/stats', bearer(TOKEN)), env())
    expect(res.status).toBe(200)
    const stats = (await res.json()) as AdminStats
    expect(stats.ai?.error).toContain('Analytics Engine 401')
    expect(stats.ai?.daily).toEqual([])
    expect(stats.totals.users).toBe(0)
  })

  test('refuses to build SQL from a bad dataset name or account id', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const stats = (await (
      await handleAdminStats(get('/api/admin/stats', bearer(TOKEN)), env({ STATS_DATASET: 'events; DROP' } as unknown as Partial<Env>))
    ).json()) as AdminStats
    expect(stats.ai?.error).toContain('STATS_DATASET')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('activity rows', () => {
  test('count one use on the India date and mark the account seen, in one round trip', async () => {
    const { db, calls } = fakeStore()
    // 19:30 UTC is already the next day in India.
    const at = Date.parse('2026-10-23T19:30:00Z')
    await noteActivity(db, '9876543210', 'chats', at)
    expect(calls).toHaveLength(2)
    expect(calls[0].sql).toContain('INSERT INTO activity (day, phone, chats) VALUES (?, ?, 1) ON CONFLICT (day, phone) DO UPDATE SET chats = chats + 1')
    expect(calls[0].params).toEqual(['2026-10-24', '9876543210'])
    expect(calls[1].sql).toBe('UPDATE users SET last_seen = ? WHERE phone = ?')
    expect(calls[1].params).toEqual([at, '9876543210'])
  })
  test('a missing store is fine', async () => {
    await expect(noteActivity(undefined, '9876543210', 'opens')).resolves.toBeUndefined()
  })
})

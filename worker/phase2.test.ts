import { describe, expect, test } from 'vitest'
import { budgetDay, limitsFrom, spendDailyBudget } from './budget'
import { answerHash } from './chat'
import { trend7d } from './prices'
import { saveSnapshot, spend, type SnapshotRow } from './store'
import { cached } from './util'

/** Just enough of D1 for these tests: records statements, answers from a callback. */
function fakeDb(answer: (sql: string, params: unknown[]) => unknown = () => null) {
  const batches: { sql: string; params: unknown[] }[][] = []
  const statement = (sql: string, params: unknown[] = []) => ({
    sql,
    params,
    bind: (...p: unknown[]) => statement(sql, p),
    first: async () => answer(sql, params),
    run: async () => ({ success: true }),
    all: async () => ({ results: (answer(sql, params) as unknown[]) ?? [] }),
  })
  const db = {
    prepare: (sql: string) => statement(sql),
    batch: async (stmts: ReturnType<typeof statement>[]) => {
      batches.push(stmts.map((s) => ({ sql: s.sql, params: s.params })))
      return stmts.map((s) => ({ results: [answer(s.sql, s.params)].filter(Boolean) }))
    },
  }
  return { db: db as unknown as D1Database, batches }
}

test('trend7d: typical price per day, oldest first; needs two days', () => {
  const rows = [
    { date: '2026-10-11', modal: 2000 },
    { date: '2026-10-12', modal: 2100 },
    { date: '2026-10-12', modal: 2300 },
    { date: '2026-10-11', modal: 2200 },
  ]
  expect(trend7d(rows)).toEqual([
    { date: '2026-10-11', typicalPrice: 2100, mandis: 2 },
    { date: '2026-10-12', typicalPrice: 2200, mandis: 2 },
  ])
  expect(trend7d(rows.filter((r) => r.date === '2026-10-12'))).toBeUndefined()
})

test('budget day follows California, where the Gemini quota resets', () => {
  expect(budgetDay(Date.parse('2026-10-12T05:00:00Z'))).toBe('2026-10-11') // 10:30 AM IST: before the reset
  expect(budgetDay(Date.parse('2026-10-12T08:00:00Z'))).toBe('2026-10-12') // 1:30 PM IST: after it
})

test('limits: wrangler.jsonc values override the defaults', () => {
  expect(limitsFrom({ DAILY_LIMITS: { chatPerDevice: 3 } } as unknown as Env)).toMatchObject({ chatPerDevice: 3, chatPerIp: 40 })
})

describe('answer cache key', () => {
  const at = new Date(Date.parse('2026-10-12T09:00:00Z') + 5.5 * 3600_000)
  const base = { lang: 'te' as const, district: 'Warangal', crops: ['Cotton', 'Paddy'] }
  test('ignores crop order, case and spacing', async () => {
    expect(await answerHash(base, 'Telangana', 'How to grow Paddy?', at)).toBe(
      await answerHash({ ...base, crops: ['Paddy', 'Cotton'] }, 'Telangana', '  how to grow   paddy? ', at),
    )
  })
  test('differs by question, place, language and part of the day', async () => {
    const key = await answerHash(base, 'Telangana', 'How to grow paddy?', at)
    expect(await answerHash(base, 'Telangana', 'How to grow cotton?', at)).not.toBe(key)
    expect(await answerHash(base, 'Karnataka', 'How to grow paddy?', at)).not.toBe(key)
    expect(await answerHash({ ...base, lang: 'hi' }, 'Telangana', 'How to grow paddy?', at)).not.toBe(key)
    expect(await answerHash(base, 'Telangana', 'How to grow paddy?', new Date(at.getTime() + 6 * 3600_000))).not.toBe(key)
  })
})

test('snapshot inserts stay within D1’s 100 parameters per statement', async () => {
  const { db, batches } = fakeDb()
  const rows: SnapshotRow[] = Array.from({ length: 30 }, (_, i) => ({
    state: 'Telangana',
    district: 'Warangal',
    market: `M${i}`,
    commodity: 'Tomato',
    date: '2026-10-12',
    modal: 1000 + i,
    unit: 'Rs./Quintal',
  }))
  expect(await saveSnapshot(db, rows)).toBe(30)
  expect(batches).toHaveLength(1)
  expect(batches[0]).toHaveLength(3)
  expect(Math.max(...batches[0].map((s) => s.params.length))).toBeLessThanOrEqual(100)
  expect(batches[0].flatMap((s) => s.params)).toHaveLength(30 * 7)
})

describe('daily budgets', () => {
  test('spend returns the new count of every scope in one batch', async () => {
    const { db, batches } = fakeDb((_, params) => ({ calls: params[1] === 'chat:all' ? 7 : 2 }))
    expect(await spend(db, '2026-10-12', ['chat:all', 'chat:dev:x'])).toEqual([7, 2])
    expect(batches).toHaveLength(1)
  })
  test('the first scope over its limit is reported, with the reset time', async () => {
    const { db } = fakeDb((_, params) => ({ calls: String(params[1]).includes(':dev:') ? 26 : 1 }))
    const env = { DB: db, DAILY_LIMITS: { chatPerDevice: 25 } } as unknown as Env
    const request = new Request('https://x/api/chat', { headers: { 'x-bhoopal-device': 'phone-1234', 'cf-connecting-ip': '1.2.3.4' } })
    const result = await spendDailyBudget(env, 'chat', request)
    expect(result).toMatchObject({ ok: false, scope: 'device' })
    expect(result.retryAt).toBeGreaterThan(Date.now())
  })
  test('without the store, nothing is blocked', async () => {
    expect(await spendDailyBudget({} as Env, 'photo', new Request('https://x'))).toEqual({ ok: true })
  })
})

test('cached(): a value in the shared store means no upstream call', async () => {
  const { db } = fakeDb((sql) => (sql.startsWith('SELECT json') ? { json: JSON.stringify({ from: 'store' }) } : null))
  let loads = 0
  const value = await cached(
    `test:${Math.random()}`,
    60,
    async () => {
      loads++
      return { from: 'upstream' }
    },
    { shared: db },
  )
  expect(value).toEqual({ from: 'store' })
  expect(loads).toBe(0)
})

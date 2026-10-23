// The shared store (D1). Everything here is best-effort: if D1 is missing, not migrated or slow, the
// Worker falls back to per-isolate memory and keeps answering farmers.

type Db = D1Database | undefined

async function safely<T>(what: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    console.warn(`store: ${what} failed: ${err instanceof Error ? err.message : String(err)}`)
    return fallback
  }
}

// ---- cache ------------------------------------------------------------------------------------------

export function readCache<T>(db: Db, key: string, now = Date.now()): Promise<T | undefined> {
  if (!db) return Promise.resolve(undefined)
  return safely('cache read', undefined, async () => {
    const row = await db.prepare('SELECT json FROM cache WHERE key = ? AND expires > ?').bind(key, now).first<{ json: string }>()
    return row ? (JSON.parse(row.json) as T) : undefined
  })
}

export function writeCache(db: Db, key: string, value: unknown, expires: number): Promise<void> {
  if (!db) return Promise.resolve()
  return safely('cache write', undefined, async () => {
    await db.prepare('INSERT OR REPLACE INTO cache (key, expires, json) VALUES (?, ?, ?)').bind(key, expires, JSON.stringify(value)).run()
  })
}

// ---- resting services (Gemini models out of quota, data.gov.in down) --------------------------------

/** Services resting until a time in the future: { service: until }. */
export function readResting(db: Db, now = Date.now()): Promise<Record<string, number>> {
  if (!db) return Promise.resolve({})
  return safely('resting read', {}, async () => {
    const { results } = await db.prepare('SELECT service, until FROM resting WHERE until > ?').bind(now).all<{ service: string; until: number }>()
    return Object.fromEntries(results.map((r) => [r.service, r.until]))
  })
}

export function writeResting(db: Db, service: string, until: number): Promise<void> {
  if (!db) return Promise.resolve()
  return safely('resting write', undefined, async () => {
    await db.prepare('INSERT OR REPLACE INTO resting (service, until) VALUES (?, ?)').bind(service, until).run()
  })
}

// Read at most every 30 s per isolate: one D1 query, shared by all the requests an isolate handles.
const RESTING_REFRESH_MS = 30_000
let restingSnapshot: { at: number; map: Record<string, number> } | undefined

/** What every isolate knows is resting (out of quota, down), refreshed every 30 s. */
export async function restingNow(db: Db): Promise<Record<string, number>> {
  const now = Date.now()
  if (restingSnapshot && now - restingSnapshot.at < RESTING_REFRESH_MS) return restingSnapshot.map
  const map = await readResting(db, now)
  restingSnapshot = { at: now, map }
  return map
}

/** Marks a service as resting until `until`, for this isolate at once and for the others within ~30 s. */
export async function rest(db: Db, service: string, until: number) {
  if (restingSnapshot) restingSnapshot.map[service] = until
  await writeResting(db, service, until)
}

// ---- daily budgets ------------------------------------------------------------------------------------

/**
 * Adds one use to each scope for `day` and returns the new counts, in order. One round trip (a batch).
 * Undefined when the store is unavailable: then no daily limit is enforced (the rate limits still are).
 */
export function spend(db: Db, day: string, scopes: string[]): Promise<number[] | undefined> {
  if (!db || !scopes.length) return Promise.resolve(undefined)
  return safely('budget', undefined, async () => {
    const stmt = db.prepare('INSERT INTO budget (day, scope, calls) VALUES (?, ?, 1) ON CONFLICT (day, scope) DO UPDATE SET calls = calls + 1 RETURNING calls')
    const results = await db.batch<{ calls: number }>(scopes.map((s) => stmt.bind(day, s)))
    return results.map((r) => r.results[0]?.calls ?? 0)
  })
}

// ---- activity per account (the owner's analytics page, worker/admin.ts) -----------------------------------

export type ActivityKind = 'opens' | 'logins' | 'chats' | 'photos'
const ACTIVITY_KINDS: ReadonlySet<string> = new Set<ActivityKind>(['opens', 'logins', 'chats', 'photos'])

/**
 * Counts one use of the account on today's India date and marks the account seen. Counts only, never what was
 * asked. Best effort and one round trip: a slow store must not hold a farmer's answer back.
 */
export function noteActivity(db: Db, phone: string, kind: ActivityKind, now = Date.now()): Promise<void> {
  if (!db || !ACTIVITY_KINDS.has(kind)) return Promise.resolve()
  const day = new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10)
  return safely('activity', undefined, async () => {
    await db.batch([
      db.prepare(`INSERT INTO activity (day, phone, ${kind}) VALUES (?, ?, 1) ON CONFLICT (day, phone) DO UPDATE SET ${kind} = ${kind} + 1`).bind(day, phone),
      db.prepare('UPDATE users SET last_seen = ? WHERE phone = ?').bind(now, phone),
    ])
  })
}

// ---- answer cache -------------------------------------------------------------------------------------

export function readAnswer(db: Db, hash: string): Promise<{ text: string; model: string | null } | undefined> {
  if (!db) return Promise.resolve(undefined)
  return safely(
    'answer read',
    undefined,
    async () => (await db.prepare('SELECT text, model FROM answers WHERE hash = ?').bind(hash).first<{ text: string; model: string | null }>()) ?? undefined,
  )
}

export function writeAnswer(db: Db, hash: string, text: string, model: string): Promise<void> {
  if (!db) return Promise.resolve()
  return safely('answer write', undefined, async () => {
    await db.prepare('INSERT OR REPLACE INTO answers (hash, text, model, created) VALUES (?, ?, ?, ?)').bind(hash, text, model, Date.now()).run()
  })
}

// ---- price snapshots ------------------------------------------------------------------------------------

export interface SnapshotRow {
  state: string
  district: string
  market: string
  commodity: string
  date: string
  modal: number
  unit: string
}

// D1 allows 100 bound parameters per statement: 7 columns x 14 rows = 98.
const ROWS_PER_INSERT = 14

export function saveSnapshot(db: Db, rows: SnapshotRow[]): Promise<number> {
  if (!db || !rows.length) return Promise.resolve(0)
  return safely('snapshot write', 0, async () => {
    const statements: D1PreparedStatement[] = []
    for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
      const chunk = rows.slice(i, i + ROWS_PER_INSERT)
      const sql = `INSERT OR REPLACE INTO prices (state, district, market, commodity, date, modal, unit) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')}`
      statements.push(db.prepare(sql).bind(...chunk.flatMap((r) => [r.state, r.district, r.market, r.commodity, r.date, r.modal, r.unit])))
    }
    await db.batch(statements)
    return rows.length
  })
}

/**
 * Saved snapshot rows for one state since `fromDate`, for these Agmarknet commodity names (all commodities when
 * the names aren't known, e.g. because Agmarknet's list is down; the caller filters).
 */
export function readSnapshot(db: Db, state: string, commodities: string[] | undefined, fromDate: string): Promise<SnapshotRow[]> {
  if (!db || commodities?.length === 0) return Promise.resolve([])
  return safely('snapshot read', [], async () => {
    const names = commodities?.slice(0, 50)
    const { results } = await db
      .prepare(
        `SELECT state, district, market, commodity, date, modal, unit FROM prices WHERE state = ? AND date >= ?${names ? ` AND commodity IN (${names.map(() => '?').join(', ')})` : ''}`,
      )
      .bind(state, fromDate, ...(names ?? []))
      .all<SnapshotRow>()
    return results
  })
}

// ---- health status --------------------------------------------------------------------------------------

export interface ServiceStatus {
  ok: boolean
  checked: number
  detail?: string
}

export function writeStatus(db: Db, statuses: Record<string, ServiceStatus>): Promise<void> {
  if (!db) return Promise.resolve()
  return safely('status write', undefined, async () => {
    const stmt = db.prepare('INSERT OR REPLACE INTO status (service, ok, checked, detail) VALUES (?, ?, ?, ?)')
    await db.batch(Object.entries(statuses).map(([service, s]) => stmt.bind(service, s.ok ? 1 : 0, s.checked, s.detail ?? null)))
  })
}

export function readStatus(db: Db): Promise<Record<string, ServiceStatus>> {
  if (!db) return Promise.resolve({})
  return safely('status read', {}, async () => {
    const { results } = await db
      .prepare('SELECT service, ok, checked, detail FROM status')
      .all<{ service: string; ok: number; checked: number; detail: string | null }>()
    return Object.fromEntries(results.map((r) => [r.service, { ok: r.ok === 1, checked: r.checked, ...(r.detail ? { detail: r.detail } : {}) }]))
  })
}

// ---- housekeeping (daily cron) ------------------------------------------------------------------------

/** Deletes expired cache rows, old answers and budgets, snapshots older than ~5 weeks and activity older than ~13 months. */
export function cleanUp(db: Db, now = Date.now()): Promise<void> {
  if (!db) return Promise.resolve()
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  return safely('clean-up', undefined, async () => {
    await db.batch([
      db.prepare('DELETE FROM cache WHERE expires < ?').bind(now),
      db.prepare('DELETE FROM resting WHERE until < ?').bind(now),
      db.prepare('DELETE FROM answers WHERE created < ?').bind(now - 2 * 86400_000),
      db.prepare('DELETE FROM budget WHERE day < ?').bind(day(now - 3 * 86400_000)),
      db.prepare('DELETE FROM prices WHERE date < ?').bind(day(now - 35 * 86400_000)),
      db.prepare('DELETE FROM sessions WHERE expires < ?').bind(now),
      db.prepare('DELETE FROM activity WHERE day < ?').bind(day(now - 400 * 86400_000)),
    ])
  })
}

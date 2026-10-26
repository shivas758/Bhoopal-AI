import {
  isLang,
  type AdminAiDay,
  type AdminAiStats,
  type AdminAnswer,
  type AdminAnswers,
  type AdminDay,
  type AdminStats,
  type AdminUser,
} from '../shared/types'
import { apiError, json, sha256Hex } from './util'

// The owner's analytics page (#/admin in the app): accounts, activity and push subscriptions from D1, and the
// AI's outcomes from Analytics Engine. It opens with ADMIN_TOKEN (a long random secret), not with a farmer
// account: "forgot password" has no OTP, so knowing a phone number must not be enough. Without the secret the
// route is a 404, as if it didn't exist.

const DEFAULT_DAYS = 30
// Analytics Engine keeps about 3 months.
const MAX_DAYS = 90
const MAX_USERS = 500
const DEFAULT_ANSWERS = 50
const MAX_ANSWERS = 200
const IST_MS = 5.5 * 3600_000
const DAY_MS = 86400_000
const AE_TIMEOUT_MS = 10_000

/** India date (yyyy-mm-dd) of a moment. */
const indiaDay = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10)
/** Start of an India date, ms since epoch. */
const startOfIndiaDay = (day: string) => Date.parse(`${day}T00:00:00+05:30`)

/** Chat and photo outcomes that gave the farmer an answer (AI, cache, template or the backup AI). */
const ANSWERED = new Set(['answered', 'template', 'cached', 'resting_template', 'backup'])

/** Whether the request carries the owner's token. Compares digests byte by byte, so the time taken says nothing. */
export async function isAdmin(request: Request, env: Env): Promise<boolean> {
  const expected = env.ADMIN_TOKEN
  if (!expected || expected.length < 20) return false
  // Base64 (`openssl rand -base64 32`), base64url and hex tokens are all fine.
  const given = /^Bearer ([\w+/=.~-]{20,200})$/.exec(request.headers.get('authorization') ?? '')?.[1]
  if (!given) return false
  const [a, b] = await Promise.all([sha256Hex(given), sha256Hex(expected)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function handleAdminStats(request: Request, env: Env): Promise<Response> {
  if (!env.ADMIN_TOKEN) return apiError('bad_request', 404)
  if (!(await isAdmin(request, env))) return apiError('unauthorized', 401)
  const raw = new URL(request.url).searchParams.get('days')
  const asked = raw === null ? DEFAULT_DAYS : Number(raw)
  const days = Number.isInteger(asked) ? Math.min(Math.max(asked, 1), MAX_DAYS) : DEFAULT_DAYS
  const now = Date.now()
  const [store, ai] = await Promise.all([readStore(env.DB, days, now), readAi(env, days, now)])
  return json({ generated: now, days, version: env.CF_VERSION_METADATA?.id, ...store, ...(ai ? { ai } : {}) } satisfies AdminStats)
}

/**
 * GET /api/admin/answers: the kept questions and answers (the `transcripts` table, 7 days), newest first.
 * Filters: kind (chat | photo), vote (up | down), lang, q (a phrase in the question or answer); `before` (ms) pages
 * further back and `limit` is at most 200.
 */
export async function handleAdminAnswers(request: Request, env: Env): Promise<Response> {
  if (!env.ADMIN_TOKEN) return apiError('bad_request', 404)
  if (!(await isAdmin(request, env))) return apiError('unauthorized', 401)
  const p = new URL(request.url).searchParams
  const where: string[] = []
  const params: unknown[] = []
  const kind = p.get('kind')
  if (kind === 'chat' || kind === 'photo') {
    where.push('kind = ?')
    params.push(kind)
  }
  const vote = p.get('vote')
  if (vote === 'up' || vote === 'down') {
    where.push('vote = ?')
    params.push(vote)
  }
  const lang = p.get('lang')
  if (lang && isLang(lang)) {
    where.push('lang = ?')
    params.push(lang)
  }
  const q = (p.get('q') ?? '').trim().slice(0, 100)
  if (q) {
    // A phrase, not a pattern: SQL wildcards in it are escaped. LIKE ignores case for ASCII only.
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    where.push("(question LIKE ? ESCAPE '\\' OR answer LIKE ? ESCAPE '\\')")
    params.push(pattern, pattern)
  }
  const before = Number(p.get('before'))
  if (Number.isSafeInteger(before) && before > 0) {
    where.push('created < ?')
    params.push(before)
  }
  const asked = p.get('limit') === null ? DEFAULT_ANSWERS : Number(p.get('limit'))
  const limit = Number.isInteger(asked) ? Math.min(Math.max(asked, 1), MAX_ANSWERS) : DEFAULT_ANSWERS
  const sql = `SELECT id, created, kind, lang, state, district, model, outcome, question, answer, vote, ms FROM transcripts${
    where.length ? ` WHERE ${where.join(' AND ')}` : ''
  } ORDER BY created DESC, id DESC LIMIT ?`
  // One row more than asked says whether there is another page.
  const { results } = await env.DB.prepare(sql)
    .bind(...params, limit + 1)
    .all<AdminAnswer>()
  return json({ generated: Date.now(), rows: results.slice(0, limit), more: results.length > limit } satisfies AdminAnswers)
}

// ---- D1: accounts, activity, push subscriptions -------------------------------------------------------------

interface TotalsRow {
  users: number
  sessions: number
  pushSubs: number
  newToday: number
  new7: number
  new30: number
}
interface DayCount {
  day: string
  n: number
}
interface ActivityRow {
  day: string
  active: number
  opens: number
  logins: number
  chats: number
  photos: number
}

/** The window's days, oldest first, each with zero counts. */
function emptyDays(days: number, now: number): AdminDay[] {
  const out: AdminDay[] = []
  for (let i = days - 1; i >= 0; i--) out.push({ day: indiaDay(now - i * DAY_MS), signups: 0, active: 0, opens: 0, logins: 0, chats: 0, photos: 0 })
  return out
}

async function readStore(db: D1Database, days: number, now: number): Promise<Pick<AdminStats, 'totals' | 'daily' | 'users' | 'push'>> {
  const daily = emptyDays(days, now)
  const from = daily[0].day
  const fromMs = startOfIndiaDay(from)
  // "Last n days" = today and the n-1 days before it, by India dates.
  const since = (n: number) => indiaDay(now - (n - 1) * DAY_MS)
  const results = await db.batch([
    db
      .prepare(
        `SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM sessions WHERE expires > ?) AS sessions,
                (SELECT count(*) FROM push_subs) AS pushSubs, (SELECT count(*) FROM users WHERE created >= ?) AS newToday,
                (SELECT count(*) FROM users WHERE created >= ?) AS new7, (SELECT count(*) FROM users WHERE created >= ?) AS new30`,
      )
      .bind(now, startOfIndiaDay(since(1)), startOfIndiaDay(since(7)), startOfIndiaDay(since(30))),
    db.prepare(`SELECT date(created / 1000 + 19800, 'unixepoch') AS day, count(*) AS n FROM users WHERE created >= ? GROUP BY day`).bind(fromMs),
    db
      .prepare(
        'SELECT day, count(*) AS active, sum(opens) AS opens, sum(logins) AS logins, sum(chats) AS chats, sum(photos) AS photos FROM activity WHERE day >= ? GROUP BY day',
      )
      .bind(from),
    db.prepare('SELECT phone, max(day) AS last FROM activity WHERE day >= ? GROUP BY phone').bind(since(30)),
    db
      .prepare(
        `SELECT u.phone, u.created, u.last_seen AS lastSeen, coalesce(sum(a.opens), 0) AS opens, coalesce(sum(a.logins), 0) AS logins,
                coalesce(sum(a.chats), 0) AS chats, coalesce(sum(a.photos), 0) AS photos, count(a.day) AS activeDays
         FROM users u LEFT JOIN activity a ON a.phone = u.phone AND a.day >= ?
         GROUP BY u.phone ORDER BY u.last_seen IS NULL, u.last_seen DESC, u.created DESC LIMIT ?`,
      )
      .bind(from, MAX_USERS),
    db.prepare(`SELECT coalesce(state, '') AS state, count(*) AS n FROM push_subs GROUP BY state ORDER BY n DESC`),
    db.prepare('SELECT lang, count(*) AS n FROM push_subs GROUP BY lang ORDER BY n DESC'),
  ])
  const rows = <T>(i: number) => (results[i]?.results ?? []) as T[]

  const byDay = new Map(daily.map((d) => [d.day, d]))
  for (const r of rows<DayCount>(1)) {
    const d = byDay.get(r.day)
    if (d) d.signups = r.n
  }
  for (const r of rows<ActivityRow>(2)) {
    const d = byDay.get(r.day)
    if (d) Object.assign(d, { active: r.active, opens: r.opens ?? 0, logins: r.logins ?? 0, chats: r.chats ?? 0, photos: r.photos ?? 0 })
  }

  const lastActive = rows<{ phone: string; last: string }>(3)
  const activeSince = (n: number) => lastActive.filter((r) => r.last >= since(n)).length
  const t = rows<TotalsRow>(0)[0] ?? { users: 0, sessions: 0, pushSubs: 0, newToday: 0, new7: 0, new30: 0 }

  return {
    totals: { ...t, activeToday: activeSince(1), active7: activeSince(7), active30: activeSince(30) },
    daily,
    users: rows<AdminUser>(4),
    push: { byState: rows<{ state: string; n: number }>(5), byLang: rows<{ lang: string; n: number }>(6) },
  }
}

// ---- Analytics Engine: the AI's outcomes ------------------------------------------------------------------

const empty = (error?: string): AdminAiStats => ({ daily: [], outcomes: [], models: [], langs: [], states: [], ...(error ? { error } : {}) })

/** One query to the Analytics Engine SQL API (ClickHouse-like; the response is { meta, data, rows }). */
async function aeQuery<T>(env: Env, sql: string): Promise<T[]> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` },
    body: sql,
    signal: AbortSignal.timeout(AE_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Analytics Engine ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { data?: T[] }
  return body.data ?? []
}

/** Analytics Engine returns big integers as strings in JSON. */
const num = (v: unknown) => Math.round(Number(v) || 0)

async function readAi(env: Env, days: number, now: number): Promise<AdminAiStats | undefined> {
  if (!env.CF_ANALYTICS_TOKEN) return undefined
  const dataset = env.STATS_DATASET ?? ''
  if (!/^[0-9a-f]{32}$/.test(env.CF_ACCOUNT_ID ?? '') || !/^\w+$/.test(dataset)) return empty('CF_ACCOUNT_ID or STATS_DATASET is not set in wrangler.jsonc')
  const since = `timestamp >= NOW() - INTERVAL '${days}' DAY`
  // Events are sampled under load: the sample interval says how many events each row stands for.
  const count = 'SUM(_sample_interval)'
  try {
    const [dailyRows, modelRows, langRows, stateRows] = await Promise.all([
      aeQuery<{ kind: string; outcome: string; dayNum: unknown; n: unknown }>(
        env,
        // Days since 1970 by India time (UTC+5:30 = 19,800 s), the same bucket as the D1 rows.
        `SELECT index1 AS kind, blob1 AS outcome, intDiv(toUInt32(timestamp) + 19800, 86400) AS dayNum, ${count} AS n FROM ${dataset} WHERE ${since} GROUP BY kind, outcome, dayNum`,
      ),
      aeQuery<{ model: string; outcome: string; n: unknown; ms: unknown }>(
        env,
        `SELECT blob2 AS model, blob1 AS outcome, ${count} AS n, SUM(_sample_interval * double3) / ${count} AS ms FROM ${dataset} WHERE ${since} AND index1 = 'chat' GROUP BY model, outcome`,
      ),
      aeQuery<{ kind: string; lang: string; n: unknown }>(
        env,
        `SELECT index1 AS kind, blob4 AS lang, ${count} AS n FROM ${dataset} WHERE ${since} GROUP BY kind, lang`,
      ),
      aeQuery<{ kind: string; state: string; n: unknown }>(
        env,
        `SELECT index1 AS kind, blob5 AS state, ${count} AS n FROM ${dataset} WHERE ${since} GROUP BY kind, state`,
      ),
    ])

    const first = indiaDay(now - (days - 1) * DAY_MS)
    const byDay = new Map<string, AdminAiDay>()
    const outcomes = new Map<string, { kind: string; outcome: string; n: number }>()
    for (const r of dailyRows) {
      const day = new Date(num(r.dayNum) * DAY_MS).toISOString().slice(0, 10)
      const n = num(r.n)
      if (day < first || !n) continue
      let d = byDay.get(day)
      if (!d) byDay.set(day, (d = { day, chats: 0, photos: 0, answered: 0, failed: 0, up: 0, down: 0 }))
      if (r.kind === 'feedback') {
        if (r.outcome === 'up') d.up += n
        else if (r.outcome === 'down') d.down += n
      } else if (r.kind === 'chat' || r.kind === 'photo') {
        d[r.kind === 'chat' ? 'chats' : 'photos'] += n
        d[ANSWERED.has(r.outcome) ? 'answered' : 'failed'] += n
      }
      const key = `${r.kind}\n${r.outcome}`
      const o = outcomes.get(key) ?? { kind: r.kind, outcome: r.outcome, n: 0 }
      o.n += n
      outcomes.set(key, o)
    }
    const desc = <T extends { n: number }>(a: T, b: T) => b.n - a.n
    return {
      daily: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
      outcomes: [...outcomes.values()].sort((a, b) => a.kind.localeCompare(b.kind) || desc(a, b)),
      models: modelRows.map((r) => ({ model: r.model, outcome: r.outcome, n: num(r.n), ms: num(r.ms) })).sort(desc),
      langs: langRows.map((r) => ({ kind: r.kind, lang: r.lang, n: num(r.n) })).sort(desc),
      states: stateRows.map((r) => ({ kind: r.kind, state: r.state, n: num(r.n) })).sort(desc),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`admin: Analytics Engine query failed: ${message}`)
    return empty(message)
  }
}

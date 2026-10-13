import type { ApiErrorBody, ApiErrorCode } from '../shared/types'
import { readCache, writeCache } from './store'

/** JSON response. API data is per-farmer and changes often, so it is not cached unless a route says so. */
export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', ...headers },
  })

export const apiError = (code: ApiErrorCode, status: number, extra: Omit<ApiErrorBody, 'error'> = {}) =>
  json({ error: code, ...extra } satisfies ApiErrorBody, status)

/** Thrown when a free upstream service (data.gov.in, MET Norway, Gemini) fails. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    /** When the service should work again (ms since epoch), e.g. when Gemini's daily free quota resets. */
    readonly retryAt?: number,
  ) {
    super(message)
  }
}

export class BadRequest extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

/** fetch() that reports network failures (refused, timeout, DNS) as an upstream outage, not our bug. */
export async function upstreamFetch(service: string, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (err) {
    throw new UpstreamError(`${service} unreachable: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// Bump whenever the shape of a cached value changes, so a deploy never reads the old shape back.
const CACHE_VERSION = 4
const MAX_MEMORY_ENTRIES = 300

const memory = new Map<string, { expires: number; value: Promise<unknown>; token: object }>()

export interface CacheOptions {
  /**
   * Also keep the value in D1, shared by every Worker isolate. For small values that are slow or rate-limited
   * upstream (Agmarknet filters and rows). Large or very local values (whole-state data.gov.in lists, weather
   * per 5 km cell) stay in memory only.
   */
  shared?: D1Database
}

/**
 * Caches a loader's JSON result: this isolate's memory first, then (optionally) the shared D1 store, then the
 * upstream. Free upstream APIs have tight quotas, so every farmer in a district should share one fetch.
 * `ttl` may depend on the value (e.g. MET Norway's Expires header).
 */
export function cached<T>(key: string, ttl: number | ((value: T) => number), load: () => Promise<T>, opts: CacheOptions = {}): Promise<T> {
  const now = Date.now()
  const hit = memory.get(key)
  if (hit && hit.expires > now) return hit.value as Promise<T>

  const sharedKey = `v${CACHE_VERSION}:${key}`
  // Identifies this load, so a late result never extends a newer entry for the same key.
  const token = {}
  const value = (async () => {
    const stored = await readCache<T>(opts.shared, sharedKey, now)
    if (stored !== undefined) return stored
    const fresh = await load()
    const seconds = typeof ttl === 'number' ? ttl : ttl(fresh)
    const entry = memory.get(key)
    if (entry?.token === token) entry.expires = Date.now() + seconds * 1000
    await writeCache(opts.shared, sharedKey, fresh, Date.now() + seconds * 1000)
    return fresh
  })()

  // Re-inserting moves the key to the end, so the first key is always the least recently stored.
  memory.delete(key)
  if (memory.size >= MAX_MEMORY_ENTRIES) {
    for (const [k, v] of memory) if (v.expires <= now) memory.delete(k)
    if (memory.size >= MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value!)
  }
  // Until the loader finishes, a dynamic TTL isn't known: concurrent callers share this pending promise.
  memory.set(key, { expires: now + (typeof ttl === 'number' ? ttl : 60) * 1000, value, token })
  value.catch(() => {
    if (memory.get(key)?.token === token) memory.delete(key)
  })
  return value
}

/** Inside India's bounding box (incl. Lakshadweep and the Andamans). Also rejects 0,0 from a missing parameter. */
export const inIndia = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= 6 && lat <= 38 && lon >= 68 && lon <= 98

/** Today's date in India, independent of where the Worker runs. Read it with getUTC*() methods. */
export function indiaNow() {
  return new Date(Date.now() + 5.5 * 3600 * 1000)
}

const pacific = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hourCycle: 'h23',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
})

/**
 * Next midnight in California (ms since epoch): when Gemini's free per-day quotas reset (~12:30 or 1:30 PM IST).
 * Google's own retryDelay for daily limits is unreliable, so we compute it.
 */
export function nextPacificMidnight(now = Date.now()) {
  const parts = Object.fromEntries(pacific.formatToParts(now).map((p) => [p.type, p.value]))
  const sinceMidnight = (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000 + (now % 1000)
  // Two minutes' grace so the first request after the reset doesn't land just before it.
  return now - sinceMidnight + 24 * 3600 * 1000 + 2 * 60 * 1000
}

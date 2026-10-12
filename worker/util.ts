import type { ApiErrorBody, ApiErrorCode } from '../shared/types'

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
const CACHE_VERSION = 3
const MAX_MEMORY_ENTRIES = 300

const memory = new Map<string, { expires: number; value: Promise<unknown> }>()

/**
 * Caches a loader's JSON result in this isolate's memory and in the Cloudflare Cache API.
 * Free upstream APIs have tight quotas, so every farmer in a district should share one fetch.
 * (The Cache API is a no-op on *.workers.dev; memory still helps there.)
 */
export function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = memory.get(key)
  if (hit && hit.expires > now) return hit.value as Promise<T>

  const cacheUrl = `https://cache.bhoopal.internal/v${CACHE_VERSION}/${encodeURIComponent(key)}`
  const value = (async () => {
    const stored = await caches.default.match(cacheUrl).catch(() => undefined)
    if (stored) return (await stored.json()) as T
    const fresh = await load()
    const response = new Response(JSON.stringify(fresh), {
      headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttlSeconds}` },
    })
    await caches.default.put(cacheUrl, response).catch(() => {})
    return fresh
  })()

  // Re-inserting moves the key to the end, so the first key is always the least recently stored.
  memory.delete(key)
  if (memory.size >= MAX_MEMORY_ENTRIES) {
    for (const [k, v] of memory) if (v.expires <= now) memory.delete(k)
    if (memory.size >= MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value!)
  }
  memory.set(key, { expires: now + ttlSeconds * 1000, value })
  value.catch(() => memory.delete(key))
  return value
}

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

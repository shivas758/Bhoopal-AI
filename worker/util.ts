import type { ApiErrorCode } from '../shared/types'

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })

export const apiError = (code: ApiErrorCode, status: number) => json({ error: code }, status)

/** Thrown when a free upstream service (data.gov.in, MET Norway, Gemini) fails. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message)
  }
}

export class BadRequest extends Error {}

/** fetch() that reports network failures (refused, timeout, DNS) as an upstream outage, not our bug. */
export async function upstreamFetch(service: string, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (err) {
    throw new UpstreamError(`${service} unreachable: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// Bump whenever the shape of a cached value changes, so a deploy never reads the old shape back.
const CACHE_VERSION = 2

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

  memory.set(key, { expires: now + ttlSeconds * 1000, value })
  value.catch(() => memory.delete(key))
  if (memory.size > 300) memory.delete(memory.keys().next().value!)
  return value
}

/** Today's date in India, independent of where the Worker runs. */
export function indiaNow() {
  return new Date(Date.now() + 5.5 * 3600 * 1000)
}

import { findDistrict } from '../shared/districts'
import { findState } from '../shared/states'
import { isLang, type Lang } from '../shared/types'
import { morningMessage, type PushMessage } from './forecastText'
import { alertsQuickly, type StoredAlert } from './sachet'
import { BadRequest, apiError, b64url, fromB64url, inIndia, indiaNow, json, sha256Hex, utf8 } from './util'

// Web Push without a payload: the cron only wakes the phone, and the app's service worker then asks
// POST /api/push/message what to show. Nothing has to be encrypted per phone, so a cron run (10 ms CPU on the
// free plan) can wake dozens of phones, and the message is always current when it is shown.

// Push services the Worker will call. Never a URL a client made up.
const PUSH_HOSTS = /^(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)$/
// The morning cron runs every minute from 05:30 to 07:29 IST; each run wakes up to this many phones
// (one subrequest each, under the free plan's 50).
const MORNING_BATCH = 40
export const MORNING_CRON = '* 0-1 * * *'
// Capacity is 120 runs x 40 phones a morning; past that, sign-ups are refused rather than left without a message.
const MAX_SUBSCRIBERS = 4000
// At most one warning per phone every 3 hours, each warning once.
const WARNING_GAP_MS = 3 * 3600_000
const MAX_WARNING_PUSHES = 25

interface SubRow {
  id: string
  endpoint: string
  lang: string
  state: string | null
  district: string | null
  lgd: number | null
  lat: number | null
  lon: number | null
  alerts_sent: string
}

/** The VAPID key pair (secret VAPID_PRIVATE_JWK, a P-256 private key as JWK). */
function vapidKeys(env: Env): { jwk: JsonWebKey; publicKey: string } | undefined {
  try {
    const jwk = JSON.parse(String(env.VAPID_PRIVATE_JWK ?? '')) as JsonWebKey
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.x || !jwk.y) return undefined
    // The app subscribes with the uncompressed public point: 0x04 || x || y.
    return { jwk, publicKey: b64url(new Uint8Array([4, ...fromB64url(jwk.x), ...fromB64url(jwk.y)])) }
  } catch {
    return undefined
  }
}

/** RFC 8292 "vapid" Authorization header for one push service (signed once per service per run). */
async function vapidAuthorization(env: Env, origin: string): Promise<string> {
  const keys = vapidKeys(env)
  if (!keys) throw new Error('VAPID_PRIVATE_JWK missing or invalid')
  const key = await crypto.subtle.importKey('jwk', keys.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = b64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64url(utf8(JSON.stringify({ aud: origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: String(env.PUSH_CONTACT) })))
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${header}.${claims}`))
  return `vapid t=${header}.${claims}.${b64url(new Uint8Array(signature))}, k=${keys.publicKey}`
}

export function validEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && PUSH_HOSTS.test(url.hostname)
  } catch {
    return false
  }
}

/** GET /api/push/key: the public key the app subscribes with. */
export function handlePushKey(env: Env): Response {
  const keys = vapidKeys(env)
  return keys ? json({ key: keys.publicKey }, 200, { 'cache-control': 'public, max-age=86400' }) : apiError('not_configured', 503)
}

const GRID = 0.05
const toGrid = (n: number) => Math.round(Math.round(n / GRID) * GRID * 100) / 100

/** POST /api/push/subscribe {endpoint, lang, state?, district?, coords?}: starts (or updates) the alerts. */
export async function handleSubscribe(request: Request, env: Env): Promise<Response> {
  if (!vapidKeys(env)) return apiError('not_configured', 503)
  const body = (await request.json().catch(() => null)) as {
    endpoint?: unknown
    lang?: unknown
    state?: unknown
    district?: unknown
    coords?: { lat?: unknown; lon?: unknown }
  } | null
  if (!body || !validEndpoint(body.endpoint) || !isLang(body.lang)) throw new BadRequest('invalid subscription')
  const state = findState(typeof body.state === 'string' ? body.state : undefined)
  const district = state && typeof body.district === 'string' ? findDistrict(state.id, body.district) : undefined
  const lat = Number(body.coords?.lat)
  const lon = Number(body.coords?.lon)
  const gps = inIndia(lat, lon) ? { lat: toGrid(lat), lon: toGrid(lon) } : undefined
  // Without any place there is nothing to forecast.
  if (!state && !gps) throw new BadRequest('state or location required')

  const id = await sha256Hex(body.endpoint)
  const existing = await env.DB.prepare('SELECT id FROM push_subs WHERE id = ?').bind(id).first()
  if (!existing) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs').first<{ n: number }>()
    if ((count?.n ?? 0) >= MAX_SUBSCRIBERS) return apiError('busy', 503)
  }
  await env.DB.prepare(
    `INSERT INTO push_subs (id, endpoint, lang, state, district, lgd, lat, lon, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET lang = excluded.lang, state = excluded.state, district = excluded.district, lgd = excluded.lgd,
       lat = excluded.lat, lon = excluded.lon`,
  )
    .bind(id, body.endpoint, body.lang, state?.id ?? null, district?.name ?? null, district?.lgd ?? null, gps?.lat ?? null, gps?.lon ?? null, Date.now())
    .run()
  return new Response(null, { status: 204 })
}

/** POST /api/push/unsubscribe {endpoint}: stops the alerts and deletes everything stored for this phone. */
export async function handleUnsubscribe(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null
  if (!body || typeof body.endpoint !== 'string' || body.endpoint.length > 1000) throw new BadRequest('endpoint required')
  await env.DB.prepare('DELETE FROM push_subs WHERE id = ?')
    .bind(await sha256Hex(body.endpoint))
    .run()
  return new Response(null, { status: 204 })
}

/** POST /api/push/message {endpoint}: what the woken phone shows. 204 when this phone isn't subscribed. */
export async function handlePushMessage(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null
  if (!body || typeof body.endpoint !== 'string' || body.endpoint.length > 1000) throw new BadRequest('endpoint required')
  const sub = await env.DB.prepare('SELECT * FROM push_subs WHERE id = ?')
    .bind(await sha256Hex(body.endpoint))
    .first<SubRow>()
  if (!sub || !isLang(sub.lang)) return new Response(null, { status: 204 })
  const message = await messageFor(env, sub, await alertsQuickly(env, 3000))
  return message ? json({ ...message, lang: sub.lang }) : new Response(null, { status: 204 })
}

const messageFor = (env: Env, sub: SubRow, alerts: StoredAlert[]): Promise<PushMessage | undefined> =>
  morningMessage(
    env,
    sub.lang as Lang,
    {
      coords: sub.lat !== null && sub.lon !== null ? { lat: sub.lat, lon: sub.lon } : undefined,
      stateName: sub.state ?? undefined,
      district: sub.district ?? undefined,
    },
    alerts,
  )

/** Wakes phones (no payload). Returns how many were sent; deletes subscriptions the push service says are gone. */
async function wake(env: Env, subs: Pick<SubRow, 'id' | 'endpoint'>[], opts: { ttl: number; urgency: 'normal' | 'high'; topic: string }) {
  const auth = new Map<string, Promise<string>>()
  const gone: string[] = []
  let sent = 0
  await Promise.all(
    subs.map(async (s) => {
      if (!validEndpoint(s.endpoint)) return gone.push(s.id)
      const origin = new URL(s.endpoint).origin
      if (!auth.has(origin)) auth.set(origin, vapidAuthorization(env, origin))
      try {
        const res = await fetch(s.endpoint, {
          method: 'POST',
          // Topic: a newer message replaces one still waiting for an offline phone.
          headers: { authorization: await auth.get(origin)!, ttl: String(opts.ttl), urgency: opts.urgency, topic: opts.topic, 'content-length': '0' },
        })
        if (res.status === 404 || res.status === 410) gone.push(s.id)
        else if (res.ok) sent++
        else console.warn(`push ${origin}: ${res.status} ${(await res.text()).slice(0, 200)}`)
      } catch (err) {
        console.warn(`push ${origin}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }),
  )
  if (gone.length) {
    await env.DB.prepare(`DELETE FROM push_subs WHERE id IN (${gone.map(() => '?').join(',')})`)
      .bind(...gone)
      .run()
  }
  return { sent, gone: gone.length }
}

/** One morning cron run: the next batch of phones that haven't had today's message. */
export async function sendMorning(env: Env) {
  if (!vapidKeys(env)) return
  const day = indiaNow().toISOString().slice(0, 10)
  const { results } = await env.DB.prepare('SELECT id, endpoint FROM push_subs WHERE morning_day IS NULL OR morning_day < ? ORDER BY created LIMIT ?')
    .bind(day, MORNING_BATCH)
    .all<Pick<SubRow, 'id' | 'endpoint'>>()
  if (!results.length) return
  // Marked first: a run that fails half-way never wakes a phone twice.
  await env.DB.prepare(`UPDATE push_subs SET morning_day = ? WHERE id IN (${results.map(() => '?').join(',')})`)
    .bind(day, ...results.map((r) => r.id))
    .run()
  // High urgency: Android holds normal-priority pushes while the phone sleeps (Doze), and the 05:30 message never
  // reached a sleeping phone (Oct 2026). 6 h TTL: a phone that is off at dawn still gets today's message when it
  // comes on before 11:30 IST; the text is fetched when shown, so it is never stale.
  const outcome = await wake(env, results, { ttl: 6 * 3600, urgency: 'high', topic: 'morning' })
  console.log({ event: 'push_morning', batch: results.length, ...outcome })
}

/**
 * After each 30-minute warnings refresh: phones in districts with a new Severe or Extreme official warning.
 * Mandal-level warnings (outlines) are shown in the app but not pushed: a 5 km forecast cell is too coarse.
 */
export async function sendWarnings(env: Env, alerts: StoredAlert[], now = Date.now()) {
  if (!vapidKeys(env)) return
  const serious = alerts.filter((a) => (a.severity === 'Severe' || a.severity === 'Extreme') && a.lgd.length && Date.parse(a.expires) > now + 30 * 60_000)
  const lgds = [...new Set(serious.flatMap((a) => a.lgd))]
  if (!lgds.length) return
  const { results } = await env.DB.prepare(
    `SELECT id, endpoint, lgd, alerts_sent FROM push_subs WHERE lgd IN (${lgds.map(() => '?').join(',')}) AND (last_alert IS NULL OR last_alert < ?) LIMIT ?`,
  )
    .bind(...lgds, now - WARNING_GAP_MS, MAX_WARNING_PUSHES * 4)
    .all<Pick<SubRow, 'id' | 'endpoint' | 'lgd' | 'alerts_sent'>>()
  const due = results
    .map((s) => {
      const sent = new Set<string>(JSON.parse(s.alerts_sent || '[]') as string[])
      const alert = serious.find((a) => a.lgd.includes(s.lgd!) && !sent.has(a.id))
      return alert && { ...s, alert, sent: [...sent, alert.id].slice(-20) }
    })
    .filter((s) => s !== undefined)
    .slice(0, MAX_WARNING_PUSHES)
  if (!due.length) return
  await env.DB.batch(
    due.map((s) => env.DB.prepare('UPDATE push_subs SET alerts_sent = ?, last_alert = ? WHERE id = ?').bind(JSON.stringify(s.sent), now, s.id)),
  )
  const outcome = await wake(env, due, { ttl: 3 * 3600, urgency: 'high', topic: 'warning' })
  console.log({ event: 'push_warning', batch: due.length, ...outcome })
}

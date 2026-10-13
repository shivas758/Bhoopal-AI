import { findDistrict } from '../shared/districts'
import { isLang, type AlertSeverity, type AlertsResponse, type Lang, type OfficialAlert } from '../shared/types'
import { readCache, rest, restingNow, writeCache } from './store'
import { BadRequest, UpstreamError, cached, inIndia, json, upstreamFetch } from './util'

// NDMA SACHET: every official warning in India (IMD, State Disaster Management Authorities, CWC) as CAP files,
// public domain. The feed has no CORS headers, so the app reads it through the Worker.
const SACHET = 'https://sachet.ndma.gov.in/cap_public_website/'
const FEED = `${SACHET}rss/rss_india.xml`
// Issuers whose warnings can reach the districts in shared/districtData.ts (South India).
const OFFICES =
  /^(IMD (Chennai|Hyderabad|Bengaluru|Bangalore|Thiruvananthapuram|Amaravati|Visakhapatnam|Puducherry)|(Andhra Pradesh|Telangana|Karnataka|Tamil Nadu|Kerala|Puducherry) SDMA)$/i
// A new warning costs one request for its CAP file, plus one for its outline when it names mandals instead of
// districts. Each refresh stays far inside the free plan's 50 subrequests, and asks SACHET a few files at a time
// (ten at once made it time out); the rest wait for the next refresh.
const MAX_FETCHES = 8
const MAX_OUTLINES = 2
const PARALLEL = 3
const OUTLINE_SERVICE = 'sachet-outlines'
const OUTLINE_REST_MS = 6 * 3600_000
const REFRESH_SECONDS = 600
const KNOWN_KEY = 'sachet:known'
const KNOWN_TTL_MS = 2 * 86400_000
const MAX_RING_POINTS = 200

interface FeedItem {
  id: string
  office: string
  pubDate: number
}

/** A warning as stored: every language's text, and where it applies. */
export interface StoredAlert extends Omit<OfficialAlert, 'headline' | 'headlineLang'> {
  headlines: Partial<Record<Lang, string>>
  /** LGD district codes (IMD's district-level warnings). */
  lgd: number[]
  /** Outline rings of [lat, lon], for warnings issued for mandals (e.g. lightning nowcasts). */
  rings?: [number, number][][]
  /** Outline still to be fetched (a refresh ran out of requests). */
  ringsUrl?: string
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
// Tags may have the cap: prefix and attributes (<guid isPermaLink="false">).
const element = (name: string, flags = '') => new RegExp(`<(?:cap:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:cap:)?${name}>`, flags)
const blocks = (xml: string, name: string) => [...xml.matchAll(element(name, 'g'))].map((m) => m[1])
const tag = (xml: string, name: string) => {
  const m = element(name).exec(xml)
  return m ? decode(m[1]) : ''
}

/** The feed's items: id, issuing office (from "controlroom@ndma.gov.in (IMD Chennai)") and time. */
export function parseFeed(xml: string): FeedItem[] {
  return blocks(xml, 'item').flatMap((item) => {
    const id = tag(item, 'guid')
    const office = /\(([^)]+)\)\s*$/.exec(tag(item, 'author'))?.[1]?.trim() ?? ''
    if (!/^\d{6,25}$/.test(id) || tag(item, 'category') !== 'Met') return []
    return [{ id, office, pubDate: Date.parse(tag(item, 'pubDate')) || 0 }]
  })
}

// Language codes seen in SACHET's CAP files: en-IN, TL (Telugu), ML, HI, ...
const CAP_LANGS: Record<string, Lang> = { en: 'en', hi: 'hi', te: 'te', tl: 'te', ta: 'ta', kn: 'kn', ml: 'ml' }
const SEVERITIES: AlertSeverity[] = ['Extreme', 'Severe', 'Moderate', 'Minor']
const iso = (s: string) => (Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : undefined)

export function parseCap(xml: string, id: string, office: string): StoredAlert | undefined {
  const infos = blocks(xml, 'info')
  const main = infos.find((i) => /^en/i.test(tag(i, 'language'))) ?? infos[0]
  const expires = main && iso(tag(main, 'expires'))
  if (!main || !expires || tag(main, 'category') !== 'Met') return undefined
  const headlines: Partial<Record<Lang, string>> = {}
  for (const info of infos) {
    const lang = CAP_LANGS[tag(info, 'language').slice(0, 2).toLowerCase()]
    const text = tag(info, 'headline') || tag(info, 'description')
    if (lang && text && !headlines[lang]) headlines[lang] = text.slice(0, 500)
  }
  const lgd = blocks(main, 'geocode')
    .filter((g) => /LGD District Code/i.test(tag(g, 'valueName')))
    .map((g) => Number(tag(g, 'value')))
    .filter((n) => Number.isInteger(n) && n > 0)
  const ringsUrl = blocks(main, 'parameter')
    .filter((p) => /Polygon URL/i.test(tag(p, 'valueName')))
    .map((p) => tag(p, 'value'))
    // Only ever fetch SACHET itself, whatever a feed file says.
    .find((u) => u.startsWith(SACHET))
  const severity = tag(main, 'severity')
  return {
    id,
    office,
    event: tag(main, 'event').slice(0, 80),
    severity: (SEVERITIES as string[]).includes(severity) ? (severity as AlertSeverity) : 'Unknown',
    urgency: tag(main, 'urgency'),
    certainty: tag(main, 'certainty'),
    onset: iso(tag(main, 'onset')),
    expires,
    area: tag(main, 'areaDesc').slice(0, 300),
    headlines,
    lgd: [...new Set(lgd)],
    ...(lgd.length || !ringsUrl ? {} : { ringsUrl }),
  }
}

/** "<polygon>15.97,80.96 15.97,80.97 …</polygon>" rings, thinned to a few hundred points (plenty for a mandal). */
export function parseRings(xml: string): [number, number][][] {
  return blocks(xml, 'polygon')
    .map((ring) => {
      const points = ring
        .trim()
        .split(/\s+/)
        .map((p) => p.split(',').map(Number) as [number, number])
        .filter(([lat, lon]) => inIndia(lat, lon))
      const step = Math.ceil(points.length / MAX_RING_POINTS)
      return points.filter((_, i) => i % step === 0)
    })
    .filter((r) => r.length >= 3)
}

/** Ray casting: is the point inside the ring? */
export function insideRing(ring: [number, number][], lat: number, lon: number) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ai, oi] = ring[i]
    const [aj, oj] = ring[j]
    if (oi > lon !== oj > lon && lat < ((aj - ai) * (lon - oi)) / (oj - oi) + ai) inside = !inside
  }
  return inside
}

// Without D1 (tests, a broken binding), this isolate remembers what it has parsed.
let knownInMemory: Record<string, StoredAlert | null> = {}

async function inBatches<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = []
  for (let i = 0; i < items.length; i += PARALLEL) results.push(...(await Promise.allSettled(items.slice(i, i + PARALLEL).map(run))))
  return results
}

const sachetFetch = (env: Env, url: string) =>
  upstreamFetch('SACHET', url, { headers: { 'user-agent': String(env.USER_AGENT) }, signal: AbortSignal.timeout(8000) }).then((res) => {
    if (!res.ok) throw new UpstreamError(`SACHET ${res.status}`)
    return res.text()
  })

/** Reads the feed and any new warnings from South-Indian issuers. Warnings already parsed are reused. */
async function refresh(env: Env): Promise<{ at: number; alerts: StoredAlert[] }> {
  const items = parseFeed(await sachetFetch(env, FEED))
    .filter((i) => OFFICES.test(i.office))
    .sort((a, b) => b.pubDate - a.pubDate)
  const known = (await readCache<Record<string, StoredAlert | null>>(env.DB, KNOWN_KEY)) ?? knownInMemory
  const now = Date.now()
  const warn = (what: string, err: unknown) => console.warn(`sachet ${what}: ${err instanceof Error ? err.message : String(err)}`)

  // Items no longer in the feed are dropped; expired and unusable warnings stay as null, so they are never
  // fetched again.
  const next: Record<string, StoredAlert | null> = {}
  for (const item of items) if (item.id in known) next[item.id] = known[item.id] && Date.parse(known[item.id]!.expires) > now ? known[item.id] : null

  // A couple of requests go to outlines of active mandal-level warnings (needed to match a GPS fix), the rest to
  // new items, newest first. The outline service often refuses requests (403): then it is left alone for hours.
  // Whatever doesn't fit waits for the next refresh.
  const outlinesResting = ((await restingNow(env.DB))[OUTLINE_SERVICE] ?? 0) > now
  const outlines = outlinesResting
    ? []
    : Object.values(next)
        .filter((a): a is StoredAlert & { ringsUrl: string } => Boolean(a?.ringsUrl))
        .slice(0, MAX_OUTLINES)
  const fresh = items.filter((i) => !(i.id in known)).slice(0, MAX_FETCHES - outlines.length)
  const parsed = await inBatches(fresh, (i) => sachetFetch(env, `${SACHET}FetchXMLFile?identifier=${i.id}`).then((xml) => parseCap(xml, i.id, i.office)))
  const rings = await inBatches(outlines, (a) => sachetFetch(env, a.ringsUrl).then(parseRings))
  outlines.forEach(({ ringsUrl: _done, ...alert }, k) => {
    const r = rings[k]
    if (r.status === 'fulfilled') next[alert.id] = { ...alert, rings: r.value }
    else warn(`outline ${alert.id}`, r.reason)
  })
  if (rings.some((r) => r.status === 'rejected' && r.reason instanceof UpstreamError && r.reason.status === 403)) {
    await rest(env.DB, OUTLINE_SERVICE, now + OUTLINE_REST_MS)
  }
  fresh.forEach((item, k) => {
    const r = parsed[k]
    const alert = r.status === 'fulfilled' ? r.value : undefined
    if (r.status === 'rejected') warn(item.id, r.reason)
    else next[item.id] = alert && Date.parse(alert.expires) > now ? alert : null
  })

  knownInMemory = next
  await writeCache(env.DB, KNOWN_KEY, next, now + KNOWN_TTL_MS)
  console.log({ event: 'sachet', items: items.length, fetched: fresh.length, outlines: outlines.length })
  return { at: now, alerts: Object.values(next).filter((a): a is StoredAlert => a !== null) }
}

/** Active South-Indian warnings, re-read at most every 10 minutes per Worker isolate. */
export const loadAlerts = (env: Env) => cached('sachet', REFRESH_SECONDS, () => refresh(env))

/** Warnings for an answer that must not wait: none if SACHET is slow or down. */
export async function alertsQuickly(env: Env, waitMs = 2000): Promise<StoredAlert[]> {
  try {
    const loaded = await Promise.race([loadAlerts(env), new Promise<undefined>((r) => setTimeout(r, waitMs))])
    return loaded?.alerts ?? []
  } catch (err) {
    console.warn(`sachet: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

/** The warnings the last refresh stored (the 30-minute cron keeps them fresh), without any request to SACHET. */
export async function storedAlerts(env: Env, now = Date.now()): Promise<StoredAlert[]> {
  const known = (await readCache<Record<string, StoredAlert | null>>(env.DB, KNOWN_KEY)) ?? knownInMemory
  return Object.values(known).filter((a): a is StoredAlert => a !== null && Date.parse(a.expires) > now)
}

const RANK: Record<AlertSeverity, number> = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 }

/** Warnings for a district (by LGD code) or, with a GPS fix, for the mandal outline the farm is in. */
export function alertsFor(alerts: StoredAlert[], place: { lgd?: number; gps?: { lat: number; lon: number } }, now = Date.now()): StoredAlert[] {
  const seen = new Set<string>()
  return alerts
    .filter((a) => Date.parse(a.expires) > now)
    .filter((a) => (place.lgd !== undefined && a.lgd.includes(place.lgd)) || (place.gps && a.rings?.some((r) => insideRing(r, place.gps!.lat, place.gps!.lon))))
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || Date.parse(b.expires) - Date.parse(a.expires))
    .filter((a) => {
      // Neighbouring mandals get the same lightning warning: show it once.
      const key = `${a.event}|${a.headlines.en ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function alertView(a: StoredAlert, lang: Lang): OfficialAlert {
  const headlineLang: Lang = a.headlines[lang] ? lang : a.headlines.en ? 'en' : ((Object.keys(a.headlines)[0] as Lang | undefined) ?? 'en')
  return {
    id: a.id,
    office: a.office,
    event: a.event,
    severity: a.severity,
    urgency: a.urgency,
    certainty: a.certainty,
    onset: a.onset,
    expires: a.expires,
    headline: a.headlines[headlineLang] ?? a.event,
    headlineLang,
    area: a.area,
  }
}

/** Where a farmer is, for matching warnings: their district's LGD code and, if shared, their GPS fix. */
export function farmerPlace(state: string | undefined, district: string | undefined, gps: { lat: number; lon: number } | undefined) {
  return { lgd: findDistrict(state, district)?.lgd, gps: gps && inIndia(gps.lat, gps.lon) ? gps : undefined }
}

/** GET /api/alerts?lang&state&district[&lat&lon]: official warnings for the farmer's place. */
export async function handleAlerts(url: URL, env: Env): Promise<Response> {
  const p = url.searchParams
  const lang = p.get('lang') ?? 'en'
  if (!isLang(lang)) throw new BadRequest('lang required')
  const lat = parseFloat(p.get('lat') ?? '')
  const lon = parseFloat(p.get('lon') ?? '')
  const place = farmerPlace(p.get('state') ?? undefined, p.get('district') ?? undefined, inIndia(lat, lon) ? { lat, lon } : undefined)
  const { at, alerts } = await loadAlerts(env)
  const body: AlertsResponse = { alerts: alertsFor(alerts, place).map((a) => alertView(a, lang)), checkedAt: new Date(at).toISOString() }
  return json(body, 200, { 'cache-control': 'public, max-age=300' })
}

/** For the chat's weather tool: the farmer's active warnings in English, or nothing if SACHET is slow or down. */
export async function warningsForChat(env: Env, place: ReturnType<typeof farmerPlace>): Promise<Record<string, string>[] | undefined> {
  const mine = alertsFor(await alertsQuickly(env), place)
  return mine.length
    ? mine.map((a) => ({
        issuedBy: a.office,
        event: a.event,
        severity: a.severity,
        until: a.expires,
        text: a.headlines.en ?? Object.values(a.headlines)[0] ?? '',
      }))
    : undefined
}

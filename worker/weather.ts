import { findDistrict } from '../shared/districts'
import { findState } from '../shared/states'
import type { WeatherDay, WeatherHour, WeatherKind, WeatherResponse } from '../shared/types'
import { farmerPlace, warningsForChat } from './sachet'
import { BadRequest, UpstreamError, cached, inIndia, json, upstreamFetch } from './util'

// MET Norway: free, no key, commercial use allowed with attribution (CC BY 4.0).
// Terms: identify yourself in User-Agent, cache responses, max 4 decimals in coordinates.
const MET = 'https://api.met.no/weatherapi/locationforecast/2.0/compact'
const IST_MS = 5.5 * 3600 * 1000

interface MetEntry {
  time: string
  data: {
    instant: { details: { air_temperature?: number; wind_speed?: number; relative_humidity?: number } }
    next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } }
    next_6_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } }
    next_12_hours?: { summary?: { symbol_code?: string } }
  }
}

const SEVERITY: WeatherKind[] = ['clear', 'partly', 'cloudy', 'fog', 'snow', 'lightrain', 'rain', 'heavyrain', 'thunder']
const RAINY = new Set<WeatherKind>(['lightrain', 'rain', 'heavyrain', 'thunder'])

function kindOf(symbol: string | undefined): WeatherKind {
  const s = (symbol ?? '').replace(/_(day|night|polartwilight)$/, '')
  if (s.includes('thunder')) return 'thunder'
  if (s.includes('snow') || s.includes('sleet')) return 'snow'
  if (s.startsWith('heavyrain')) return 'heavyrain'
  if (s.startsWith('light') && s.includes('rain')) return 'lightrain'
  if (s.includes('rain')) return 'rain'
  if (s === 'fog') return 'fog'
  if (s === 'cloudy') return 'cloudy'
  if (s === 'partlycloudy' || s === 'fair') return 'partly'
  return 'clear'
}

const round1 = (n: number) => Math.round(n * 10) / 10
const indiaDate = (iso: string) => new Date(Date.parse(iso) + IST_MS).toISOString().slice(0, 10)

function summarize(series: MetEntry[]): Omit<WeatherResponse, 'updatedAt'> {
  const hours: WeatherHour[] = []
  const days = new Map<string, { temps: number[]; winds: number[]; hums: number[]; rain: number; kinds: WeatherKind[] }>()

  for (const entry of series) {
    const { instant, next_1_hours, next_6_hours, next_12_hours } = entry.data
    const d = instant.details
    const symbol = next_1_hours?.summary?.symbol_code ?? next_6_hours?.summary?.symbol_code ?? next_12_hours?.summary?.symbol_code
    const kind = kindOf(symbol)
    // Near-term entries are hourly (next_1_hours); later ones are 6-hourly, so each block is counted once.
    const rain = next_1_hours?.details?.precipitation_amount ?? next_6_hours?.details?.precipitation_amount ?? 0
    const windKmh = (d.wind_speed ?? 0) * 3.6

    if (next_1_hours && hours.length < 48) {
      hours.push({
        time: entry.time,
        temp: round1(d.air_temperature ?? 0),
        rainMm: round1(rain),
        windKmh: Math.round(windKmh),
        humidity: Math.round(d.relative_humidity ?? 0),
        kind,
      })
    }

    const date = indiaDate(entry.time)
    let day = days.get(date)
    if (!day) days.set(date, (day = { temps: [], winds: [], hums: [], rain: 0, kinds: [] }))
    if (d.air_temperature !== undefined) day.temps.push(d.air_temperature)
    day.winds.push(windKmh)
    if (d.relative_humidity !== undefined) day.hums.push(d.relative_humidity)
    if (next_1_hours || next_6_hours) day.rain += rain
    day.kinds.push(kind)
  }

  const dayList: WeatherDay[] = [...days]
    .filter(([, v]) => v.temps.length)
    .slice(0, 7)
    .map(([date, v]) => {
      let kind = v.kinds.reduce((worst, k) => (SEVERITY.indexOf(k) > SEVERITY.indexOf(worst) ? k : worst), 'clear' as WeatherKind)
      if (RAINY.has(kind) && v.rain < 0.5) {
        // A brief shower symbol shouldn't make a basically dry day look rainy.
        const dry = v.kinds.filter((k) => !RAINY.has(k))
        kind = dry.sort((a, b) => dry.filter((k) => k === b).length - dry.filter((k) => k === a).length)[0] ?? 'cloudy'
      }
      return {
        date,
        tMin: Math.round(Math.min(...v.temps)),
        tMax: Math.round(Math.max(...v.temps)),
        rainMm: round1(v.rain),
        windMaxKmh: Math.round(Math.max(...v.winds)),
        humidity: Math.round(v.hums.reduce((a, b) => a + b, 0) / Math.max(1, v.hums.length)),
        kind,
      }
    })

  return { hours, days: dayList }
}

export { inIndia }

// 0.05° (~5 km) is plenty for a farm forecast, lets a whole area share one MET request, and stops a scan of
// every 0.01° cell from hammering MET Norway with our User-Agent.
const GRID = 0.05
const toGrid = (n: number) => (Math.round(n / GRID) * GRID).toFixed(2)

// MET's terms: don't ask again before the Expires time, and send If-Modified-Since (a 304 means "no change").
const MIN_TTL_SECONDS = 15 * 60
const MAX_TTL_SECONDS = 2 * 3600
const lastForecast = new Map<string, { lastModified: string; data: WeatherResponse }>()

function ttlFromExpires(expires: string | null) {
  const seconds = Math.round((Date.parse(expires ?? '') - Date.now()) / 1000)
  return Number.isFinite(seconds) ? Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, seconds)) : 30 * 60
}

export async function getForecast(env: Env, lat: number, lon: number): Promise<WeatherResponse> {
  const la = toGrid(lat)
  const lo = toGrid(lon)
  const key = `wx:${la},${lo}`
  // Forecasts stay in memory only: one per 5 km cell would use up the shared store's write allowance.
  const { data } = await cached(
    key,
    (v: { ttl: number }) => v.ttl,
    async (): Promise<{ data: WeatherResponse; ttl: number }> => {
      const previous = lastForecast.get(key)
      const res = await upstreamFetch('MET Norway', `${MET}?lat=${la}&lon=${lo}`, {
        headers: { 'user-agent': String(env.USER_AGENT), accept: 'application/json', ...(previous ? { 'if-modified-since': previous.lastModified } : {}) },
        signal: AbortSignal.timeout(15_000),
      })
      const ttl = ttlFromExpires(res.headers.get('expires'))
      if (res.status === 304 && previous) return { data: previous.data, ttl }
      if (!res.ok) throw new UpstreamError(`MET Norway ${res.status}`)
      const body = (await res.json()) as { properties: { meta: { updated_at: string }; timeseries: MetEntry[] } }
      const forecast: WeatherResponse = { updatedAt: body.properties.meta.updated_at, ...summarize(body.properties.timeseries) }
      const lastModified = res.headers.get('last-modified')
      if (lastModified) {
        lastForecast.delete(key)
        lastForecast.set(key, { lastModified, data: forecast })
        if (lastForecast.size > 200) lastForecast.delete(lastForecast.keys().next().value!)
      }
      return { data: forecast, ttl }
    },
  )
  return data
}

export async function handleWeather(url: URL, env: Env): Promise<Response> {
  // parseFloat(null) is NaN, unlike Number(null) = 0, so a missing parameter is rejected.
  const lat = parseFloat(url.searchParams.get('lat') ?? '')
  const lon = parseFloat(url.searchParams.get('lon') ?? '')
  if (!inIndia(lat, lon)) throw new BadRequest('lat/lon in India required')
  return json(await getForecast(env, lat, lon), 200, { 'cache-control': 'public, max-age=900' })
}

export interface FarmerWhere {
  coords?: { lat: number; lon: number }
  stateName?: string
  district?: string
}

/** Where to forecast: the farmer's GPS fix, else the centre of their district, else (hundreds of km off) the state capital. */
export function farmLocation(farmer: FarmerWhere) {
  const gps = farmer.coords && inIndia(farmer.coords.lat, farmer.coords.lon) ? farmer.coords : undefined
  const district = findDistrict(farmer.stateName, farmer.district)
  const state = findState(farmer.stateName)
  const coords = gps ?? (district && { lat: district.lat, lon: district.lon }) ?? (state && { lat: state.lat, lon: state.lon })
  if (!coords) return undefined
  const source: 'gps' | 'district' | 'state' = gps ? 'gps' : district ? 'district' : 'state'
  return { coords, gps, district, state, source }
}

/** "2026-10-12 06:00" in IST: hours past midnight belong to the next day, so the model needs the date too. */
const timeIST = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 16).replace('T', ' ')

/** The chat model's `get_weather_forecast` tool: a compact forecast for the farmer's location. */
export async function weatherTool(env: Env, farmer: FarmerWhere): Promise<Record<string, unknown>> {
  const loc = farmLocation(farmer)
  if (!loc) return { error: 'Location unknown. Ask which state/district the farmer is in, or to allow location in the Weather tab.' }
  const [w, warnings] = await Promise.all([
    getForecast(env, loc.coords.lat, loc.coords.lon),
    warningsForChat(env, farmerPlace(farmer.stateName, farmer.district, loc.gps)),
  ])
  const from = Date.now() - 3600_000
  return {
    location:
      loc.source === 'gps'
        ? "farmer's GPS location"
        : loc.source === 'district'
          ? `centre of ${loc.district!.name} district (approximate; for village-level weather the farmer can tap "Use my location" on the Weather page)`
          : `${farmer.stateName} state capital (approximate, may be far from the farm; the farmer can set the district in Settings or tap "Use my location")`,
    timezone: 'IST',
    now: timeIST(Date.now()),
    next24Hours: w.hours
      .filter((h) => Date.parse(h.time) >= from)
      .slice(0, 24)
      .map((h) => ({ time: timeIST(Date.parse(h.time)), tempC: h.temp, rainMm: h.rainMm, windKmh: h.windKmh, humidity: h.humidity, sky: h.kind })),
    next7Days: w.days.map((d) => ({ date: d.date, minC: d.tMin, maxC: d.tMax, rainMm: d.rainMm, maxWindKmh: d.windMaxKmh, humidity: d.humidity, sky: d.kind })),
    source: 'MET Norway',
    ...(warnings
      ? {
          officialWarnings: warnings,
          officialWarningsNote:
            'Active official warnings for this place (IMD / State Disaster Management Authority via NDMA SACHET). Mention them first, in simple words, with the safety step.',
        }
      : {}),
  }
}

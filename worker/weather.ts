import type { WeatherDay, WeatherHour, WeatherKind, WeatherResponse } from '../shared/types'
import { BadRequest, UpstreamError, cached, json, upstreamFetch } from './util'

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

const validCoords = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180

export function getForecast(env: Env, lat: number, lon: number): Promise<WeatherResponse> {
  // ~1 km precision is plenty for farm weather and lets neighbours share the cache.
  const la = lat.toFixed(2)
  const lo = lon.toFixed(2)
  return cached(`wx:${la},${lo}`, 30 * 60, async (): Promise<WeatherResponse> => {
    const res = await upstreamFetch('MET Norway', `${MET}?lat=${la}&lon=${lo}`, {
      headers: { 'user-agent': String(env.USER_AGENT), accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new UpstreamError(`MET Norway ${res.status}`)
    const body = (await res.json()) as { properties: { meta: { updated_at: string }; timeseries: MetEntry[] } }
    return { updatedAt: body.properties.meta.updated_at, ...summarize(body.properties.timeseries) }
  })
}

export async function handleWeather(url: URL, env: Env): Promise<Response> {
  const lat = Number(url.searchParams.get('lat'))
  const lon = Number(url.searchParams.get('lon'))
  if (!validCoords(lat, lon)) throw new BadRequest('lat/lon required')
  return json(await getForecast(env, lat, lon), 200, { 'cache-control': 'public, max-age=900' })
}

const hourIST = (iso: string) => new Date(Date.parse(iso) + IST_MS).toISOString().slice(11, 16)

/** The chat model's `get_weather_forecast` tool: a compact forecast for the farmer's location. */
export async function weatherTool(
  env: Env,
  farmer: { coords?: { lat: number; lon: number }; stateName?: string; stateCoords?: { lat: number; lon: number } },
): Promise<Record<string, unknown>> {
  const coords = farmer.coords && validCoords(farmer.coords.lat, farmer.coords.lon) ? farmer.coords : farmer.stateCoords
  if (!coords) return { error: 'Location unknown. Ask which state/district the farmer is in, or to allow location in the Weather tab.' }
  const w = await getForecast(env, coords.lat, coords.lon)
  const now = Date.now() - 3600_000
  return {
    location: farmer.coords ? "farmer's GPS location" : `${farmer.stateName} state capital (approximate; for village-level weather the farmer can allow location in the Weather tab)`,
    timezone: 'IST',
    next24Hours: w.hours
      .filter((h) => Date.parse(h.time) >= now)
      .slice(0, 24)
      .map((h) => ({ time: hourIST(h.time), tempC: h.temp, rainMm: h.rainMm, windKmh: h.windKmh, humidity: h.humidity, sky: h.kind })),
    next7Days: w.days.map((d) => ({ date: d.date, minC: d.tMin, maxC: d.tMax, rainMm: d.rainMm, maxWindKmh: d.windMaxKmh, humidity: d.humidity, sky: d.kind })),
    source: 'MET Norway',
  }
}

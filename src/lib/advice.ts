import type { Lang, WeatherHour, WeatherResponse } from '../../shared/types'
import type { MessageKey, TranslateVars } from '../i18n'
import { todayInIndia } from './format'

export interface Advice {
  tone: 'good' | 'warn' | 'info'
  key: MessageKey
  vars?: TranslateVars
}

type T = (key: MessageKey, vars?: TranslateVars) => string

const RAINY = new Set(['lightrain', 'rain', 'heavyrain', 'thunder'])
const isWet = (h: WeatherHour) => h.rainMm >= 0.2 || RAINY.has(h.kind)
const indiaHour = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600 * 1000).getUTCHours()

/** "tomorrow" / "on Friday" style label used inside advice sentences. */
export function dayLabel(date: string, lang: Lang, bcp47: string, t: T) {
  const today = todayInIndia()
  const tomorrow = todayInIndia(1)
  const weekday = new Date(`${date}T12:00:00`).toLocaleDateString(bcp47, { weekday: 'long' })
  if (lang === 'en') return date === today ? 'today' : date === tomorrow ? 'tomorrow' : `on ${weekday}`
  return date === today ? t('weather.today') : date === tomorrow ? t('weather.tomorrow') : weekday
}

/**
 * Simple, conservative rules of thumb. Spraying: no rain for ~4 hours after, wind under ~12 km/h,
 * not too hot, during cool daylight hours (early morning / late afternoon).
 */
export function farmAdvice(w: WeatherResponse, lang: Lang, bcp47: string, t: T): Advice[] {
  const out: Advice[] = []
  const now = Date.now()
  const hours = w.hours.filter((h) => Date.parse(h.time) >= now - 3600_000)
  const next6 = hours.slice(0, 6)

  if (next6.some(isWet)) out.push({ tone: 'warn', key: 'advice.sprayRain' })
  else if (hours[0] && hours[0].windKmh > 15) out.push({ tone: 'warn', key: 'advice.sprayWind', vars: { wind: hours[0].windKmh } })

  const window = hours.slice(0, 24).findIndex((h, i) => {
    const hr = indiaHour(h.time)
    const cool = (hr >= 6 && hr <= 9) || (hr >= 16 && hr <= 18)
    const calm = hours.slice(i, i + 2).every((x) => !isWet(x) && x.windKmh <= 12 && x.temp <= 32)
    const dryAfter = hours.slice(i, i + 5).every((x) => !isWet(x))
    return cool && calm && dryAfter && hours.length > i + 4
  })
  if (window >= 0) {
    const start = hours[window]
    const time = new Date(start.time).toLocaleTimeString(bcp47, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    const date = new Date(Date.parse(start.time) + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
    const day = date === todayInIndia() ? t('weather.today') : t('weather.tomorrow')
    out.push({ tone: 'good', key: 'advice.sprayGood', vars: { window: `${day}, ${time}` } })
  } else {
    out.push({ tone: 'info', key: 'advice.noSprayWindow' })
  }

  const soon = w.days.slice(0, 4)
  const thunder = soon.find((d) => d.kind === 'thunder')
  if (thunder) out.push({ tone: 'warn', key: 'advice.thunder', vars: { day: dayLabel(thunder.date, lang, bcp47, t) } })

  const heavy = w.days.slice(0, 5).find((d) => d.rainMm >= 20)
  const rainy = soon.find((d) => d.rainMm >= 2)
  if (heavy) out.push({ tone: 'warn', key: 'advice.heavyRain', vars: { day: dayLabel(heavy.date, lang, bcp47, t) } })
  else if (rainy) out.push({ tone: 'info', key: 'advice.rainSoon', vars: { day: dayLabel(rainy.date, lang, bcp47, t) } })

  const hottest = Math.max(...w.days.slice(0, 5).map((d) => d.tMax))
  if (hottest >= 38) out.push({ tone: 'warn', key: 'advice.heat', vars: { temp: hottest } })

  const weekRain = w.days.reduce((sum, d) => sum + d.rainMm, 0)
  if (weekRain < 2) out.push({ tone: 'info', key: 'advice.dryWeek' })

  const humid = soon.slice(0, 3)
  if (humid.length && humid.reduce((s, d) => s + d.humidity, 0) / humid.length >= 85 && humid.some((d) => d.rainMm > 0)) {
    out.push({ tone: 'info', key: 'advice.humid' })
  }
  return out
}

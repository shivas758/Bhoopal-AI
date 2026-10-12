import type { Lang, WeatherHour, WeatherResponse } from '../../shared/types'
import type { MessageKey, TranslateVars } from '../i18n'
import { formatTime, todayInIndia } from './format'

export interface Advice {
  tone: 'good' | 'warn' | 'info'
  key: MessageKey
  vars?: TranslateVars
  /** About people's safety or a big weather event: shown first, and on the Home card instead of spray advice. */
  urgent?: boolean
}

type T = (key: MessageKey, vars?: TranslateVars) => string

const RAINY = new Set(['lightrain', 'rain', 'heavyrain', 'thunder'])
const isWet = (h: WeatherHour) => h.rainMm >= 0.2 || RAINY.has(h.kind)
const indiaHour = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600 * 1000).getUTCHours()
// Strong enough to flatten banana and sugarcane and tear polythene: coastal states get these with cyclones.
const STRONG_WIND_KMH = 40

/** "tomorrow" / "on Friday" style label used inside advice sentences. */
export function dayLabel(date: string, lang: Lang, bcp47: string, t: T) {
  const today = todayInIndia()
  const tomorrow = todayInIndia(1)
  const weekday = new Date(`${date}T12:00:00`).toLocaleDateString(bcp47, { weekday: 'long' })
  if (lang === 'en') return date === today ? 'today' : date === tomorrow ? 'tomorrow' : `on ${weekday}`
  if (date === today) return t('weather.today')
  if (date === tomorrow) return t('weather.tomorrow')
  // Hindi needs the postposition ("शुक्रवार को"); Dravidian weekday names already work as adverbs.
  return lang === 'hi' ? `${weekday} को` : weekday
}

/**
 * Simple, conservative rules of thumb. Spraying: no rain for ~4 hours after, wind under ~12 km/h,
 * not too hot, during cool daylight hours (early morning / late afternoon).
 */
export function farmAdvice(w: WeatherResponse, lang: Lang, bcp47: string, t: T): Advice[] {
  const out: Advice[] = []
  const now = Date.now()
  // Current conditions may use the hour that started a little while ago; a spray window must still be ahead.
  const hours = w.hours.filter((h) => Date.parse(h.time) >= now - 3600_000)
  const ahead = w.hours.filter((h) => Date.parse(h.time) >= now)
  const days = w.days.filter((d) => d.date >= todayInIndia())
  const next6 = hours.slice(0, 6)

  if (next6.some(isWet)) out.push({ tone: 'warn', key: 'advice.sprayRain' })
  else if (hours[0] && hours[0].windKmh > 15) out.push({ tone: 'warn', key: 'advice.sprayWind', vars: { wind: hours[0].windKmh } })

  const window = ahead.slice(0, 24).findIndex((h, i) => {
    const hr = indiaHour(h.time)
    const cool = (hr >= 6 && hr <= 9) || (hr >= 16 && hr <= 18)
    const calm = ahead.slice(i, i + 2).every((x) => !isWet(x) && x.windKmh <= 12 && x.temp <= 32)
    const dryAfter = ahead.slice(i, i + 5).every((x) => !isWet(x))
    return cool && calm && dryAfter && ahead.length > i + 4
  })
  if (window >= 0) {
    const start = ahead[window]
    const date = new Date(Date.parse(start.time) + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
    const day = date === todayInIndia() ? t('weather.today') : t('weather.tomorrow')
    out.push({ tone: 'good', key: 'advice.sprayGood', vars: { window: `${day}, ${formatTime(start.time, bcp47)}` } })
  } else if (ahead.length) {
    out.push({ tone: 'info', key: 'advice.noSprayWindow' })
  }

  const soon = days.slice(0, 4)
  const thunder = soon.find((d) => d.kind === 'thunder')
  if (thunder) out.push({ tone: 'warn', key: 'advice.thunder', vars: { day: dayLabel(thunder.date, lang, bcp47, t) }, urgent: true })

  const windy = days.slice(0, 3).find((d) => d.windMaxKmh >= STRONG_WIND_KMH)
  if (windy) out.push({ tone: 'warn', key: 'advice.strongWind', vars: { day: dayLabel(windy.date, lang, bcp47, t), wind: windy.windMaxKmh }, urgent: true })

  const heavy = days.slice(0, 5).find((d) => d.rainMm >= 20)
  const rainy = soon.find((d) => d.rainMm >= 2)
  if (heavy) out.push({ tone: 'warn', key: 'advice.heavyRain', vars: { day: dayLabel(heavy.date, lang, bcp47, t) }, urgent: true })
  else if (rainy) out.push({ tone: 'info', key: 'advice.rainSoon', vars: { day: dayLabel(rainy.date, lang, bcp47, t) } })

  const hottest = days.length ? Math.max(...days.slice(0, 5).map((d) => d.tMax)) : 0
  // People first: heat stroke kills farm workers, so this comes before the advice for the crop.
  if (hottest >= 40) out.push({ tone: 'warn', key: 'advice.heatSafety', urgent: true })
  if (hottest >= 38) out.push({ tone: 'warn', key: 'advice.heat', vars: { temp: hottest } })

  if (days.length >= 5 && days.reduce((sum, d) => sum + d.rainMm, 0) < 2) out.push({ tone: 'info', key: 'advice.dryWeek' })

  const humid = soon.slice(0, 3)
  if (humid.length && humid.reduce((s, d) => s + d.humidity, 0) / humid.length >= 85 && humid.some((d) => d.rainMm > 0)) {
    out.push({ tone: 'info', key: 'advice.humid' })
  }
  // Safety and big weather events first (stable order otherwise).
  return [...out.filter((a) => a.urgent), ...out.filter((a) => !a.urgent)]
}

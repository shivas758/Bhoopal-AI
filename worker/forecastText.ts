import { farmAdvice } from '../shared/advice'
import { todayInIndia } from '../shared/time'
import { LANG_INFO, type Lang, type WeatherKind } from '../shared/types'
import { weatherT } from '../shared/weatherText'
import { alertView, alertsFor, farmerPlace, type StoredAlert } from './sachet'
import { farmLocation, getForecast, type FarmerWhere } from './weather'

type Location = NonNullable<ReturnType<typeof farmLocation>>

/** The farm's district (or state) in the farmer's language. */
function placeName(loc: Location, lang: Lang) {
  if (loc.district) return loc.district.names?.[lang] ?? loc.district.name
  return loc.state?.names[lang] ?? ''
}

const sky = (t: ReturnType<typeof weatherT>, kind: WeatherKind) => t(`weather.kind.${kind}`)

/**
 * A weather answer without the AI (when every Gemini model is resting): today's and tomorrow's forecast, any
 * official warning first, and the same advice the Weather page shows.
 */
export async function weatherAnswer(env: Env, lang: Lang, farmer: FarmerWhere, alerts: StoredAlert[]): Promise<string | undefined> {
  const loc = farmLocation(farmer)
  if (!loc) return undefined
  const t = weatherT(lang)
  const w = await getForecast(env, loc.coords.lat, loc.coords.lon)
  const place = placeName(loc, lang)
  const today = todayInIndia()
  const tomorrow = todayInIndia(1)
  const warnings = alertsFor(alerts, farmerPlace(farmer.stateName, farmer.district, loc.gps)).map((a) => alertView(a, lang))

  const lines = [`**${t(loc.source === 'gps' ? 'forecast.place' : 'forecast.placeApprox', { place })}**`]
  for (const a of warnings) lines.push(`⚠️ **${t('alerts.official', { office: a.office })}:** ${a.headline}`)
  for (const d of w.days.filter((d) => d.date === today || d.date === tomorrow)) {
    lines.push(
      t('forecast.day', { day: t(d.date === today ? 'weather.today' : 'weather.tomorrow'), sky: sky(t, d.kind), min: d.tMin, max: d.tMax, rain: d.rainMm }),
    )
  }
  const advice = farmAdvice(w, lang, LANG_INFO[lang].bcp47, t).slice(0, 3)
  if (advice.length) lines.push('', ...advice.map((a) => `- ${t(a.key, a.vars)}`))
  lines.push('', t('forecast.more'))
  return lines.join('\n')
}

export interface PushMessage {
  title: string
  body: string
  /** One notification per kind: a newer one replaces the older on the phone. */
  tag: string
  url: string
}

/** The 6 AM message: an official warning if there is one, else today's forecast and the top advice. */
export async function morningMessage(env: Env, lang: Lang, farmer: FarmerWhere, alerts: StoredAlert[]): Promise<PushMessage | undefined> {
  const loc = farmLocation(farmer)
  if (!loc) return undefined
  const t = weatherT(lang)
  const warning = alertsFor(alerts, farmerPlace(farmer.stateName, farmer.district, loc.gps))[0]
  if (warning) return warningMessage(lang, warning)
  const w = await getForecast(env, loc.coords.lat, loc.coords.lon)
  const day = w.days.find((d) => d.date === todayInIndia())
  if (!day) return undefined
  const advice = farmAdvice(w, lang, LANG_INFO[lang].bcp47, t)
  return {
    title: t('push.title', { place: placeName(loc, lang), min: day.tMin, max: day.tMax, sky: sky(t, day.kind) }),
    body: advice
      .slice(0, 2)
      .map((a) => t(a.key, a.vars))
      .join(' '),
    tag: 'morning',
    url: '/#/weather',
  }
}

export function warningMessage(lang: Lang, alert: StoredAlert): PushMessage {
  const view = alertView(alert, lang)
  return {
    title: `⚠️ ${weatherT(lang)('alerts.official', { office: view.office })}`,
    body: view.headline.slice(0, 240),
    tag: `alert-${alert.id}`,
    url: '/#/weather',
  }
}

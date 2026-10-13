import { CheckCircle2, Droplets, ExternalLink, Info, LocateFixed, MapPin, RefreshCw, TriangleAlert, Wind } from 'lucide-react'
import { useMemo } from 'react'
import { findDistrict } from '../../shared/districts'
import { findState } from '../../shared/states'
import { OfficialAlerts } from '../components/Alerts'
import { PushOffer } from '../components/PushToggle'
import { Card, ErrorNotice, Notice, PageHeader, Spinner, secondaryButton } from '../components/ui'
import { WeatherIcon } from '../components/WeatherIcon'
import type { MessageKey } from '../i18n'
import { farmAdvice } from '../../shared/advice'
import { currentHour, todayForecast, upcomingHours, useAlerts, useLocate, useWeather, type FarmLocation } from '../lib/data'
import { formatDate, formatDateTime, formatTime, todayInIndia } from '../lib/format'
import { useSettings, useT } from '../settings'

// A saved forecast this old gets a "saved at" line; a GPS fix this old gets a "has the farm moved?" hint.
const STALE_FORECAST_MS = 3 * 3600 * 1000
const OLD_FIX_MS = 7 * 86400 * 1000

/** Where the forecast is for, how approximate it is, and one-tap ways to change it. */
function LocationCard({ loc }: { loc: FarmLocation | null }) {
  const { t, lang, bcp47 } = useT()
  const { settings, update } = useSettings()
  const { locate, locating, failed } = useLocate()
  const district = findDistrict(settings.state, settings.district)
  const area = district ? (district.names?.[lang] ?? district.name) : findState(settings.state)?.names[lang]

  let text: string | null = null
  if (failed && loc?.label) text = t('weather.gpsDenied', { place: loc.label })
  else if (loc?.source === 'gps') {
    const at = settings.coords?.at
    text = at && Date.now() - at > OLD_FIX_MS ? t('weather.gpsOld', { date: formatDate(at, bcp47) }) : t('weather.showingGps')
  } else if (loc?.source === 'district') text = t('weather.approxDistrict', { place: loc.label ?? '' })
  else if (loc?.source === 'state') text = t('weather.approxState', { place: loc.label ?? '' })

  return (
    <Card className="flex flex-col gap-3">
      {text && (
        <p className="flex gap-2 text-sm text-stone-700">
          <MapPin className="mt-0.5 size-4 shrink-0 text-brand-700" />
          {text}
        </p>
      )}
      {!loc && failed && <Notice tone="warn">{t('home.setState')}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => locate()} disabled={locating} className={secondaryButton}>
          <LocateFixed className="size-5" />
          {locating ? t('weather.locating') : loc?.source === 'gps' ? t('weather.updateGps') : t('weather.useGps')}
        </button>
        {loc?.source === 'gps' && area && (
          <button onClick={() => update({ coords: undefined })} className={secondaryButton}>
            {t('weather.useArea', { place: area })}
          </button>
        )}
      </div>
    </Card>
  )
}

export function Weather() {
  const { t, lang, bcp47 } = useT()
  const { loc, data, loading, error, savedAt, reload } = useWeather()
  const { alerts } = useAlerts()

  const hours = useMemo(() => (data ? upcomingHours(data) : []), [data])
  const now = data ? currentHour(data) : undefined
  const today = data ? todayForecast(data) : undefined
  const advice = useMemo(() => (data ? farmAdvice(data, lang, bcp47, t) : []), [data, lang, bcp47, t])
  const stale = Boolean(savedAt && (error || Date.now() - savedAt > STALE_FORECAST_MS))
  const dayName = (date: string) =>
    date === todayInIndia()
      ? t('weather.today')
      : date === todayInIndia(1)
        ? t('weather.tomorrow')
        : new Date(`${date}T12:00:00`).toLocaleDateString(bcp47, { weekday: 'short', day: 'numeric' })

  return (
    <>
      <PageHeader
        title={t('weather.title')}
        action={
          loc && (
            <button onClick={reload} aria-label={t('common.retry')} className="rounded-full p-3 text-stone-600 active:bg-stone-100">
              <RefreshCw className={`size-5 ${loading ? 'motion-safe:animate-spin' : ''}`} />
            </button>
          )
        }
      />
      <main className="flex flex-col gap-3 p-3 pb-24">
        <LocationCard loc={loc} />
        <OfficialAlerts alerts={alerts} />

        {loc && stale && savedAt ? <Notice tone="warn">{t('common.updated', { time: formatDateTime(savedAt, bcp47) })}</Notice> : null}
        {loc && error && !data ? <ErrorNotice error={error} onRetry={reload} /> : null}
        {loc && loading && !data && <Spinner label={t('common.loading')} />}

        {data && !now && <Notice tone="warn">{t('weather.oldForecast')}</Notice>}

        {data && (
          <>
            {now && (
              <Card className="flex items-center gap-4">
                <WeatherIcon kind={now.kind} className="size-16" />
                <div className="flex-1">
                  <p className="text-sm text-stone-600">{loc?.label ?? t('weather.myLocation')}</p>
                  <p className="text-4xl font-bold">{Math.round(now.temp)}°C</p>
                  <p className="font-medium">{t(`weather.kind.${now.kind}` as MessageKey)}</p>
                </div>
                <dl className="space-y-1 text-sm text-stone-700">
                  {today && (
                    <div className="flex items-center gap-1">
                      <Droplets className="size-4 text-sky-600" aria-hidden />
                      <dt>{t('weather.rain')}</dt>
                      <dd>
                        {today.rainMm} {t('weather.mm')}
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Wind className="size-4 text-stone-600" aria-hidden />
                    <dt>{t('weather.wind')}</dt>
                    <dd>
                      {now.windKmh} {t('weather.kmh')}
                    </dd>
                  </div>
                  <div className="flex items-center gap-1">
                    <dt>{t('weather.humidity')}</dt>
                    <dd>{now.humidity}%</dd>
                  </div>
                </dl>
              </Card>
            )}

            {advice.length > 0 && (
              <Card>
                <h2 className="mb-2 font-bold">{t('weather.advice')}</h2>
                <ul className="space-y-2">
                  {advice.map((a, i) => {
                    const Icon = a.tone === 'good' ? CheckCircle2 : a.tone === 'warn' ? TriangleAlert : Info
                    const color = a.tone === 'good' ? 'text-brand-700' : a.tone === 'warn' ? 'text-amber-600' : 'text-sky-700'
                    return (
                      <li key={i} className="flex gap-2">
                        <Icon className={`mt-0.5 size-5 shrink-0 ${color}`} aria-hidden />
                        <span>{t(a.key, a.vars)}</span>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            )}

            <PushOffer />

            {now && (
              <Card className="px-0">
                <div className="no-scrollbar flex gap-1 overflow-x-auto px-3">
                  {hours.slice(0, 24).map((h) => (
                    <div key={h.time} className="flex min-w-16 flex-col items-center gap-1 rounded-xl px-1 py-1 text-sm">
                      {/* "7:30 ఉదయం" is wider than the column: let the time of day wrap under the time. */}
                      <span className="text-center text-sm leading-tight text-stone-600">{formatTime(h.time, bcp47)}</span>
                      <WeatherIcon kind={h.kind} className="size-6" />
                      <span className="font-semibold">{Math.round(h.temp)}°</span>
                      <span className={`text-sm ${h.rainMm > 0 ? 'text-sky-700' : 'text-stone-500'}`}>
                        {h.rainMm > 0 ? `${h.rainMm} ${t('weather.mm')}` : '–'}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card>
              <h2 className="mb-1 font-bold">{t('weather.next7')}</h2>
              <ul className="divide-y divide-stone-100">
                {data.days
                  .filter((d) => d.date >= todayInIndia())
                  .map((d) => (
                    <li key={d.date} className="flex items-center gap-3 py-2.5">
                      <WeatherIcon kind={d.kind} className="size-7 shrink-0" />
                      {/* Day and sky on two lines: side by side, Indian-language sky names were cut to one letter. */}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{dayName(d.date)}</span>
                        <span className="block text-sm text-stone-700">{t(`weather.kind.${d.kind}` as MessageKey)}</span>
                      </span>
                      <span className={`w-16 shrink-0 text-right text-sm ${d.rainMm > 0 ? 'text-sky-700' : 'text-stone-500'}`}>
                        {d.rainMm} {t('weather.mm')}
                      </span>
                      <span className="w-16 shrink-0 text-right font-semibold">
                        {d.tMin}°/{d.tMax}°
                      </span>
                    </li>
                  ))}
              </ul>
            </Card>

            <p className="px-1 text-sm text-stone-600">
              {/* MET Norway's licence asks for a link to the source and to CC BY 4.0. */}
              {t('weather.source')
                .split(/(MET Norway|CC BY 4\.0)/)
                .map((part, i) =>
                  part === 'MET Norway' ? (
                    <a key={i} href="https://api.met.no/" target="_blank" rel="noopener noreferrer" className="underline">
                      MET Norway
                    </a>
                  ) : part === 'CC BY 4.0' ? (
                    <a key={i} href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="underline">
                      CC BY 4.0
                    </a>
                  ) : (
                    part
                  ),
                )}{' '}
              · {t('common.updated', { time: formatDateTime(Date.parse(data.updatedAt), bcp47) })}
            </p>
          </>
        )}

        {/* IMD's official district advisories: crop-specific, in local languages, updated Tuesday and Friday. */}
        <a href="https://imdagrimet.gov.in/cropAdvisory_3.php" target="_blank" rel="noopener noreferrer" className="block">
          <Card className="flex items-start gap-3 active:bg-stone-50">
            <ExternalLink className="mt-1 size-5 shrink-0 text-sky-700" />
            <div>
              <p className="font-semibold">{t('weather.imdTitle')}</p>
              <p className="text-sm text-stone-700">{t('weather.imdBody')}</p>
            </div>
          </Card>
        </a>
      </main>
    </>
  )
}

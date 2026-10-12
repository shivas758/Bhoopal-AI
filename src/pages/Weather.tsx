import { CheckCircle2, Droplets, Info, LocateFixed, RefreshCw, TriangleAlert, Wind } from 'lucide-react'
import { useState } from 'react'
import { Card, ErrorNotice, Notice, PageHeader, Spinner, secondaryButton } from '../components/ui'
import { WeatherIcon } from '../components/WeatherIcon'
import type { MessageKey } from '../i18n'
import { farmAdvice } from '../lib/advice'
import { upcomingHours, useWeather } from '../lib/data'
import { formatDateTime, formatTime, todayInIndia } from '../lib/format'
import { useSettings, useT } from '../settings'

export function Weather() {
  const { t, lang, bcp47 } = useT()
  const { update } = useSettings()
  const { loc, data, loading, error, savedAt, reload } = useWeather()
  const [locating, setLocating] = useState(false)
  const [gpsFailed, setGpsFailed] = useState(false)

  const useGps = () => {
    if (!navigator.geolocation) return setGpsFailed(true)
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        setGpsFailed(false)
        update({ coords: { lat: pos.coords.latitude, lon: pos.coords.longitude } })
      },
      () => {
        setLocating(false)
        setGpsFailed(true)
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 30 * 60 * 1000 },
    )
  }

  const hours = data ? upcomingHours(data) : []
  const now = hours[0]
  const today = data?.days[0]
  const advice = data ? farmAdvice(data, lang, bcp47, t) : []
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
            <button onClick={reload} aria-label={t('common.retry')} className="rounded-full p-2 text-stone-600 active:bg-stone-100">
              <RefreshCw className={`size-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )
        }
      />
      <main className="flex flex-col gap-3 p-3 pb-24">
        {(!loc || !loc.gps || gpsFailed) && (
          <Card className="flex flex-col gap-3">
            {loc?.label && (
              <p className="text-sm text-stone-600">
                {gpsFailed ? t('weather.gpsDenied', { place: loc.label }) : t('weather.showingFor', { place: loc.label })}
              </p>
            )}
            {!loc && gpsFailed && <Notice tone="warn">{t('home.setState')}</Notice>}
            <button onClick={useGps} disabled={locating} className={secondaryButton}>
              <LocateFixed className="size-5" />
              {locating ? t('weather.locating') : t('weather.useGps')}
            </button>
          </Card>
        )}

        {loc && error && data && savedAt ? <Notice tone="warn">{t('common.updated', { time: formatDateTime(savedAt, bcp47) })}</Notice> : null}
        {loc && error && !data ? <ErrorNotice error={error} onRetry={reload} /> : null}
        {loc && loading && !data && <Spinner label={t('common.loading')} />}

        {data && now && today && (
          <>
            <Card className="flex items-center gap-4">
              <WeatherIcon kind={now.kind} className="size-16" />
              <div className="flex-1">
                <p className="text-sm text-stone-500">{loc?.label ?? t('weather.myLocation')}</p>
                <p className="text-4xl font-bold">{Math.round(now.temp)}°C</p>
                <p className="font-medium">{t(`weather.kind.${now.kind}` as MessageKey)}</p>
              </div>
              <dl className="space-y-1 text-sm text-stone-600">
                <div className="flex items-center gap-1">
                  <Droplets className="size-4 text-sky-600" />
                  <dt className="sr-only">{t('weather.rain')}</dt>
                  <dd>{today.rainMm} mm</dd>
                </div>
                <div className="flex items-center gap-1">
                  <Wind className="size-4 text-stone-500" />
                  <dt className="sr-only">{t('weather.wind')}</dt>
                  <dd>{now.windKmh} km/h</dd>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-stone-400">RH</span>
                  <dt className="sr-only">{t('weather.humidity')}</dt>
                  <dd>{now.humidity}%</dd>
                </div>
              </dl>
            </Card>

            <Card>
              <h2 className="mb-2 font-bold">{t('weather.advice')}</h2>
              <ul className="space-y-2">
                {advice.map((a, i) => {
                  const Icon = a.tone === 'good' ? CheckCircle2 : a.tone === 'warn' ? TriangleAlert : Info
                  const color = a.tone === 'good' ? 'text-brand-700' : a.tone === 'warn' ? 'text-amber-600' : 'text-sky-700'
                  return (
                    <li key={i} className="flex gap-2">
                      <Icon className={`mt-0.5 size-5 shrink-0 ${color}`} />
                      <span>{t(a.key, a.vars)}</span>
                    </li>
                  )
                })}
              </ul>
            </Card>

            <Card className="px-0">
              <div className="no-scrollbar flex gap-1 overflow-x-auto px-3">
                {hours.slice(0, 24).map((h) => (
                  <div key={h.time} className="flex min-w-14 flex-col items-center gap-1 rounded-xl px-1 py-1 text-sm">
                    <span className="whitespace-nowrap text-xs text-stone-500">{formatTime(h.time, bcp47)}</span>
                    <WeatherIcon kind={h.kind} className="size-6" />
                    <span className="font-semibold">{Math.round(h.temp)}°</span>
                    <span className={`text-xs ${h.rainMm > 0 ? 'text-sky-700' : 'text-stone-300'}`}>{h.rainMm > 0 ? `${h.rainMm}mm` : '–'}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h2 className="mb-1 font-bold">{t('weather.next7')}</h2>
              <ul className="divide-y divide-stone-100">
                {data.days.map((d) => (
                  <li key={d.date} className="flex items-center gap-3 py-2.5">
                    <span className="w-24 shrink-0 font-medium">{dayName(d.date)}</span>
                    <WeatherIcon kind={d.kind} className="size-7" />
                    <span className="flex-1 truncate text-sm text-stone-600">{t(`weather.kind.${d.kind}` as MessageKey)}</span>
                    <span className={`w-14 text-right text-sm ${d.rainMm > 0 ? 'text-sky-700' : 'text-stone-400'}`}>{d.rainMm} mm</span>
                    <span className="w-16 text-right font-semibold">
                      {d.tMin}°/{d.tMax}°
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <p className="px-1 text-xs text-stone-600">
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
      </main>
    </>
  )
}

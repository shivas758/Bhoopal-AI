import { Calculator, Camera, ChevronRight, CloudSun, Landmark, Loader2, MessageCircle, Mic, Plus, Send, Settings as SettingsIcon, Sprout } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { COMMODITIES, type Commodity } from '../../shared/commodities'
import { findState } from '../../shared/states'
import { Card, ErrorNotice, ExperimentalBadge } from '../components/ui'
import { InstallCard } from '../components/PwaPrompts'
import { WeatherIcon } from '../components/WeatherIcon'
import type { MessageKey } from '../i18n'
import { farmAdvice } from '../lib/advice'
import { api } from '../lib/api'
import { upcomingHours, useWeather } from '../lib/data'
import { formatDate, formatDateTime, formatNumber, formatRupees } from '../lib/format'
import { useOfflineData } from '../lib/hooks'
import { go, goAsk, type Route } from '../lib/router'
import { readJson, writeJson } from '../lib/storage'
import { useSettings, useT } from '../settings'

function greetingKey(): MessageKey {
  const hour = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCHours()
  if (hour >= 5 && hour < 12) return 'home.greetMorning'
  if (hour >= 12 && hour < 17) return 'home.greetAfternoon'
  if (hour >= 17 && hour < 22) return 'home.greetEvening'
  return 'home.greeting'
}

function AskCard() {
  const { t } = useT()
  const [text, setText] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (text.trim()) goAsk({ q: text.trim() })
    else go('chat')
  }
  return (
    <Card className="bg-gradient-to-br from-brand-700 to-brand-800 text-white">
      <p className="mb-3 text-white/90">{t('home.askHint')}</p>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.placeholder')}
          className="min-w-0 flex-1 rounded-xl px-3 py-3 text-stone-900 outline-none placeholder:text-stone-500"
        />
        {text.trim() ? (
          <button aria-label={t('chat.send')} className="rounded-xl bg-amber-400 px-4 text-stone-900">
            <Send className="size-6" />
          </button>
        ) : (
          <button type="button" onClick={() => goAsk({ voice: '1' })} aria-label={t('chat.mic')} className="rounded-xl bg-amber-400 px-4 text-stone-900">
            <Mic className="size-6" />
          </button>
        )}
      </form>
    </Card>
  )
}

function WeatherCard() {
  const { t, lang, bcp47 } = useT()
  const { loc, data } = useWeather()
  if (!loc) {
    return (
      <button onClick={() => go('settings')} className="w-full text-left">
        <Card className="flex items-center gap-3">
          <CloudSun className="size-8 text-amber-500" />
          <span className="flex-1">{t('home.setState')}</span>
          <ChevronRight className="size-5 text-stone-400" />
        </Card>
      </button>
    )
  }
  const now = data ? upcomingHours(data)[0] : undefined
  const today = data?.days[0]
  // Safety warnings (heat, thunder, heavy rain) come first, so they reach the Home screen.
  const advice = data ? farmAdvice(data, lang, bcp47, t)[0] : undefined
  return (
    <button onClick={() => go('weather')} className="w-full text-left">
      <Card>
        <div className="flex items-center gap-3">
          {now ? <WeatherIcon kind={now.kind} className="size-10" /> : <CloudSun className="size-10 text-stone-300" />}
          <div className="flex-1">
            <p className="text-sm text-stone-600">{loc.label ?? t('weather.myLocation')}</p>
            <p className="text-lg font-semibold">{now ? `${Math.round(now.temp)}°C · ${t(`weather.kind.${now.kind}` as MessageKey)}` : t('feature.weather')}</p>
            {today && (
              <p className="text-sm text-stone-600">
                {today.tMin}° / {today.tMax}° · {t('weather.rain')} {today.rainMm} mm
              </p>
            )}
          </div>
          <ChevronRight className="size-5 text-stone-400" />
        </div>
        {advice && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${advice.tone === 'warn' ? 'bg-amber-50 text-amber-950' : advice.tone === 'good' ? 'bg-brand-50 text-brand-900' : 'bg-stone-100'}`}
          >
            {t(advice.key, advice.vars)}
          </p>
        )}
      </Card>
    </button>
  )
}

/** Today's mandi prices for one crop, straight from Agmarknet (no AI), saved for offline use. */
function PriceCard({ crop }: { crop: Commodity }) {
  const { t, lang, bcp47 } = useT()
  const { settings } = useSettings()
  const state = findState(settings.state)
  const key = state ? `prices:${crop.id}:${state.id}:${settings.district ?? ''}` : null
  const { data, loading, error, savedAt, reload } = useOfflineData(key, () => api.prices(crop.id, state!.id, settings.district))
  const name = crop.names[lang]

  if (!state) {
    return (
      <button onClick={() => go('settings')} className="mt-3 w-full rounded-xl bg-stone-100 px-3 py-2 text-left text-sm">
        {t('home.setState')}
      </button>
    )
  }
  if (!data) {
    return loading ? (
      <p className="mt-3 inline-flex items-center gap-2 text-sm text-stone-600">
        <Loader2 className="size-4 animate-spin" /> {t('chat.checkingPrices')}
      </p>
    ) : error ? (
      <div className="mt-3">
        <ErrorNotice error={error} onRetry={reload} />
      </div>
    ) : null
  }

  const form = 'error' in data ? undefined : data.forms[0]
  const rows = form?.rows.filter((r) => !r.suspicious).slice(0, 3) ?? []
  const perQuintal = rows.every((r) => /quintal/i.test(r.unit))
  return (
    <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50 p-3">
      {'error' in data || !form || !rows.length ? (
        <p className="text-sm">{t('price.none', { crop: name })}</p>
      ) : (
        <>
          <p className="text-sm text-brand-900">
            {data.scope === 'district' && data.district
              ? t('price.inDistrict', { district: data.district })
              : t('price.acrossState', { state: state.names[lang] })}
          </p>
          {perQuintal && (
            <p className="text-lg font-bold text-brand-900">
              {t('price.typical', { price: formatRupees(form.typicalPrice) })}
              <span className="block text-sm font-medium">{t('price.perKg', { price: `₹${formatNumber(Math.round(form.typicalPrice) / 100)}` })}</span>
            </p>
          )}
          <ul className="mt-2 divide-y divide-brand-100 text-sm">
            {rows.map((r) => (
              <li key={`${r.market}${r.date}`} className="flex justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">
                  {r.market} · {formatDate(r.date, bcp47)}
                </span>
                <span className="shrink-0 font-semibold">
                  {formatRupees(r.modalPrice)}
                  {!perQuintal && ` ${r.unit}`}
                </span>
              </li>
            ))}
          </ul>
          {data.msp && <p className="mt-1 text-sm text-stone-700">{t('price.msp', { price: formatRupees(data.msp.price) })}</p>}
        </>
      )}
      {savedAt && (error || Date.now() - savedAt > 3 * 3600 * 1000) && (
        <p className="mt-1 text-xs text-stone-600">{t('common.updated', { time: formatDateTime(savedAt, bcp47) })}</p>
      )}
      <button
        onClick={() => goAsk({ crop: crop.id })}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-brand-800 ring-1 ring-brand-200"
      >
        <MessageCircle className="size-4" /> {t('price.ask', { crop: name })}
      </button>
    </div>
  )
}

/** The farmer's crops: tap one to see its mandi prices; the chat can explain them. */
function MyCropsCard() {
  const { t, lang } = useT()
  const { settings } = useSettings()
  const crops = settings.crops.map((id) => COMMODITIES.find((c) => c.id === id)).filter((c) => c !== undefined)
  const [selected, setSelected] = useState(() => readJson<string>('home.crop', ''))
  const crop = crops.find((c) => c.id === selected) ?? crops[0]
  const pick = (id: string) => {
    setSelected(id)
    writeJson('home.crop', id)
  }

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <Sprout className="size-5 text-brand-700" />
        <h2 className="flex-1 font-bold">{t('home.myCrops')}</h2>
      </div>
      {crops.length === 0 ? (
        <button
          onClick={() => go('settings')}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand-600 px-3 py-2 text-sm font-medium text-brand-800"
        >
          <Plus className="size-4" /> {t('home.addCrops')}
        </button>
      ) : (
        <>
          <p className="mb-3 text-sm text-stone-600">{t('home.myCropsHint')}</p>
          <div className="flex flex-wrap gap-2">
            {crops.map((c) => (
              <button
                key={c.id}
                onClick={() => pick(c.id)}
                aria-pressed={c.id === crop?.id}
                className={`rounded-full px-3 py-2 text-sm font-semibold ring-1 ${
                  c.id === crop?.id ? 'bg-brand-700 text-white ring-brand-700' : 'bg-brand-50 text-brand-900 ring-brand-200 active:bg-brand-100'
                }`}
              >
                {c.names[lang]}
              </button>
            ))}
          </div>
          {crop && <PriceCard key={crop.id} crop={crop} />}
        </>
      )}
    </Card>
  )
}

const FEATURES: { route: Route; label: MessageKey; Icon: typeof Camera; tint: string; experimental?: boolean }[] = [
  { route: 'diagnose', label: 'feature.diagnose', Icon: Camera, tint: 'bg-rose-100 text-rose-700', experimental: true },
  { route: 'weather', label: 'feature.weather', Icon: CloudSun, tint: 'bg-amber-100 text-amber-800' },
  { route: 'schemes', label: 'feature.schemes', Icon: Landmark, tint: 'bg-sky-100 text-sky-800' },
  { route: 'tools', label: 'feature.tools', Icon: Calculator, tint: 'bg-violet-100 text-violet-800' },
]

export function Home() {
  const { t } = useT()
  return (
    <>
      <header className="flex items-center gap-3 px-4 pt-4">
        <img src="/logo.svg" alt="" className="size-11 rounded-xl" />
        <div className="flex-1">
          <p className="text-xl font-bold leading-tight text-brand-800">BhooPal</p>
          <p className="text-sm text-stone-600">{t('app.tagline')}</p>
        </div>
        <button onClick={() => go('settings')} aria-label={t('feature.settings')} className="rounded-full p-2.5 text-stone-600 active:bg-stone-200">
          <SettingsIcon className="size-6" />
        </button>
      </header>
      <main className="flex flex-col gap-4 p-4">
        <h1 className="text-2xl font-bold">{t(greetingKey())}</h1>
        <AskCard />
        <InstallCard />
        <WeatherCard />
        <MyCropsCard />
        <div className="grid grid-cols-2 gap-3">
          {FEATURES.map(({ route, label, Icon, tint, experimental }) => (
            <button
              key={route}
              onClick={() => go(route)}
              className="flex flex-col items-start gap-2 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm active:bg-stone-50"
            >
              <span className={`rounded-xl p-2 ${tint}`}>
                <Icon className="size-6" />
              </span>
              <span className="font-semibold leading-snug">{t(label)}</span>
              {experimental && <ExperimentalBadge />}
            </button>
          ))}
        </div>
      </main>
    </>
  )
}

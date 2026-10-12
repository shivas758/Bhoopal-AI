import { Calculator, Camera, ChevronRight, CloudSun, IndianRupee, Landmark, Mic, Plus, Send, Settings as SettingsIcon, Sprout } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { COMMODITIES } from '../../shared/commodities'
import { Card, ExperimentalBadge } from '../components/ui'
import { InstallCard } from '../components/PwaPrompts'
import { WeatherIcon } from '../components/WeatherIcon'
import type { MessageKey } from '../i18n'
import { farmAdvice } from '../lib/advice'
import { upcomingHours, useWeather } from '../lib/data'
import { go, type Route } from '../lib/router'
import { useSettings, useT } from '../settings'

function AskCard() {
  const { t } = useT()
  const [text, setText] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (text.trim()) go('chat', { q: text.trim() })
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
          className="min-w-0 flex-1 rounded-xl px-3 py-3 text-stone-900 outline-none"
        />
        {text.trim() ? (
          <button aria-label={t('chat.send')} className="rounded-xl bg-amber-400 px-4 text-stone-900">
            <Send className="size-6" />
          </button>
        ) : (
          <button type="button" onClick={() => go('chat', { voice: '1' })} aria-label={t('chat.mic')} className="rounded-xl bg-amber-400 px-4 text-stone-900">
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
  const advice = data ? farmAdvice(data, lang, bcp47, t)[0] : undefined
  return (
    <button onClick={() => go('weather')} className="w-full text-left">
      <Card>
        <div className="flex items-center gap-3">
          {now ? <WeatherIcon kind={now.kind} className="size-10" /> : <CloudSun className="size-10 text-stone-300" />}
          <div className="flex-1">
            <p className="text-sm text-stone-500">{loc.label ?? t('weather.myLocation')}</p>
            <p className="text-lg font-semibold">
              {now ? `${Math.round(now.temp)}°C · ${t(`weather.kind.${now.kind}` as MessageKey)}` : t('feature.weather')}
            </p>
            {today && (
              <p className="text-sm text-stone-600">
                {today.tMin}° / {today.tMax}° · {t('weather.rain')} {today.rainMm} mm
              </p>
            )}
          </div>
          <ChevronRight className="size-5 text-stone-400" />
        </div>
        {advice && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${advice.tone === 'warn' ? 'bg-amber-50 text-amber-950' : advice.tone === 'good' ? 'bg-brand-50 text-brand-900' : 'bg-stone-100'}`}>
            {t(advice.key, advice.vars)}
          </p>
        )}
      </Card>
    </button>
  )
}

/** The farmer's crops as one-tap questions: prices come from the chat, which can also explain them. */
function MyCropsCard() {
  const { t, lang } = useT()
  const { settings } = useSettings()
  const crops = settings.crops.map((id) => COMMODITIES.find((c) => c.id === id)).filter((c) => c !== undefined)

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <Sprout className="size-5 text-brand-700" />
        <h2 className="flex-1 font-bold">{t('home.myCrops')}</h2>
      </div>
      {crops.length === 0 ? (
        <button onClick={() => go('settings')} className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand-600 px-3 py-2 text-sm font-medium text-brand-800">
          <Plus className="size-4" /> {t('home.addCrops')}
        </button>
      ) : (
        <>
          <p className="mb-3 text-sm text-stone-600">{t('home.myCropsHint')}</p>
          <div className="flex flex-wrap gap-2">
            {crops.map((c) => (
              <button
                key={c.id}
                onClick={() => go('chat', { q: t('home.askPrice', { crop: c.names[lang] }) })}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-900 ring-1 ring-brand-200 active:bg-brand-100"
              >
                <IndianRupee className="size-4" /> {c.names[lang]}
              </button>
            ))}
          </div>
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
          <p className="text-sm text-stone-500">{t('app.tagline')}</p>
        </div>
        <button onClick={() => go('settings')} aria-label={t('feature.settings')} className="rounded-full p-2 text-stone-600 active:bg-stone-200">
          <SettingsIcon className="size-6" />
        </button>
      </header>
      <main className="flex flex-col gap-4 p-4">
        <h1 className="text-2xl font-bold">{t('home.greeting')}</h1>
        <AskCard />
        <InstallCard />
        <WeatherCard />
        <MyCropsCard />
        <div className="grid grid-cols-2 gap-3">
          {FEATURES.map(({ route, label, Icon, tint, experimental }) => (
            <button key={route} onClick={() => go(route)} className="flex flex-col items-start gap-2 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm active:bg-stone-50">
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

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { findState } from '../shared/states'
import { LANG_INFO, LANGS, isLang, type Lang } from '../shared/types'
import { dictLoaded, loadDict, translate, type MessageKey, type TranslateVars } from './i18n'
import { readJson, writeJson } from './lib/storage'

export interface Settings {
  lang: Lang | null
  /** First-launch questions (language, state, district, crops) answered or skipped. */
  onboarded: boolean
  state?: string
  district?: string
  /** Last GPS fix (rounded to ~1 km) and when it was taken. */
  coords?: { lat: number; lon: number; at?: number }
  /** Crops the farmer grows: commodity ids from shared/commodities (English names). */
  crops: string[]
  autoSpeak: boolean
  photoConsent: boolean
  /** Morning weather message and official warnings by push notification. */
  alerts: boolean
  /** When the farmer closed the "add to home screen" screen (Not now, or Continue after installing). */
  installDismissedAt?: number
  /** When Android reported BhooPal installed (install dialog accepted, appinstalled, or getInstalledRelatedApps). */
  installedAt?: number
}

const DEFAULTS: Settings = { lang: null, onboarded: false, crops: [], autoSpeak: false, photoConsent: false, alerts: false }

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length < 60).slice(0, 30) : undefined)
/** A saved moment (ms since 1970), or nothing. */
const when = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined)

/** Saved settings, checked field by field: a corrupt or hand-edited value must never blank the app. */
export function load(): Settings {
  const raw = readJson<unknown>('settings', {})
  const saved = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const lang = isLang(saved.lang) ? saved.lang : null
  const state = typeof saved.state === 'string' && findState(saved.state) ? saved.state : undefined
  const coords = saved.coords as { lat?: unknown; lon?: unknown; at?: unknown } | undefined
  return {
    lang,
    // Older versions had no onboarded flag.
    onboarded: typeof saved.onboarded === 'boolean' ? saved.onboarded && Boolean(lang) : Boolean(lang),
    state,
    district: state && typeof saved.district === 'string' && saved.district.length < 80 ? saved.district : undefined,
    coords:
      coords && typeof coords.lat === 'number' && typeof coords.lon === 'number' && Number.isFinite(coords.lat) && Number.isFinite(coords.lon)
        ? { lat: coords.lat, lon: coords.lon, ...(typeof coords.at === 'number' ? { at: coords.at } : {}) }
        : undefined,
    // Older versions had followed crops instead of grown crops.
    crops: strings(saved.crops) ?? strings(saved.favCrops) ?? DEFAULTS.crops,
    autoSpeak: saved.autoSpeak === true,
    photoConsent: saved.photoConsent === true,
    alerts: saved.alerts === true,
    installDismissedAt: when(saved.installDismissedAt),
    installedAt: when(saved.installedAt),
  }
}

interface SettingsContextValue {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load)

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      writeJson('settings', next)
      return next
    })
  }, [])

  // The farmer's language loads before the screens render, so they never flash up in English first.
  const lang = settings.lang ?? 'en'
  const [readyLang, setReadyLang] = useState<Lang | null>(() => (dictLoaded(lang) ? lang : null))
  useEffect(() => {
    let live = true
    // If it can't load (offline before the app was saved), English is better than a blank screen.
    const done = () => live && setReadyLang(lang)
    loadDict(lang).then(done, done)
    return () => {
      live = false
    }
  }, [lang])

  useEffect(() => {
    document.documentElement.lang = LANG_INFO[lang].bcp47
  }, [lang])

  const value = useMemo(() => ({ settings, update }), [settings, update])
  if (readyLang !== lang) return <Splash />
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

/** Same as the loading screen in index.html (its styles live there). */
function Splash() {
  return (
    <div className="splash">
      <img src="/logo.svg" alt="" />
      <b>BhooPal</b>
      <i />
    </div>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings outside SettingsProvider')
  return ctx
}

export function useT() {
  const lang = useSettings().settings.lang ?? 'en'
  return useMemo(
    () => ({
      lang,
      bcp47: LANG_INFO[lang].bcp47,
      t: (key: MessageKey, vars?: TranslateVars) => translate(lang, key, vars),
    }),
    [lang],
  )
}

/** Best guess from the phone's language, used to pre-select on first launch. */
export function guessLang(): Lang {
  for (const l of navigator.languages ?? []) {
    const code = l.slice(0, 2).toLowerCase()
    if ((LANGS as readonly string[]).includes(code)) return code as Lang
  }
  return 'en'
}

/** The saved language read straight from storage, for screens shown when the app itself has failed. */
export function savedLang(): Lang {
  try {
    return load().lang ?? guessLang()
  } catch {
    return 'en'
  }
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LANG_INFO, LANGS, type Lang } from '../shared/types'
import { translate, type MessageKey, type TranslateVars } from './i18n'
import { readJson, writeJson } from './lib/storage'

export interface Settings {
  lang: Lang | null
  /** First-launch questions (language, state, district, crops) answered or skipped. */
  onboarded: boolean
  state?: string
  district?: string
  /** Last GPS fix, for weather. */
  coords?: { lat: number; lon: number }
  /** Crops the farmer grows: commodity ids from shared/commodities (English names). */
  crops: string[]
  autoSpeak: boolean
  photoConsent: boolean
}

const DEFAULTS: Settings = { lang: null, onboarded: false, crops: [], autoSpeak: false, photoConsent: false }

function load(): Settings {
  const saved = readJson<Partial<Settings> & { favCrops?: string[] }>('settings', {})
  return {
    ...DEFAULTS,
    ...saved,
    // Older versions had followed crops instead of grown crops, and no onboarded flag.
    crops: saved.crops ?? saved.favCrops ?? [],
    onboarded: saved.onboarded ?? Boolean(saved.lang),
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

  useEffect(() => {
    document.documentElement.lang = LANG_INFO[settings.lang ?? 'en'].bcp47
  }, [settings.lang])

  const value = useMemo(() => ({ settings, update }), [settings, update])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
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

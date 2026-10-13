import type { Lang } from '../types'
import { weatherEn, type WeatherText, type WeatherTextKey } from './en'
import { weatherHi } from './hi'
import { weatherKn } from './kn'
import { weatherMl } from './ml'
import { weatherTa } from './ta'
import { weatherTe } from './te'

export type { WeatherText, WeatherTextKey }

/** All six languages, for the Worker. The app imports only the farmer's language (through src/i18n). */
export const WEATHER_TEXT: Record<Lang, WeatherText> = { en: weatherEn, hi: weatherHi, te: weatherTe, ta: weatherTa, kn: weatherKn, ml: weatherMl }

export type TextVars = Record<string, string | number>

/** Fills {name} placeholders, like the app's t(). */
export function weatherT(lang: Lang) {
  return (key: WeatherTextKey, vars?: TextVars) => {
    const text = WEATHER_TEXT[lang][key] ?? weatherEn[key]
    return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text
  }
}

import type { Lang } from '../../shared/types'
import { en, type Dict, type MessageKey } from './en'

export type { MessageKey }

// English ships with the app (it is also the fallback for a missing key). The farmer's own language is a separate
// file loaded at start-up, so a phone never downloads or parses the four dictionaries it doesn't use.
const dicts: Partial<Record<Lang, Dict>> = { en }
const loaders: Record<Exclude<Lang, 'en'>, () => Promise<Dict>> = {
  hi: () => import('./hi').then((m) => m.hi),
  te: () => import('./te').then((m) => m.te),
  ta: () => import('./ta').then((m) => m.ta),
  kn: () => import('./kn').then((m) => m.kn),
  ml: () => import('./ml').then((m) => m.ml),
}

export const dictLoaded = (lang: Lang) => Boolean(dicts[lang])

/** Loads a language's words (from the offline copy after the first visit). */
export async function loadDict(lang: Lang) {
  if (lang === 'en' || dicts[lang]) return
  dicts[lang] = await loaders[lang]()
}

export type TranslateVars = Record<string, string | number>

export function translate(lang: Lang, key: MessageKey, vars?: TranslateVars): string {
  const text = dicts[lang]?.[key] ?? en[key]
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text
}

import type { Lang } from '../../shared/types'
import { en, type Dict, type MessageKey } from './en'
import { hi } from './hi'
import { kn } from './kn'
import { ml } from './ml'
import { ta } from './ta'
import { te } from './te'

export type { MessageKey }

const DICTS: Record<Lang, Dict> = { en, hi, te, ta, kn, ml }

export type TranslateVars = Record<string, string | number>

export function translate(lang: Lang, key: MessageKey, vars?: TranslateVars): string {
  const text = DICTS[lang][key] ?? en[key]
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text
}

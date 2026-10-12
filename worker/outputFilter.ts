import { findBannedPesticide } from '../shared/pesticides'
import { PHRASES, fill } from '../shared/phrases'
import { EXTRA_ALLOWED_PHONES, HELPLINES, KCC_PHONE, SCHEMES } from '../shared/schemes'
import { asciiDigits } from '../shared/text'
import type { Lang } from '../shared/types'

const digitsOnly = (s: string) => s.replace(/\D/g, '')

const ALLOWED = new Set([...HELPLINES.map((h) => h.phone), ...SCHEMES.flatMap((s) => s.phones), ...EXTRA_ALLOWED_PHONES, '108', '112'].map(digitsOnly))

// Mobiles (+91 optional), 1800/1900 toll-free numbers, landlines with an STD code and a separator.
const LONG_NUMBER =
  /(?<![\d+])(?:(?:\+91|0091)[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)|(?<!\d)1[89]00[\s-]?\d{2,4}[\s-]?\d{3,4}(?!\d)|(?<!\d)0\d{2,4}[\s-]\d{6,8}(?!\d)/g

// Answers are full of other numbers (doses, rupees, years), so a short code counts only right after a call word.
const CALL_WORDS = [
  'call',
  'dial',
  'phone',
  'helpline',
  'whatsapp',
  'ring',
  'कॉल',
  'फोन',
  'फ़ोन',
  'हेल्पलाइन',
  'डायल',
  'కాల్',
  'ఫోన్',
  'హెల్ప్‌లైన్',
  'హెల్ప్లైన్',
  'அழை',
  'கால்',
  'போன்',
  'ஃபோன்',
  'உதவி எண்',
  'ಕರೆ',
  'ಫೋನ್',
  'ಸಹಾಯವಾಣಿ',
  'വിളി',
  'ഫോൺ',
  'കോൾ',
  'ഹെൽപ്‌ലൈൻ',
  'ഹെൽപ്ലൈൻ',
]
const SHORT_CODE = new RegExp(`(?:${CALL_WORDS.join('|')})[^\\d\\n]{0,20}?(?<![\\d-])(\\d{3,6})(?![\\s-]?\\d)`, 'gi')

/**
 * Replaces phone numbers that aren't on the verified list. Matching runs on a copy with Indian-script digits
 * turned into 0-9; that copy has the same positions, so the original text is edited in place.
 */
export function replaceUnknownPhones(text: string, lang: Lang): { text: string; removed: number } {
  const plain = asciiDigits(text)
  const cuts: { start: number; end: number }[] = []
  for (const m of plain.matchAll(LONG_NUMBER)) {
    if (!ALLOWED.has(digitsOnly(m[0]))) cuts.push({ start: m.index, end: m.index + m[0].length })
  }
  for (const m of plain.matchAll(SHORT_CODE)) {
    const num = m[1]
    const start = m.index + m[0].length - num.length
    if (!ALLOWED.has(num) && !cuts.some((c) => start < c.end && c.start < start + num.length)) cuts.push({ start, end: start + num.length })
  }
  if (!cuts.length) return { text, removed: 0 }
  const note = fill(PHRASES[lang].phoneRemoved, { kcc: KCC_PHONE })
  let out = ''
  let at = 0
  for (const c of cuts.sort((a, b) => a.start - b.start)) {
    out += text.slice(at, c.start) + note
    at = c.end
  }
  return { text: out + text.slice(at), removed: cuts.length }
}

// A sentence ends at . ! ? or । followed by whitespace (so "2.5 ml" is never split), or at a line break.
const BOUNDARY = /[.!?।](?=\s)|\n/g
// With no sentence end for this long, release text anyway so the farmer sees it, keeping a tail that could
// still be the start of a phone number.
const MAX_BUFFER = 300
const KEEP_TAIL = 30

/**
 * Safety net on the streamed chat answer: holds text back until a sentence is complete, then removes unverified
 * phone numbers and adds a warning line after any banned or restricted pesticide. The prompt already forbids
 * both; this catches the cases where a model ignores it.
 */
export function createOutputFilter(lang: Lang, emit: (text: string) => Promise<void>) {
  let buffer = ''
  const warned = new Set<string>()

  const release = async (text: string) => {
    if (!text) return
    const phones = replaceUnknownPhones(text, lang)
    if (phones.removed) console.warn(`output filter: removed ${phones.removed} unverified phone number(s)`)
    let out = phones.text
    const banned = findBannedPesticide(out)
    if (banned && !warned.has(banned.toLowerCase())) {
      warned.add(banned.toLowerCase())
      console.warn(`output filter: banned/restricted pesticide mentioned: ${banned}`)
      out += `${out.endsWith('\n') ? '' : '\n'}${fill(PHRASES[lang].bannedWarning, { name: banned })}\n`
    }
    await emit(out)
  }

  return {
    async push(text: string) {
      buffer += text
      let end = -1
      for (const m of buffer.matchAll(BOUNDARY)) end = m.index + m[0].length
      if (end < 0 && buffer.length > MAX_BUFFER) end = buffer.lastIndexOf(' ', buffer.length - KEEP_TAIL) + 1
      if (end <= 0) return
      const ready = buffer.slice(0, end)
      buffer = buffer.slice(end)
      await release(ready)
    },
    /** Releases whatever is held back: call at the end of the answer, before tool rounds, and on errors. */
    async flush() {
      const rest = buffer
      buffer = ''
      await release(rest)
    },
  }
}

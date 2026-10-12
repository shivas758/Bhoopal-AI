// Golden set: real questions to the real AI, checked with regexes. Costs Gemini quota, so it is NOT part of
// `npm test`. Run it against `npm run dev` with `npm run golden`.
//   GOLDEN_LIMIT=6     how many questions (default 6 = the first one in each language; 30 = all)
//   GOLDEN_LANG=te     only one language
//   GOLDEN_MODEL=gemini-2.5-flash   force one model (works only on localhost)
//   GOLDEN_BASE=http://localhost:5173
// Keep it to ~10 questions per model per day: the free tier allows ~20.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { findBannedPesticide } from '../shared/pesticides'
import { PHRASES } from '../shared/phrases'
import { LANG_INFO, type ChatEvent, type Lang } from '../shared/types'
import { answerLanguage } from '../src/lib/speech'

interface Golden {
  profiles: Record<Lang, { state: string; district: string; crops: string[] }>
  questions: { lang: Lang; q: string; expect?: string[]; emergency?: boolean; allowBanned?: boolean }[]
}

const golden = JSON.parse(readFileSync(new URL('./questions.json', import.meta.url), 'utf8')) as Golden
const base = process.env.GOLDEN_BASE ?? 'http://localhost:5173'
const limit = Number(process.env.GOLDEN_LIMIT ?? 6)
const questions = golden.questions.filter((q) => !process.env.GOLDEN_LANG || q.lang === process.env.GOLDEN_LANG).slice(0, limit)

async function ask(lang: Lang, q: string) {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bhoopal-device': 'golden-set-runner' },
    // noCache: a replayed answer from the shared cache would test nothing (honoured on localhost only).
    body: JSON.stringify({
      lang,
      ...golden.profiles[lang],
      messages: [{ role: 'user', text: q }],
      noCache: true,
      ...(process.env.GOLDEN_MODEL ? { model: process.env.GOLDEN_MODEL } : {}),
    }),
  })
  expect(res.ok, `HTTP ${res.status}`).toBe(true)
  const events = (await res.text())
    .split('\n\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('data:'))
    .map((l) => JSON.parse(l.slice(5)) as ChatEvent)
  const text = events.map((e) => (e.type === 'text' ? e.text : '')).join('')
  return { events, text }
}

// Tests in one file run one after another: no burst of parallel AI calls.
describe('golden questions', () => {
  for (const g of questions) {
    test(`${g.lang}: ${g.q}`, { timeout: 120_000 }, async () => {
      const { events, text } = await ask(g.lang, g.q)
      const error = events.find((e) => e.type === 'error')
      expect(error, `error event ${JSON.stringify(error)}`).toBeUndefined()
      expect(events.some((e) => e.type === 'done')).toBe(true)
      const model = events.findLast((e) => e.type === 'meta')
      console.log(`\n[${g.lang}] ${model?.type === 'meta' ? model.model : '?'}\n${text}\n`)

      // Written in the farmer's language and script (Romanized questions too).
      expect(answerLanguage(text, 'x')).toBe(LANG_INFO[g.lang].bcp47)
      // The Worker's filter had to remove a phone number the model invented.
      const removed = PHRASES[g.lang].phoneRemoved.split('{kcc}')[0]
      expect(text.includes(removed), 'model invented a phone number').toBe(false)
      // A banned or restricted pesticide recommended (outside the Worker's own warning line).
      if (!g.allowBanned) {
        const warning = PHRASES[g.lang].bannedWarning.split('{name}')[0]
        const answerOnly = text
          .split('\n')
          .filter((line) => !line.includes(warning))
          .join('\n')
        expect(findBannedPesticide(answerOnly), 'mentions a banned pesticide').toBeUndefined()
      }
      if (g.emergency) {
        expect(text).toMatch(/108|112/)
        expect(text, 'no emojis in an emergency').not.toMatch(/\p{Extended_Pictographic}/u)
      }
      for (const re of g.expect ?? []) expect(text).toMatch(new RegExp(re, 'iu'))
    })
  }
})

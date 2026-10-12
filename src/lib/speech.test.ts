import { expect, test } from 'vitest'
import { answerLanguage, chunks } from './speech'

test('the voice follows the script the answer is written in', () => {
  expect(answerLanguage('టమాటా ధర **₹2,200**/క్వింటాల్ (MSP, eNAM)', 'en-IN')).toBe('te-IN')
  expect(answerLanguage('Tomato price is ₹22 per kg', 'te-IN')).toBe('en-IN')
  expect(answerLanguage('टमाटर का भाव', 'ta-IN')).toBe('hi-IN')
  expect(answerLanguage('12345 ₹', 'kn-IN')).toBe('kn-IN')
})

test('decimals and times are never split', () => {
  expect(chunks('Mix 2.5 ml per litre.')).toEqual(['Mix 2.5 ml per litre.'])
  expect(chunks('Spray at 6.30 in the morning. Repeat after 10 days.')).toEqual(['Spray at 6.30 in the morning. Repeat after 10 days.'])
})

test('Hindi danda ends a sentence; long text is split', () => {
  const long = Array.from({ length: 8 }, (_, i) => `यह वाक्य संख्या ${i} है जो काफ़ी लंबा है।`).join(' ')
  const parts = chunks(long)
  expect(parts.length).toBeGreaterThan(1)
  expect(parts.every((p) => p.endsWith('।'))).toBe(true)
})

test('markdown and emojis are not read aloud', () => {
  expect(chunks('Good news! 🌱 **Tomato** prices are up 👍')).toEqual(['Good news! Tomato prices are up'])
  expect(chunks('⚠️ Safety note: do not use it.')).toEqual(['Safety note: do not use it.'])
})

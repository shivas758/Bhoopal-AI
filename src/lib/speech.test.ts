import { expect, test } from 'vitest'
import { chunks } from './speech'

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

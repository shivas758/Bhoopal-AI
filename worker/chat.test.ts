import { describe, expect, test } from 'vitest'
import type { PriceResult } from '../shared/types'
import { parseRequest } from './chat'
import { detectIntents } from './intents'
import { priceAnswer } from './priceAnswer'
import { priceForms } from './prices'
import { nextPacificMidnight } from './util'

describe('parseRequest', () => {
  const user = (text: string) => ({ role: 'user', text })
  const model = (text: string) => ({ role: 'model', text })

  test('long history: cut to the limit, starting with the farmer', () => {
    // a, b, u0, m1 … m11, again: 15 turns; the last 12 start with m1, which is dropped.
    const messages = [user('a'), model('b'), ...Array.from({ length: 12 }, (_, i) => (i % 2 ? model(`m${i}`) : user(`u${i}`))), user('again')]
    const r = parseRequest({ lang: 'te', messages })
    expect(r.messages.map((m) => m.text)).toEqual(['u2', 'm3', 'u4', 'm5', 'u6', 'm7', 'u8', 'm9', 'u10', 'm11', 'again'])
    expect(r.historyCut).toBe(true)
  })

  test('a question re-sent after an error is merged into one turn', () => {
    const r = parseRequest({ lang: 'en', messages: [user('price?'), user('price please'), { role: 'model', text: '' }] .slice(0, 2) })
    expect(r.messages).toEqual([{ role: 'user', text: 'price?\n\nprice please' }])
    expect(r.historyCut).toBe(false)
  })

  test('validates coordinates and intent', () => {
    const r = parseRequest({ lang: 'en', messages: [user('hi')], coords: { lat: 17.38512, lon: 78.48667 }, intent: { kind: 'price', commodity: 'Tomato' } })
    expect(r.coords).toEqual({ lat: 17.39, lon: 78.49 })
    expect(r.intent).toEqual({ kind: 'price', commodity: 'Tomato' })
    expect(parseRequest({ lang: 'en', messages: [user('hi')], coords: { lat: 0, lon: 0 } }).coords).toBeUndefined()
    expect(parseRequest({ lang: 'en', messages: [user('hi')], intent: { kind: 'other' } }).intent).toBeUndefined()
  })

  test('rejects a request that does not end with the farmer', () => {
    expect(() => parseRequest({ lang: 'en', messages: [user('a'), model('b')] })).toThrow()
  })
})

describe('detectIntents', () => {
  test.each([
    ['what is the tomato rate today', 'Tomato', false, false],
    ['ఈరోజు టమాటా ధర ఎంత?', 'Tomato', false, false],
    ['मूंगफली का भाव क्या है', 'Groundnut', false, false],
    ['tomato and onion price', undefined, false, false],
    ['can I spray tomorrow or will it rain', undefined, true, false],
    ['How do I apply for PM-KISAN?', undefined, false, true],
    ['how accurate is the soil test', undefined, false, false],
  ])('%s', (q, crop, weather, schemes) => {
    const i = detectIntents(q)
    expect([i.priceCrop?.id, i.weather, i.schemes]).toEqual([crop, weather, schemes])
  })
})

describe('prices', () => {
  const row = (market: string, modalPrice: number, commodity = 'Tomato', date = '2026-10-12') => ({ market, district: 'Kolar', date, modalPrice, unit: 'Rs./Quintal', commodity })

  test('flags outliers and keeps rows near the median', () => {
    const forms = priceForms([row('A', 1000), row('B', 1100), row('C', 1200), row('D', 9000), row('E', 1050)], 'state')
    expect(forms).toHaveLength(1)
    expect(forms[0].typicalPrice).toBe(1100)
    expect(forms[0].rows.at(-1)).toMatchObject({ market: 'D', suspicious: true })
    expect(forms[0].highest).toBe(1200)
  })

  test('keeps product forms apart', () => {
    const forms = priceForms([row('A', 8000, 'Ginger(Dry)'), row('B', 3000, 'Ginger(Green)'), row('C', 3100, 'Ginger(Green)')], 'district')
    expect(forms.map((f) => f.name)).toEqual(['Ginger(Green)', 'Ginger(Dry)'])
  })

  test('template answer: localized, per kg, MSP comparison, no suspicious rows', () => {
    const result: PriceResult = {
      commodity: 'Paddy',
      state: 'Telangana',
      district: 'Warangal',
      scope: 'district',
      forms: priceForms([row('Warangal', 2200, 'Paddy(Dhan)(Common)'), row('Jangaon', 2300, 'Paddy(Dhan)(Common)'), row('Narsampet', 2250, 'Paddy(Dhan)(Common)'), row('X', 9000, 'Paddy(Dhan)(Common)')], 'district'),
      msp: { price: 2441, season: 'Kharif 2026-27' },
      howToRead: '',
      source: 'test',
    }
    const te = priceAnswer(result, 'te', { today: '2026-10-12' })!
    expect(te).toContain('వరి ధాన్యం')
    expect(te).toContain('- Warangal (12 అక్టో): **₹2,200**/క్వింటాల్ (₹22/కిలో)')
    expect(te).toContain('MSP (Kharif 2026-27): ₹2,441')
    expect(te).not.toContain('9,000')
    expect(priceAnswer({ ...result, forms: [] }, 'en', { today: '2026-10-12' })).toBeUndefined()
    // Same price everywhere: no "₹1,000–₹1,000" range, in any language.
    const flat = { ...result, msp: undefined, forms: priceForms([row('A', 1000), row('B', 1000), row('C', 1000)], 'district') }
    for (const lang of ['en', 'hi', 'te', 'ta', 'kn', 'ml'] as const) {
      const text = priceAnswer(flat, lang, { today: '2026-10-12' })!
      expect(text).toContain('₹1,000/')
      expect(text).not.toContain('₹1,000–₹1,000')
    }
    expect(priceAnswer(result, 'en', { today: '2026-10-20' })).toContain('newest report')
  })
})

test('nextPacificMidnight: 3 AM in California → midnight 21 h later (+2 min grace)', () => {
  const now = Date.parse('2026-10-12T10:00:00Z') // 03:00 PDT
  expect(new Date(nextPacificMidnight(now)).toISOString()).toBe('2026-10-13T07:02:00.000Z')
})

import { describe, expect, test } from 'vitest'
import { findBannedPesticide } from '../shared/pesticides'
import { hasDose, sanitize } from './diagnose'
import { createOutputFilter, replaceUnknownPhones } from './outputFilter'

describe('hasDose (diagnosis expert options)', () => {
  test.each([
    ['2 ml per litre of water', true],
    ['Spray 200 g per acre', true],
    ['1.5 kg/acre', true],
    ['2 మి.లీ లీటరు నీటికి', true],
    ['ಲೀಟರ್‌ಗೆ 2 ಮಿಲಿ', true],
    ['१० ग्राम प्रति लीटर', true],
    ['ask your officer about Mancozeb 75% WP', false],
    ['ask about Fipronil 0.3 G granules', false],
    ['Imidacloprid 17.8 SL', false],
    ['spray twice at 10 days interval', false],
    ['', false],
  ])('%s → %s', (text, expected) => expect(hasDose(text)).toBe(expected))
})

describe('findBannedPesticide', () => {
  test.each([
    ['Spray Monocrotophos on the crop', 'Monocrotophos'],
    ['use thimet granules', 'thimet'],
    ['मोनोक्रोटोफॉस न डालें', 'मोनोक्रोटोफॉस'],
    ['Sevin dust works', 'Sevin'],
    ['old guides say DDT', 'DDT'],
    ['Furadan 3G', 'Furadan'],
    ['neem oil 5 ml per litre', undefined],
    ['seven days later', undefined],
  ])('%s', (text, expected) => expect(findBannedPesticide(text)).toBe(expected))
})

describe('replaceUnknownPhones', () => {
  const keep = (text: string) => expect(replaceUnknownPhones(text, 'en').text).toBe(text)
  const drop = (text: string, gone: string) => {
    const out = replaceUnknownPhones(text, 'en').text
    // The note itself contains the KCC number, so check the invented one is gone from around it.
    expect(out.replace('1800-180-1551', '')).not.toContain(gone)
    expect(out).toContain('(number not verified – call Kisan Call Centre 1800-180-1551)')
  }
  test('keeps verified numbers', () => {
    keep('Call the Kisan Call Centre at 1800-180-1551 (free).')
    keep('Call 1800 180 1551 from 6 am to 10 pm.')
    keep('Call 108 or 112 immediately.')
    keep('Dial 14416 for Tele-MANAS.')
    keep('PM-KISAN helpline: call 155261.')
    keep('किसान कॉल सेंटर १८००-१८०-१५५१ पर कॉल करें')
  })
  test('keeps ordinary numbers', () => {
    keep('You get ₹6,000 a year in 3 instalments of ₹2,000.')
    keep('Use 500 ml in 200 litres for 1 acre; harvest after 2026 rains.')
    keep('Call your dealer and ask for 250 g of seed.')
  })
  test('replaces invented numbers', () => {
    drop('Call the dealer on 9876543210.', '9876543210')
    drop('Call +91 98765 43210 now.', '98765 43210')
    drop('Toll-free: 1800-425-1234', '1800-425-1234')
    drop('Call 1551 for help', '1551')
    drop('కాల్ చేయండి 1234', '1234')
  })
})

describe('createOutputFilter', () => {
  test('holds text to sentence ends, keeps decimals and adds one warning per banned name', async () => {
    let out = ''
    const filter = createOutputFilter('en', async (t) => {
      out += t
    })
    await filter.push('Mix 2.')
    expect(out).toBe('')
    await filter.push('5 ml per litre. Do not use Monocro')
    expect(out).toBe('Mix 2.5 ml per litre.')
    await filter.push('tophos, it is banned. Also avoid Monocrotophos dust.\nCall 9876543210')
    await filter.flush()
    expect(out).toContain('Mix 2.5 ml per litre.')
    expect(out.match(/Safety note/g)).toHaveLength(1)
    expect(out).not.toContain('9876543210')
  })
})

describe('sanitize (diagnosis)', () => {
  const problem = (likelihood: string, expert = '') => ({ name: 'x', type: 'pest', likelihood, signs: 's', safe_steps: ['remove leaves'], expert_options: expert })
  const base = { is_plant_image: true, image_quality: 'good', crop: 'Tomato', looks_healthy: false, summary: 'Not sure.', retake_tips: '' }

  test('only one "likely"', () => {
    const r = sanitize({ ...base, possible_problems: [problem('high'), problem('high')] } as never, false)
    expect(r.possible_problems.map((p) => p.likelihood)).toEqual(['high', 'medium'])
  })
  test('poor photo or a different crop caps confidence', () => {
    expect(sanitize({ ...base, image_quality: 'poor', possible_problems: [problem('high')] } as never, false).possible_problems[0].likelihood).toBe('low')
    const r = sanitize({ ...base, crop_matches_farmer: false, possible_problems: [problem('medium')] } as never, true)
    expect(r.crop_mismatch).toBe(true)
    expect(r.possible_problems[0].likelihood).toBe('low')
  })
  test('doses and banned names are removed from medicines', () => {
    const r = sanitize({ ...base, possible_problems: [problem('medium', 'Ask about imidacloprid, 0.5 ml per litre'), problem('low', 'Ask about Monocrotophos')] } as never, false)
    expect(r.possible_problems.map((p) => [p.expert_options, p.expert_options_redacted])).toEqual([
      ['', true],
      ['', true],
    ])
    const ok = sanitize({ ...base, possible_problems: [problem('medium', 'Ask about Mancozeb 75% WP')] } as never, false)
    expect(ok.possible_problems[0].expert_options).toBe('Ask about Mancozeb 75% WP')
  })
  test('not a plant: no problems', () => {
    expect(sanitize({ ...base, is_plant_image: false, possible_problems: [problem('high')] } as never, false).possible_problems).toEqual([])
  })
})

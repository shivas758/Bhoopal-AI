import { describe, expect, test } from 'vitest'
import { commodityForRecord, findCommoditiesInText, findCommodity } from './commodities'

describe('commodityForRecord (Agmarknet names)', () => {
  test.each([
    ['Tomato', 'Tomato'],
    ['Paddy(Dhan)(Common)', 'Paddy'],
    ['Arhar (Tur/Red Gram)(Whole)', 'Red Gram'],
    ['Black Gram (Urd Beans)(Whole)', 'Black Gram'],
    ['Banana - Green', 'Raw Banana'],
    ['Ginger(Green)', 'Ginger'],
    ['Ginger(Dry)', 'Dry Ginger'],
    ['Tamarind Fruit', 'Tamarind'],
    ['Tamarind Seed', 'Tamarind seed'],
    ['Cashewnuts', 'Cashewnut'],
    ['Kulthi(Horse Gram)', 'Horse gram'],
    ['Chikoos(Sapota)', 'Sapota'],
    ['Cowpea(Lobia/Karamani)', 'Cowpea'],
    ['Sesamum(Sesame,Gingelly,Til)', 'Sesame'],
    ['Turnip', undefined],
    ['Mangosteen', undefined],
    ['Lemongrass', undefined],
    ['Sweet Lime', undefined],
    ['Rice Bean', undefined],
    ['Ginger Seed', undefined],
    ['Banana Leaf', undefined],
    ['Coconut Seed', undefined],
    ['Arhar Dal(Tur Dal)', undefined],
    ['Groundnut Oil', undefined],
  ])('%s → %s', (name, id) => expect(commodityForRecord(name)?.id).toBe(id))
})

describe('findCommodity (farmer words)', () => {
  test('exact and local names', () => {
    expect(findCommodity('tomato')?.id).toBe('Tomato')
    expect(findCommodity('టమాటా')?.id).toBe('Tomato')
    expect(findCommodity('Dry Chillies')?.id).toBe('Dry Chillies')
  })
  test('zero-width joiners do not matter', () => {
    expect(findCommodity('బీట్రూట్')?.id).toBe('Beetroot')
    expect(findCommodity('బీట్‌రూట్')?.id).toBe('Beetroot')
  })
  test('ambiguous names resolve only through the farmer’s crops', () => {
    expect(findCommodity('chilli')).toBeUndefined()
    expect(findCommodity('chilli', ['Dry Chillies', 'Cotton'])?.id).toBe('Dry Chillies')
    expect(findCommodity('మిరపకాయ', ['Green Chilli'])?.id).toBe('Green Chilli')
  })
  test('unknown non-Latin names find nothing', () => {
    expect(findCommodity('ఆపిల్')).toBeUndefined()
  })
})

describe('findCommoditiesInText', () => {
  test.each([
    ['what is the tomato rate today', ['Tomato']],
    ['bitter gourd price in Kolar', ['Bitter gourd']],
    ['sweet potato rate', ['Sweet Potato']],
    ['टमाटर का भाव', ['Tomato']],
    ['मूंगफली का भाव', ['Groundnut']],
    ['టమాటాల ధర ఎంత', ['Tomato']],
    ['पानी कब दें', []],
    ['turmeric price', ['Turmeric']],
  ])('%s', (text, ids) => expect(findCommoditiesInText(text).map((c) => c.id)).toEqual(ids))
})

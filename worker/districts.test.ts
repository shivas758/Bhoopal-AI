import { expect, test } from 'vitest'
import { DISTRICTS } from '../shared/districtData'
import { districtLabel, findDistrict, nearestDistrict } from '../shared/districts'
import { STATES } from '../shared/states'
import { inIndia } from './weather'

test('every district has a known state and a centre inside India', () => {
  for (const d of DISTRICTS) {
    expect(
      STATES.some((s) => s.id === d.state),
      d.name,
    ).toBe(true)
    expect(inIndia(d.lat, d.lon), d.name).toBe(true)
  }
})

test('districts are found by any spelling variant', () => {
  expect(findDistrict('Kerala', 'Wayanad')?.lat).toBeCloseTo(11.63, 1)
  expect(findDistrict('Kerala', 'kozhikode (calicut)')?.name).toBe('Kozhikode(Calicut)')
  expect(findDistrict('Telangana', 'Wayanad')).toBeUndefined()
  expect(findDistrict(undefined, 'Wayanad')).toBeUndefined()
})

test('local names, with Agmarknet’s English name as the fallback', () => {
  expect(districtLabel('Telangana', 'Warangal', 'te')).toBe('వరంగల్')
  expect(districtLabel('Telangana', 'Warangal', 'en')).toBe('Warangal')
  expect(districtLabel('Telangana', 'Nowhere', 'te')).toBe('Nowhere')
})

test('a GPS fix suggests the nearest district centre, only when close enough', () => {
  // Kalpetta, Wayanad's headquarters
  expect(nearestDistrict(11.61, 76.08, 'Kerala')?.name).toBe('Wayanad')
  // Hanamkonda town lies in Hanumakonda district
  expect(nearestDistrict(18.01, 79.56, 'Telangana')?.name).toMatch(/Hanumakonda|Warangal/)
  // The middle of the sea
  expect(nearestDistrict(12, 70)).toBeUndefined()
})

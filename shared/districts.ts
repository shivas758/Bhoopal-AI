import { DISTRICTS } from './districtData'
import type { Lang } from './types'

/** One Agmarknet district with its centre, LGD code and local names (data in districtData.ts). */
export interface DistrictInfo {
  /** Our state id (shared/states.ts). */
  state: string
  /** Agmarknet's spelling: what the app stores and matches prices by. */
  name: string
  lat: number
  lon: number
  /** Local Government Directory district code. */
  lgd?: number
  names?: Partial<Record<Lang, string>>
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

/** The district a farmer picked (any spelling variant Agmarknet or data.gov.in uses). */
export function findDistrict(state: string | undefined, name: string | undefined): DistrictInfo | undefined {
  if (!state || !name) return undefined
  const k = key(name)
  return DISTRICTS.find((d) => d.state === state && key(d.name) === k)
}

/** District name in the farmer's language, or Agmarknet's English name when we have no translation. */
export function districtLabel(state: string | undefined, name: string, lang: Lang): string {
  return findDistrict(state, name)?.names?.[lang] ?? name
}

function km(aLat: number, aLon: number, bLat: number, bLon: number) {
  const r = Math.PI / 180
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/**
 * The district whose centre is nearest a GPS fix, within `state` if given. Centres, not boundaries, so it is a
 * suggestion for the farmer to confirm, and only when the fix is within `maxKm` of it.
 */
export function nearestDistrict(lat: number, lon: number, state?: string, maxKm = 80): DistrictInfo | undefined {
  let best: DistrictInfo | undefined
  let bestKm = Infinity
  for (const d of DISTRICTS) {
    if (state && d.state !== state) continue
    const dist = km(lat, lon, d.lat, d.lon)
    if (dist < bestKm) {
      best = d
      bestKm = dist
    }
  }
  return bestKm <= maxKm ? best : undefined
}

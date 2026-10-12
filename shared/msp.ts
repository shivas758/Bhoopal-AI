// Minimum Support Prices (₹ per quintal), used when Agmarknet's state summary doesn't return one.
// Sources: CCEA decisions — Kharif 2026-27 (13 May 2026, from 1 Sep 2026); Rabi marketing season 2027-28
// (30 Sep 2026, from 1 Apr 2027). Re-check on pib.gov.in each season and update MSP_CHECKED.
export const MSP_CHECKED = '2026-10'

interface MspEntry {
  season: string
  /** ISO dates the season's MSP applies (inclusive). */
  from: string
  until: string
  price: number
  note?: string
}

const KHARIF_2026 = { season: 'Kharif 2026-27', from: '2026-09-01', until: '2027-08-31' }
const RABI_2026 = { season: 'Rabi 2026-27', from: '2026-04-01', until: '2027-03-31' }
const RABI_2027 = { season: 'Rabi 2027-28', from: '2027-04-01', until: '2028-03-31' }

/** Keyed by commodity id from shared/commodities.ts. */
const MSP: Record<string, MspEntry[]> = {
  Paddy: [{ ...KHARIF_2026, price: 2441, note: 'common; Grade A ₹2,461' }],
  Jowar: [{ ...KHARIF_2026, price: 4023, note: 'hybrid' }],
  Bajra: [{ ...KHARIF_2026, price: 2900 }],
  Ragi: [{ ...KHARIF_2026, price: 5205 }],
  Maize: [{ ...KHARIF_2026, price: 2410 }],
  'Red Gram': [{ ...KHARIF_2026, price: 8450 }],
  'Green Gram': [{ ...KHARIF_2026, price: 8780 }],
  'Black Gram': [{ ...KHARIF_2026, price: 8200 }],
  Groundnut: [{ ...KHARIF_2026, price: 7517 }],
  Soyabean: [{ ...KHARIF_2026, price: 5708 }],
  Sesame: [{ ...KHARIF_2026, price: 10346 }],
  Cotton: [{ ...KHARIF_2026, price: 8267, note: 'medium staple; long staple ₹8,667' }],
  Wheat: [
    { ...RABI_2026, price: 2585 },
    { ...RABI_2027, price: 2610 },
  ],
  'Bengal Gram': [
    { ...RABI_2026, price: 5875 },
    { ...RABI_2027, price: 5958 },
  ],
  Mustard: [
    { ...RABI_2026, price: 6200 },
    { ...RABI_2027, price: 6613 },
  ],
  Safflower: [{ ...RABI_2027, price: 7215 }],
}

/** MSP in force on `date` (yyyy-mm-dd) for a crop, if it has one in the table. */
export function mspFor(commodityId: string, date: string): { price: number; season: string; note?: string } | undefined {
  const entry = MSP[commodityId]?.find((e) => e.from <= date && date <= e.until)
  return entry && { price: entry.price, season: entry.season, ...(entry.note ? { note: entry.note } : {}) }
}

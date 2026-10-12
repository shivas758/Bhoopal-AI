// Where a farmer confirms a STATE scheme. Amounts and rules change every season, so the AI names the scheme
// and the office only, never amounts. Portal links are added only after they have been checked (plan P3.7).
export interface StateAgriInfo {
  /** The village/block office farmers actually visit. */
  office: string
  /** Current state scheme names the AI may mention (no amounts). */
  schemes: string[]
}

export const STATE_AGRI_INFO: Record<string, StateAgriInfo> = {
  'Andhra Pradesh': {
    office: 'the Rythu Seva Kendram (RSK) in your village or the Mandal Agriculture Officer',
    schemes: ['Annadata Sukhibhava – PM Kisan (state income support paid with PM-KISAN)'],
  },
  Telangana: {
    office: 'the Agriculture Extension Officer (AEO) at the Rythu Vedika, or the Mandal Agriculture Officer',
    schemes: ['Rythu Bharosa (investment support per acre each season)', 'Rythu Bima (life insurance for farmers)'],
  },
  Karnataka: {
    office: 'the Raitha Samparka Kendra (RSK) in your hobli',
    schemes: ['Krishi Bhagya (farm ponds)', 'Raitha Siri (support for millet growers)', 'FRUITS farmer ID registration (needed for most benefits)'],
  },
  'Tamil Nadu': {
    office: 'the block Agricultural Extension Centre or the Assistant Director of Agriculture; scheme news is also in the Uzhavan app',
    schemes: [],
  },
  Kerala: {
    office: 'the Krishi Bhavan in your panchayat; most benefits need registration on the AIMS portal there',
    schemes: [],
  },
  Puducherry: {
    office: 'the Agricultural Extension Centre or the Department of Agriculture office near you',
    schemes: [],
  },
}

export const DEFAULT_AGRI_OFFICE = 'the block or district agriculture office, or the Krishi Vigyan Kendra (KVK)'

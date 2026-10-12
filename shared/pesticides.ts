// Pesticides the AI must never recommend. Older guides and model training data still list some of them,
// so they are named explicitly in the prompts, and the same list drives the Worker's output filters.
// Re-check with CIB&RC notifications (ppqs.gov.in, egazette.gov.in) before every release and update CHECKED.
export const PESTICIDES_CHECKED = '2026-10'

export interface BannedPesticide {
  active: string
  /** Common Indian trade names, so a farmer asking by brand is warned too. Whole-word, case-insensitive. */
  brands: string[]
  /** Shown to the model, e.g. "banned 2018". */
  status: string
  /** Lowercase spellings the output filter also looks for (Indic transliterations, alternate spellings). */
  aliases?: string[]
}

export const BANNED_PESTICIDES: BannedPesticide[] = [
  // Insecticides (Prohibition) Order 2023, S.O. 4294(E): 36% SL registrations cancelled after a one-year sell-off.
  { active: 'Monocrotophos', brands: ['Monocil', 'Nuvacron', 'Phoskill'], status: 'banned 2023-24', aliases: ['मोनोक्रोटोफॉस', 'మోనోక్రోటోఫాస్', 'மோனோகுரோட்டோபாஸ்', 'ಮೋನೋಕ್ರೊಟೊಫಾಸ್', 'മോണോക്രോട്ടോഫോസ്'] },
  { active: 'Dicofol', brands: ['Kelthane'], status: 'banned 2023' },
  { active: 'Dinocap', brands: ['Karathane'], status: 'banned 2023' },
  { active: 'Methomyl', brands: ['Lannate', 'Dunet'], status: 'banned 2023' },
  // Reported final order S.O. 5234(E), 22 Sep 2026, cancelling all registrations. Confirm on egazette.gov.in.
  { active: 'Paraquat', brands: ['Gramoxone'], status: 'registrations cancelled Sept 2026', aliases: ['पैराक्वाट', 'పారాక్వాట్', 'பாராகுவாட்', 'ಪ್ಯಾರಾಕ್ವಾಟ್', 'പാരക്വാറ്റ്'] },
  { active: 'Phorate', brands: ['Thimet'], status: 'banned 2020', aliases: ['फोरेट', 'ఫోరేట్', 'போரேட்', 'ಫೋರೇಟ್', 'ഫോറേറ്റ്'] },
  { active: 'Triazophos', brands: ['Hostathion'], status: 'banned 2020' },
  { active: 'Dichlorvos', brands: ['Nuvan'], status: 'banned 2020', aliases: ['ddvp'] },
  { active: 'Phosphamidon', brands: ['Dimecron'], status: 'banned 2020' },
  { active: 'Trichlorfon', brands: ['Dipterex'], status: 'banned 2020' },
  { active: 'Alachlor', brands: [], status: 'banned 2020' },
  { active: 'Methyl parathion', brands: ['Metacid', 'Folidol'], status: 'banned 2018' },
  { active: 'Carbaryl', brands: ['Sevin'], status: 'banned 2018' },
  { active: 'Benomyl', brands: ['Benlate'], status: 'banned 2018' },
  { active: 'Diazinon', brands: ['Basudin'], status: 'banned 2018' },
  { active: 'Fenthion', brands: ['Lebaycid'], status: 'banned 2018' },
  { active: 'Fenarimol', brands: [], status: 'banned 2018' },
  { active: 'Linuron', brands: [], status: 'banned 2018' },
  { active: 'Thiometon', brands: ['Ekatin'], status: 'banned 2018' },
  { active: 'Tridemorph', brands: ['Calixin'], status: 'banned 2018' },
  { active: 'Trifluralin', brands: ['Treflan'], status: 'banned 2018' },
  { active: 'Endosulfan', brands: ['Thiodan', 'Endocel'], status: 'banned 2011', aliases: ['एंडोसल्फान', 'ఎండోసల్ఫాన్', 'எண்டோசல்பான்', 'ಎಂಡೋಸಲ್ಫಾನ್', 'എൻഡോസൾഫാൻ'] },
  { active: 'BHC (HCH)', brands: [], status: 'banned', aliases: ['bhc', 'hch', 'benzene hexachloride'] },
  { active: 'Aldrin', brands: [], status: 'banned' },
  { active: 'Dieldrin', brands: [], status: 'banned' },
  { active: 'Heptachlor', brands: [], status: 'banned' },
  { active: 'Chlordane', brands: [], status: 'banned' },
  { active: 'Toxaphene', brands: [], status: 'banned' },
  { active: 'Ethyl parathion', brands: [], status: 'banned' },
  { active: 'DDT', brands: [], status: 'banned for farm use' },
]

/** Allowed only in one restricted form; the AI should not recommend them, and should send the farmer to an officer. */
export const RESTRICTED_PESTICIDES = [
  { active: 'Carbofuran', brands: ['Furadan'], status: 'only 3% CG for specified crops (2023 Order); highly hazardous' },
]

/** One prompt sentence, regenerated from the lists above so the prompts and the filters never disagree. */
export function bannedPesticidesSentence() {
  const banned = BANNED_PESTICIDES.map((p) => (p.brands.length ? `${p.active} (${p.brands.join(', ')}; ${p.status})` : `${p.active} (${p.status})`)).join(', ')
  const restricted = RESTRICTED_PESTICIDES.map((p) => `${p.active} (${p.brands.join(', ')}): ${p.status}`).join('; ')
  return `NEVER recommend pesticides banned in India, even if older guides list them. Banned (checked ${PESTICIDES_CHECKED}): ${banned}. Restricted, so do not recommend it yourself: ${restricted}. If the farmer names a brand, say which active ingredient you believe it contains and tell them to check the pack.`
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Latin names match as whole words; Indic aliases as plain substrings (\b doesn't work for Indic scripts).
const ALL: BannedPesticide[] = [...BANNED_PESTICIDES, ...RESTRICTED_PESTICIDES]
const isLatin = (s: string) => /^[a-z ]+$/i.test(s)
const latinTerms = ALL.flatMap((p) => [p.active.replace(/\s*\(.*\)$/, ''), ...p.brands, ...(p.aliases ?? []).filter(isLatin)])
const indicTerms = ALL.flatMap((p) => (p.aliases ?? []).filter((a) => !isLatin(a)))
const LATIN_RE = new RegExp(`\\b(?:${latinTerms.map(escape).join('|')})\\b`, 'i')

/** Name of the first banned/restricted pesticide or brand mentioned in `text`, if any. */
export function findBannedPesticide(text: string): string | undefined {
  const latin = LATIN_RE.exec(text)
  if (latin) return latin[0]
  return indicTerms.find((t) => text.includes(t))
}

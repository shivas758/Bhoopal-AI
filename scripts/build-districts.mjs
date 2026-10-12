// Builds shared/districtData.ts: every Agmarknet district of the South Indian states with its centre (for weather
// without GPS), LGD code (for NDMA warnings) and name in each app language.
//   node scripts/build-districts.mjs            writes shared/districtData.ts and prints what it could not match
// Sources: Agmarknet's district list (the spellings the app stores and matches prices by) and Wikidata
// (CC0: labels, P625 coordinates, P12746 LGD district code). Re-run when Agmarknet adds districts, then
// review the diff; names need native-speaker review like src/i18n.
import { writeFileSync } from 'node:fs'

const UA = 'BhooPal-district-table/1.0 (https://github.com/shivas758/Bhoopal-AI)'
const LANGS = ['hi', 'te', 'ta', 'kn', 'ml']

// Our state id -> Agmarknet state name, Wikidata item.
const STATES = {
  'Andhra Pradesh': { agm: 'Andhra Pradesh', qid: 'Q1159' },
  Telangana: { agm: 'Telangana', qid: 'Q677037' },
  // extra: districts Wikidata doesn't link the usual way (renamed, or typed as "census district").
  Karnataka: { agm: 'Karnataka', qid: 'Q1185', extra: ['Q806464'] },
  'Tamil Nadu': { agm: 'Tamil Nadu', qid: 'Q1445' },
  Kerala: { agm: 'Keralam', qid: 'Q1186' },
  Puducherry: { agm: 'Pondicherry', qid: 'Q66743', extra: ['Q639279', 'Q2126598'] },
}

// Agmarknet spellings that differ from every Wikidata label (old names, typos, renamed districts).
// Value: the Wikidata English label to match, after normalisation.
const ALIASES = {
  Chittor: 'Chittoor',
  'Dr.B.R.A.Konaseema': 'Konaseema',
  'SPSR Nellore': 'Nellore',
  'Sri Sathya Sai': 'Sri Sathya Sai',
  Tirupathi: 'Tirupati',
  Vijayanagaram: 'Vizianagaram',
  'YSR Kadapa': 'Kadapa',
  Anakapally: 'Anakapalli',
  NTR: 'NTR',
  Bellary: 'Ballari',
  Chikkaballapur: 'Chikkaballapura',
  Ramanagar: 'Ramanagara',
  'Bengaluru South': 'Ramanagara',
  Bengaluru: 'Bangalore Urban',
  'Bengaluru Rural': 'Bengaluru North',
  Kallakuruchi: 'Kallakurichi',
  'Nagercoil (Kannyiakumari)': 'Kanyakumari',
  Thiruchirappalli: 'Tiruchirappalli',
  Thirunelveli: 'Tirunelveli',
  Thirupathur: 'Tirupattur',
  Thirupur: 'Tiruppur',
  Thiruvannamalai: 'Tiruvannamalai',
  Thiruvarur: 'Tiruvarur',
  Thiruvellore: 'Tiruvallur',
  Tuticorin: 'Thoothukudi',
  Villupuram: 'Viluppuram',
  Asifabad: 'Kumuram Bheem Asifabad',
  Bhupalapally: 'Jayashankar Bhupalpally',
  Hanumakonda: 'Hanamkonda',
  Jagtial: 'Jagtial',
  Mahbubnagar: 'Mahabubnagar',
  'Ranga Reddy': 'Ranga Reddy',
  Alleppey: 'Alappuzha',
  Calicut: 'Kozhikode',
  'Kozhikode(Calicut)': 'Kozhikode',
  Kasargod: 'Kasaragod',
  Palakad: 'Palakkad',
  Thirssur: 'Thrissur',
  Pondicherry: 'Puducherry',
  'The Nilgiris': 'Nilgiris',
}

// Labels Wikidata has wrong or outdated (Warangal Rural was renamed Warangal in 2021).
const NAME_OVERRIDES = {
  Warangal: { kn: 'ವರಂಗಲ್' },
}

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\b(district|dist)\b/g, '')
    .replace(/[^a-z]/g, '')

async function sparql(query) {
  const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, {
    headers: { 'user-agent': UA, accept: 'application/sparql-results+json' },
  })
  if (!res.ok) throw new Error(`Wikidata ${res.status}`)
  return (await res.json()).results.bindings
}

function point(wkt) {
  const [lon, lat] = wkt
    .replace(/^Point\(|\)$/g, '')
    .split(' ')
    .map(Number)
  return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 }
}

async function wikidataDistricts(qid, extra = []) {
  const rows = await sparql(`
    SELECT ?d ?coord ?hqCoord ?lgd ?dissolved ?lang ?label WHERE {
      # Districts directly in the state, or in a division of it (Karnataka); bounded paths keep the query fast.
      { ?d wdt:P31/wdt:P279? wd:Q1149652 ; wdt:P131/wdt:P131? wd:${qid} . }
      ${extra.length ? `UNION { VALUES ?d { ${extra.map((q) => `wd:${q}`).join(' ')} } }` : ''}
      OPTIONAL { ?d wdt:P625 ?coord }
      OPTIONAL { ?d wdt:P36 ?hq . ?hq wdt:P625 ?hqCoord }
      OPTIONAL { ?d wdt:P12746 ?lgd }
      OPTIONAL { ?d wdt:P576 ?dissolved }
      { ?d rdfs:label ?label } UNION { ?d skos:altLabel ?label FILTER(LANG(?label) = 'en') }
      BIND(LANG(?label) AS ?lang)
      FILTER(?lang IN ('en', 'hi', 'te', 'ta', 'kn', 'ml'))
    }`)
  const items = new Map()
  for (const r of rows) {
    const id = r.d.value.split('/').pop()
    const item = items.get(id) ?? { id, en: [], names: {}, dissolved: Boolean(r.dissolved) }
    if (r.coord && !item.coord) item.coord = point(r.coord.value)
    // New districts often lack a centre in Wikidata: use their headquarters town instead.
    if (r.hqCoord && !item.hq) item.hq = point(r.hqCoord.value)
    if (r.lgd && !item.lgd) item.lgd = Number(r.lgd.value)
    if (r.lang.value === 'en') item.en.push(r.label.value)
    else item.names[r.lang.value] ??= r.label.value.replace(/\s*(जिला|ज़िला|జిల్లా|மாவட்டம்|ಜಿಲ್ಲೆ|ജില്ല)$/u, '')
    items.set(id, item)
  }
  return [...items.values()]
}

const filters = await (
  await fetch('https://api.agmarknet.gov.in/v1/daily-price-arrival/filters', {
    headers: { 'user-agent': 'BhooPal/0.1 (+https://bhoopal.shivasahith.workers.dev)', accept: 'application/json' },
  })
).json()
const agmStates = filters.data.state_data.filter((s) => s.state_id < 100000)

const out = []
const unmatched = []
for (const [state, { agm, qid, extra }] of Object.entries(STATES)) {
  const stateId = agmStates.find((s) => s.state_name === agm)?.state_id
  const names = filters.data.district_data.filter((d) => d.state_id === stateId && d.id < 100000).map((d) => d.district_name)
  const items = await wikidataDistricts(qid, extra)
  for (const name of names.sort()) {
    const key = norm(ALIASES[name] ?? name)
    const candidates = items.filter((it) => it.en.some((l) => norm(l) === key))
    // A current district beats a dissolved one with the same name.
    const item = candidates.find((c) => !c.dissolved) ?? candidates[0]
    if (!item) {
      unmatched.push(`${state}: ${name}`)
      out.push({ state, name })
      continue
    }
    const coord = item.coord ?? item.hq
    if (!item.coord) unmatched.push(`${state}: ${name} (${item.id}: ${coord ? 'headquarters town used' : 'no coordinates'})`)
    out.push({
      state,
      name,
      ...coord,
      ...(item.lgd ? { lgd: item.lgd } : {}),
      names: { ...Object.fromEntries(LANGS.filter((l) => item.names[l]).map((l) => [l, item.names[l]])), ...NAME_OVERRIDES[name] },
    })
  }
}

const row = (d) => {
  const parts = [`state: ${JSON.stringify(d.state)}`, `name: ${JSON.stringify(d.name)}`]
  if (d.lat !== undefined) parts.push(`lat: ${d.lat}`, `lon: ${d.lon}`)
  if (d.lgd) parts.push(`lgd: ${d.lgd}`)
  if (d.names && Object.keys(d.names).length) parts.push(`names: ${JSON.stringify(d.names)}`)
  return `  { ${parts.join(', ')} },`
}

writeFileSync(
  new URL('../shared/districtData.ts', import.meta.url),
  `// Generated by scripts/build-districts.mjs on ${new Date().toISOString().slice(0, 10)} from Agmarknet's district list and
// Wikidata (CC0). Do not edit by hand: add aliases or overrides in the script and re-run it.
// lat/lon: the district's centre (2 decimals), used for weather when the farmer hasn't shared GPS.
// lgd: Local Government Directory district code. names: Wikidata labels (need native-speaker review).
import type { DistrictInfo } from './districts'

export const DISTRICTS: DistrictInfo[] = [
${out.map(row).join('\n')}
]
`,
)
console.log(`${out.length} districts written, ${out.filter((d) => d.lat !== undefined).length} with coordinates`)
if (unmatched.length) console.log(`Needs attention:\n  ${unmatched.join('\n  ')}`)

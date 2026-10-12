import type { DistrictsResponse, PriceForm, PriceRecord, PriceResult, PriceRow } from '../shared/types'
import { commodityForRecord, commodityMatches, findCommodity, normalizeName } from '../shared/commodities'
import { mspFor } from '../shared/msp'
import { STATES, findState, type IndianState } from '../shared/states'
import { agmarknetCommodities, agmarknetDistricts, agmarknetMarketPrices, agmarknetStateSummary } from './agmarknet'
import { BadRequest, UpstreamError, cached, indiaNow, json, upstreamFetch } from './util'

// "Current Daily Price of Various Commodities from Various Markets (Mandi)" – Agmarknet on data.gov.in.
const API = 'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070'
const PAGE_SIZE = 1000
// Parsing costs CPU (Workers Free allows 10 ms per request), so read at most 2,000 rows per state.
const MAX_PAGES = 2
const TTL_SECONDS = 30 * 60
// Rows per crop form sent to the model; enough to name 2–5 mandis and compare.
const MAX_ROWS = 25

type RawRecord = Record<string, unknown>

/** Field names vary in casing ("modal_price" vs "Modal_x0020_Price" in sibling datasets): normalize once per record. */
function normalizeKeys(rec: RawRecord): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key in rec) out[key.toLowerCase().replace(/_x0020_/g, '_')] = String(rec[key] ?? '').trim()
  return out
}

function isoDate(value: string): string {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : value
}

function toRecord(raw: RawRecord): PriceRecord | null {
  const rec = normalizeKeys(raw)
  const modal = Number(rec.modal_price)
  if (!Number.isFinite(modal) || modal <= 0) return null
  return {
    state: rec.state ?? '',
    district: rec.district ?? '',
    market: rec.market ?? '',
    commodity: rec.commodity ?? '',
    variety: rec.variety ?? '',
    grade: rec.grade ?? '',
    date: isoDate(rec.arrival_date ?? ''),
    min: Number(rec.min_price) || modal,
    max: Number(rec.max_price) || modal,
    modal,
  }
}

async function fetchPage(apiKey: string, filter: string, stateName: string, offset: number) {
  const url = new URL(API)
  url.searchParams.set('api-key', apiKey)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', String(PAGE_SIZE))
  url.searchParams.set('offset', String(offset))
  url.searchParams.set(`filters[${filter}]`, stateName)
  const res = await upstreamFetch('data.gov.in', url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6_000) })
  if (!res.ok) throw new UpstreamError(`data.gov.in ${res.status}`)
  // A maintenance page (HTML with 200) or a body cut off by the timeout is an outage, not our bug.
  const body = (await res.json().catch(() => {
    throw new UpstreamError('data.gov.in: invalid or incomplete JSON')
  })) as { records?: RawRecord[]; total?: number | string; message?: string }
  if (!Array.isArray(body.records)) throw new UpstreamError(`data.gov.in: ${body.message ?? 'no records field'}`)
  return { records: body.records, total: Number(body.total) || body.records.length }
}

async function loadState(apiKey: string, state: IndianState) {
  // The API has accepted both `filters[state]` and `filters[state.keyword]` over time, and
  // Agmarknet's state spellings vary ("Chattisgarh"), so try each combination until one has data.
  for (const name of state.api) {
    for (const filter of ['state.keyword', 'state']) {
      const first = await fetchPage(apiKey, filter, name, 0)
      if (!first.records.length) continue
      const raw = [...first.records]
      for (let page = 1; page < MAX_PAGES && raw.length < first.total; page++) {
        const next = await fetchPage(apiKey, filter, name, page * PAGE_SIZE)
        if (!next.records.length) break
        raw.push(...next.records)
      }
      return raw.map(toRecord).filter((r): r is PriceRecord => r !== null)
    }
  }
  return []
}

const dataGovState = (env: Env, state: IndianState) => cached(`prices:${state.id}`, TTL_SECONDS, () => loadState(env.DATA_GOV_API_KEY!, state))

// After a failure, skip data.gov.in for a while so farmers don't wait on a dead server for every question.
const DATA_GOV_BACKOFF_MS = 5 * 60 * 1000
let dataGovDownUntil = 0

const dataGovUsable = (env: Env) => Boolean(env.DATA_GOV_API_KEY) && Date.now() >= dataGovDownUntil

function markDataGovDown(err: unknown) {
  dataGovDownUntil = Date.now() + DATA_GOV_BACKOFF_MS
  console.warn(`data.gov.in unavailable, using Agmarknet 2.0 for ${DATA_GOV_BACKOFF_MS / 60000} min: ${err instanceof Error ? err.message : String(err)}`)
}

const sameName = (a: string, b: string) => normalizeName(a) === normalizeName(b)

/** District list for the farmer's profile: Agmarknet 2.0's full list, else districts seen in data.gov.in prices. */
export async function handleDistricts(url: URL, env: Env): Promise<Response> {
  const state = findState(url.searchParams.get('state') ?? '')
  if (!state) throw new BadRequest('unknown state')
  let names: string[] = []
  try {
    names = await agmarknetDistricts(env, state)
  } catch (err) {
    if (!dataGovUsable(env)) throw err
    try {
      names = [...new Set((await dataGovState(env, state)).map((r) => r.district))]
    } catch (fallbackErr) {
      markDataGovDown(fallbackErr)
      throw err
    }
  }
  const body: DistrictsResponse = { districts: names.sort((a, b) => a.localeCompare(b)).map((name) => ({ name, markets: [] })) }
  // An empty list is usually a temporary upstream gap: don't let phones cache it for a day.
  return json(body, 200, { 'cache-control': names.length ? 'public, max-age=86400' : 'public, max-age=300' })
}

/** GET /api/prices: the price glance on the Home crop chips, from Agmarknet only (no AI). */
export async function handlePrices(url: URL, env: Env): Promise<Response> {
  const commodity = url.searchParams.get('commodity') ?? ''
  const state = findState(url.searchParams.get('state') ?? '')
  const district = url.searchParams.get('district')?.slice(0, 80) || undefined
  if (!commodity || commodity.length > 60 || !state) throw new BadRequest('commodity and state required')
  const result = await mandiPricesTool(env, { commodity }, { state: state.id, district })
  // Mandis report through the day; 15 minutes keeps a crowd of phones from re-asking Agmarknet.
  return json(result, 200, { 'cache-control': 'public, max-age=900' })
}

export function matchState(name: string | undefined): IndianState | undefined {
  if (!name) return undefined
  const n = name.trim().toLowerCase().replace(/&/g, 'and')
  return STATES.find(
    (st) => st.id.toLowerCase() === n || st.api.some((a) => a.toLowerCase() === n) || Object.values(st.names).some((v) => v.toLowerCase() === n),
  )
}

type CropRow = PriceRow & { commodity: string }

/** Per-mandi rows from data.gov.in, if it's up and has this crop here. */
async function dataGovRows(env: Env, state: IndianState, district: string | undefined, isCrop: (name: string) => boolean): Promise<CropRow[]> {
  if (!dataGovUsable(env)) return []
  try {
    const records = (await dataGovState(env, state)).filter((r) => isCrop(r.commodity))
    const inDistrict = district ? records.filter((r) => sameName(r.district, district)) : records
    return (inDistrict.length ? inDistrict : records).map((r) => ({
      market: r.market,
      district: r.district,
      commodity: r.commodity,
      date: r.date,
      modalPrice: r.modal,
      minPrice: r.min,
      maxPrice: r.max,
      variety: r.variety,
      unit: 'Rs./Quintal',
      // data.gov.in rows sometimes have the modal price outside the row's own min–max: a typing error.
      ...(r.modal < r.min || r.modal > r.max ? { suspicious: true } : {}),
    }))
  } catch (err) {
    markDataGovDown(err)
    return []
  }
}

function withoutCommodity(r: CropRow): PriceRow {
  const row: PriceRow & { commodity?: string } = { ...r }
  delete row.commodity
  return row
}

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

/**
 * Groups rows by Agmarknet's exact name (Ginger(Dry) and Ginger(Green) sell at very different prices), flags
 * rows far from the median as likely reporting errors, and keeps the newest rows nearest the typical price
 * rather than the dearest ones.
 */
export function priceForms(rows: CropRow[], scope: 'district' | 'state'): PriceForm[] {
  const byName = new Map<string, CropRow[]>()
  for (const row of rows) byName.set(row.commodity, [...(byName.get(row.commodity) ?? []), row])

  const forms = [...byName].map(([name, list]): PriceForm => {
    const typical = median(list.map((r) => r.modalPrice))
    const flagged = list.map((r) => (r.modalPrice < typical * 0.4 || r.modalPrice > typical * 2.5 ? { ...r, suspicious: true } : r))
    const ok = flagged.filter((r) => !r.suspicious).map((r) => r.modalPrice)
    const ordered = flagged.sort(
      (a, b) =>
        Number(Boolean(a.suspicious)) - Number(Boolean(b.suspicious)) ||
        b.date.localeCompare(a.date) ||
        (scope === 'state' ? Math.abs(a.modalPrice - typical) - Math.abs(b.modalPrice - typical) : a.market.localeCompare(b.market)),
    )
    return {
      name,
      typicalPrice: typical,
      lowest: ok.length ? Math.min(...ok) : typical,
      highest: ok.length ? Math.max(...ok) : typical,
      mandis: new Set(list.map((r) => r.market)).size,
      rows: ordered.slice(0, MAX_ROWS).map(withoutCommodity),
    }
  })
  // The form most mandis report first (usually the one farmers mean).
  return forms.sort((a, b) => b.mandis - a.mandis)
}

/** The chat model's `get_mandi_prices` tool and GET /api/prices: latest price at each mandi, plus MSP. */
export async function mandiPricesTool(
  env: Env,
  args: { commodity?: unknown; state?: unknown; district?: unknown },
  farmer: { state?: string; district?: string; crops?: string[] },
): Promise<PriceResult | { error: string }> {
  const commodity = String(args.commodity ?? '')
    .trim()
    .slice(0, 80)
  if (!commodity) return { error: 'Which crop? Ask the farmer.' }
  const state = matchState(typeof args.state === 'string' ? args.state : undefined) ?? findState(farmer.state)
  if (!state) return { error: 'Unknown state. Ask the farmer which state and district they are in.' }
  const district = (typeof args.district === 'string' && args.district.trim()) || (state.id === farmer.state ? farmer.district : undefined)

  const crop = findCommodity(commodity, farmer.crops)
  if (!crop) {
    const options = commodityMatches(commodity)
    if (options.length > 1) return { error: `"${commodity}" could mean ${options.map((o) => o.id).join(' or ')}. Ask the farmer which one.` }
    // Only Latin names can be searched in Agmarknet's list; anything else would match every record.
    if (!normalizeName(commodity)) return { error: `"${commodity}" was not found among mandi commodities. Ask the farmer for another name of the crop.` }
  }
  const isCrop = (name: string) => (crop ? commodityForRecord(name)?.id === crop.id : normalizeName(name).startsWith(normalizeName(commodity)))

  // Both lookups are independent; a dead data.gov.in must not delay the Agmarknet 2.0 fallback.
  const [govRows, ids] = await Promise.all([
    dataGovRows(env, state, district, isCrop),
    agmarknetCommodities(env, crop, commodity).catch(() => [] as { id: number; name: string }[]),
  ])
  const cmdtIds = ids.map((c) => c.id)
  // MSP and the state average put mandi prices in context ("below MSP: sell at a procurement centre").
  const summaryPromise = cmdtIds.length ? agmarknetStateSummary(env, state, cmdtIds).catch(() => []) : Promise.resolve([])

  let source = 'Agmarknet via data.gov.in'
  let rows: CropRow[] = govRows
  let scope: 'district' | 'state' = district && rows.some((r) => sameName(r.district, district)) ? 'district' : 'state'
  if (!rows.length) {
    source = 'Agmarknet 2.0 (agmarknet.gov.in)'
    if (!cmdtIds.length) return { error: `"${commodity}" was not found among mandi commodities. Ask the farmer for another name of the crop.` }
    const local = district ? await agmarknetMarketPrices(env, state, district, cmdtIds) : undefined
    if (local?.districtFound && local.rows.length) {
      rows = local.rows
      scope = 'district'
    } else {
      rows = (await agmarknetMarketPrices(env, state, undefined, cmdtIds)).rows
      scope = 'state'
    }
  }

  const summary = await summaryPromise
  const summaryMsp = summary.find((s) => s.msp)
  const average = summary.find((s) => s.stateAverage)
  const tableMsp = crop ? mspFor(crop.id, indiaNow().toISOString().slice(0, 10)) : undefined
  const forms = priceForms(rows, scope)

  return {
    commodity: crop?.id ?? commodity,
    state: state.id,
    ...(scope === 'district' && district ? { district } : {}),
    scope,
    forms,
    // Agmarknet's figure is the live one; our table only fills in when it's missing.
    ...(summaryMsp?.msp ? { msp: { price: summaryMsp.msp, ...(tableMsp ? { season: tableMsp.season } : {}) } } : tableMsp ? { msp: tableMsp } : {}),
    ...(average?.stateAverage ? { stateAverage: { price: average.stateAverage, date: average.date } } : {}),
    note:
      district && scope === 'state' && forms.length
        ? `No mandi in ${district} district reported this crop in the last few days; showing a sample of mandis across ${state.id}, nearest the typical price.`
        : forms.length
          ? undefined
          : 'No mandi in this area reported this crop in the last few days.',
    howToRead:
      "modalPrice = the price most of the produce sold at, at that mandi on that date; typicalPrice = the median across mandis. Check each row's unit (usually Rs./Quintal = per 100 kg). Rows marked suspicious are probably reporting errors. msp = Minimum Support Price in Rs./Quintal.",
    source,
  }
}

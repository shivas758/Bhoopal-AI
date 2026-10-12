import type { DistrictsResponse, PriceRecord } from '../shared/types'
import { commodityForRecord, findCommodity, normalizeName } from '../shared/commodities'
import { STATES, findState, type IndianState } from '../shared/states'
import { agmarknetCommodities, agmarknetDistricts, agmarknetMarketPrices, agmarknetStateSummary } from './agmarknet'
import { BadRequest, UpstreamError, cached, json, upstreamFetch } from './util'

// "Current Daily Price of Various Commodities from Various Markets (Mandi)" – Agmarknet on data.gov.in.
const API = 'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070'
const PAGE_SIZE = 1000
const MAX_PAGES = 6
const TTL_SECONDS = 30 * 60

type RawRecord = Record<string, unknown>

/** Reads a field regardless of casing ("modal_price" vs "Modal_x0020_Price" in sibling datasets). */
function field(rec: RawRecord, name: string): string {
  for (const [key, value] of Object.entries(rec)) {
    if (key.toLowerCase().replace(/_x0020_/g, '_') === name) return String(value ?? '').trim()
  }
  return ''
}

function isoDate(value: string): string {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : value
}

function toRecord(rec: RawRecord): PriceRecord | null {
  const modal = Number(field(rec, 'modal_price'))
  if (!Number.isFinite(modal) || modal <= 0) return null
  return {
    state: field(rec, 'state'),
    district: field(rec, 'district'),
    market: field(rec, 'market'),
    commodity: field(rec, 'commodity'),
    variety: field(rec, 'variety'),
    grade: field(rec, 'grade'),
    date: isoDate(field(rec, 'arrival_date')),
    min: Number(field(rec, 'min_price')) || modal,
    max: Number(field(rec, 'max_price')) || modal,
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
  const res = await upstreamFetch('data.gov.in', url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12_000) })
  if (!res.ok) throw new UpstreamError(`data.gov.in ${res.status}`)
  const body = (await res.json()) as { records?: RawRecord[]; total?: number | string; message?: string }
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
  if (!(err instanceof UpstreamError)) throw err
  dataGovDownUntil = Date.now() + DATA_GOV_BACKOFF_MS
  console.warn(`data.gov.in unavailable, using Agmarknet 2.0 for ${DATA_GOV_BACKOFF_MS / 60000} min: ${err.message}`)
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
    names = [...new Set((await dataGovState(env, state)).map((r) => r.district))]
  }
  const body: DistrictsResponse = { districts: names.sort((a, b) => a.localeCompare(b)).map((name) => ({ name, markets: [] })) }
  return json(body, 200, { 'cache-control': 'public, max-age=86400' })
}

export function matchState(name: string | undefined): IndianState | undefined {
  if (!name) return undefined
  const n = name.trim().toLowerCase()
  return STATES.find(
    (st) =>
      st.id.toLowerCase() === n || st.api.some((a) => a.toLowerCase() === n) || Object.values(st.names).some((v) => v.toLowerCase() === n),
  )
}

interface ToolRow {
  market: string
  district: string
  commodity: string
  date: string
  modalPrice: number
  minPrice?: number
  maxPrice?: number
  variety?: string
  unit: string
  arrival?: string
}

/** Per-mandi rows from data.gov.in, if it's up and has this crop here. */
async function dataGovRows(
  env: Env,
  state: IndianState,
  district: string | undefined,
  isCrop: (name: string) => boolean,
): Promise<ToolRow[]> {
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
    }))
  } catch (err) {
    markDataGovDown(err)
    return []
  }
}

/** The chat model's `get_mandi_prices` tool: latest price at each mandi, plus MSP where the crop has one. */
export async function mandiPricesTool(
  env: Env,
  args: { commodity?: unknown; state?: unknown; district?: unknown },
  farmer: { state?: string; district?: string },
): Promise<Record<string, unknown>> {
  const commodity = String(args.commodity ?? '').trim()
  if (!commodity) return { error: 'Which crop? Ask the farmer.' }
  const state = matchState(typeof args.state === 'string' ? args.state : undefined) ?? findState(farmer.state)
  if (!state) return { error: 'Unknown state. Ask the farmer which state and district they are in.' }
  const district = (typeof args.district === 'string' && args.district.trim()) || (state.id === farmer.state ? farmer.district : undefined)

  const crop = findCommodity(commodity)
  const isCrop = (name: string) => (crop ? commodityForRecord(name)?.id === crop.id : normalizeName(name).includes(normalizeName(commodity)))

  let source = 'Agmarknet via data.gov.in'
  let rows = await dataGovRows(env, state, district, isCrop)
  let scope: 'district' | 'state' = district && rows.some((r) => sameName(r.district, district)) ? 'district' : 'state'

  const ids = await agmarknetCommodities(env, commodity).catch(() => [])
  if (!rows.length) {
    source = 'Agmarknet 2.0 (agmarknet.gov.in)'
    if (!ids.length) return { error: `"${commodity}" was not found among mandi commodities. Ask the farmer for another name of the crop.` }
    const cmdtIds = ids.map((c) => c.id)
    const local = district ? await agmarknetMarketPrices(env, state, district, cmdtIds) : undefined
    if (local?.districtFound && local.rows.length) {
      rows = local.rows
      scope = 'district'
    } else {
      rows = (await agmarknetMarketPrices(env, state, undefined, cmdtIds)).rows
      scope = 'state'
    }
  }

  // MSP and the state average put mandi prices in context ("below MSP: sell at a procurement centre").
  const summary = ids.length ? await agmarknetStateSummary(env, state, ids.map((c) => c.id)).catch(() => []) : []

  const sorted = rows.sort((a, b) => b.date.localeCompare(a.date) || b.modalPrice - a.modalPrice).slice(0, 25)
  return {
    commodity: crop?.id ?? commodity,
    state: state.id,
    district: scope === 'district' ? district : undefined,
    note:
      district && scope === 'state' && sorted.length
        ? `No mandi in ${district} district reported this crop in the last few days; showing mandis across ${state.id}.`
        : sorted.length
          ? undefined
          : 'No mandi in this area reported this crop in the last few days.',
    howToRead:
      "modalPrice = the price most of the produce sold at, at that mandi on that date. Check each row's unit (usually Rs./Quintal = per 100 kg).",
    rows: sorted,
    stateSummary: summary.length ? summary : undefined,
    mspNote: summary.some((s) => s.msp) ? 'msp = Minimum Support Price for the current marketing season, in Rs./Quintal.' : undefined,
    source,
  }
}

import { commodityForRecord, normalizeName, type Commodity } from '../shared/commodities'
import type { IndianState } from '../shared/states'
import { UpstreamError, cached, indiaNow, upstreamFetch } from './util'

// Agmarknet 2.0 (agmarknet.gov.in), used when data.gov.in is down. These are the public, CAPTCHA-free
// endpoints behind the agmarknet.gov.in home-page dashboards. They are undocumented and may change.
// We never touch the CAPTCHA-protected report endpoints.
const API = 'https://api.agmarknet.gov.in/v1'
const DAY = 24 * 3600
const DAYS_BACK = 4 // today plus 3 earlier days: some mandis report late or are closed some days

interface Filters {
  states: { id: number; name: string }[]
  districts: { id: number; stateId: number; name: string }[]
  commodities: { id: number; name: string }[]
}

interface FiltersResponse {
  data: {
    state_data: { state_id: number; state_name: string }[]
    district_data: { id: number; state_id: number | null; district_name: string }[]
    cmdt_data: { cmdt_id: number; cmdt_name: string }[]
  }
}

interface MarketRow {
  status: string
  mkt_name: string
  cmdt_name: string
  district_name: string
  modal_price_wt: string | null
  unit_name_price: string | null
  arrival_qty: string | null
  unit_name_arrival: string | null
}

interface SummaryRow {
  cmdt_name: string
  msp_price: string | null
  as_on_price: string | null
  reported_date: string
}

export interface MarketPrice {
  market: string
  district: string
  commodity: string
  date: string
  modalPrice: number
  unit: string
  arrival?: string
}

// Ids >= 100000 are "All …" placeholders in Agmarknet's filter lists.
const isReal = (id: number | null) => id !== null && id < 100000
const sameName = (a: string, b: string) => normalizeName(a) === normalizeName(b)

function headers(env: Env) {
  return { 'user-agent': String(env.USER_AGENT), accept: 'application/json', 'content-type': 'application/json' }
}

function getFilters(env: Env): Promise<Filters> {
  return cached('agm2:filters', DAY, async () => {
    const res = await upstreamFetch('Agmarknet', `${API}/daily-price-arrival/filters`, {
      headers: headers(env),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new UpstreamError(`Agmarknet filters ${res.status}`)
    const { data } = (await res.json()) as FiltersResponse
    return {
      states: data.state_data.filter((s) => isReal(s.state_id)).map((s) => ({ id: s.state_id, name: s.state_name })),
      districts: data.district_data.filter((d) => isReal(d.id) && d.state_id !== null).map((d) => ({ id: d.id, stateId: d.state_id!, name: d.district_name })),
      commodities: data.cmdt_data.filter((c) => isReal(c.cmdt_id)).map((c) => ({ id: c.cmdt_id, name: c.cmdt_name })),
    }
  })
}

async function dashboard<T>(env: Env, body: Record<string, unknown>): Promise<T[]> {
  const res = await upstreamFetch('Agmarknet', `${API}/dashboard-data/`, {
    method: 'POST',
    headers: headers(env),
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ format: 'json', limit: 500, page: 1, ...body }),
  })
  if (!res.ok) throw new UpstreamError(`Agmarknet dashboard ${res.status}`)
  const json = (await res.json()) as { status?: string | boolean; message?: string; data?: { records?: T[] } }
  if (json.status !== 'success') throw new UpstreamError(`Agmarknet dashboard: ${json.message}`)
  return json.data?.records ?? []
}

const stateIdFor = (filters: Filters, state: IndianState) => filters.states.find((s) => state.api.some((a) => sameName(a, s.name)))?.id

export async function agmarknetDistricts(env: Env, state: IndianState): Promise<string[]> {
  const filters = await getFilters(env)
  const stateId = stateIdFor(filters, state)
  if (!stateId) console.warn(`Agmarknet has no state matching ${state.api.join(' / ')}`)
  return filters.districts.filter((d) => d.stateId === stateId).map((d) => d.name)
}

/**
 * Agmarknet commodity ids for a crop we know (any of its forms), else for Agmarknet names starting with the
 * Latin query ("apple" finds "Apple" but not "Pineapple").
 */
export async function agmarknetCommodities(env: Env, crop: Commodity | undefined, query: string): Promise<{ id: number; name: string }[]> {
  const { commodities } = await getFilters(env)
  if (crop) return commodities.filter((c) => commodityForRecord(c.name)?.id === crop.id)
  const q = normalizeName(query)
  return q ? commodities.filter((c) => normalizeName(c.name).startsWith(q)).slice(0, 10) : []
}

const isoDaysAgo = (n: number) => new Date(indiaNow().getTime() - n * 86400_000).toISOString().slice(0, 10)

/**
 * Latest modal price at each mandi for these commodities: the newest of the last few days per mandi.
 * Scoped to one district when Agmarknet knows it, else the whole state.
 */
export async function agmarknetMarketPrices(
  env: Env,
  state: IndianState,
  district: string | undefined,
  commodityIds: number[],
): Promise<{ rows: MarketPrice[]; districtFound: boolean }> {
  const filters = await getFilters(env)
  const stateId = stateIdFor(filters, state)
  if (!stateId || !commodityIds.length) return { rows: [], districtFound: false }
  const match = district ? filters.districts.find((d) => d.stateId === stateId && sameName(d.name, district)) : undefined

  const days = await Promise.all(
    Array.from({ length: DAYS_BACK }, (_, ago) => {
      const date = isoDaysAgo(ago)
      const key = `agm2:mkt:${stateId}:${match?.id ?? ''}:${commodityIds.join(',')}:${date}`
      // Today's figures keep arriving through the day; past days are final.
      return cached(key, ago === 0 ? 30 * 60 : 6 * 3600, async () => {
        const rows = await dashboard<MarketRow>(env, {
          dashboard: 'market_details_sp',
          date,
          state: [stateId],
          ...(match ? { district: [match.id] } : {}),
          commodity: commodityIds,
        })
        return rows
          .filter((r) => r.status === 'Reported Markets' && Number(r.modal_price_wt) > 0)
          .map((r): MarketPrice => ({
            market: r.mkt_name.trim(),
            district: r.district_name,
            commodity: r.cmdt_name,
            date,
            modalPrice: Number(r.modal_price_wt),
            unit: r.unit_name_price ?? 'Rs./Quintal',
            arrival: r.arrival_qty ? `${r.arrival_qty} ${r.unit_name_arrival ?? ''}`.trim() : undefined,
          }))
      })
    }),
  )

  // Days are newest first, so the first row seen for a mandi+commodity is its latest price.
  const latest = new Map<string, MarketPrice>()
  for (const row of days.flat()) {
    const key = `${row.market}|${row.commodity}`
    if (!latest.has(key)) latest.set(key, row)
  }
  return { rows: [...latest.values()], districtFound: Boolean(match) }
}

/** State-wide average and this season's MSP (where the crop has one) for each commodity. */
export async function agmarknetStateSummary(env: Env, state: IndianState, commodityIds: number[]) {
  const filters = await getFilters(env)
  const stateId = stateIdFor(filters, state)
  if (!stateId || !commodityIds.length) return []
  return cached(`agm2:sum:${stateId}:${commodityIds.join(',')}`, 30 * 60, async () => {
    const summaryFor = (ago: number) =>
      dashboard<SummaryRow>(env, { dashboard: 'marketwise_price_arrival', date: isoDaysAgo(ago), state: stateId, commodity: commodityIds })
    // Early in the morning today's summary is still empty.
    let rows = await summaryFor(0)
    if (!rows.length) rows = await summaryFor(1)
    return rows.map((r) => ({
      commodity: r.cmdt_name,
      msp: Number(r.msp_price) > 0 ? Number(r.msp_price) : undefined,
      stateAverage: Number(r.as_on_price) > 0 ? Number(r.as_on_price) : undefined,
      date: r.reported_date,
    }))
  })
}

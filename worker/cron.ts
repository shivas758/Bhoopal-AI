import { findState } from '../shared/states'
import { agmarknetIdsFor, agmarknetProbe, agmarknetStateDay } from './agmarknet'
import { dataGovProbe, restDataGov } from './prices'
import { cleanUp, saveSnapshot, writeStatus, type ServiceStatus, type SnapshotRow } from './store'
import { indiaNow } from './util'
import { MORNING_CRON, sendMorning, sendWarnings } from './push'
import { loadAlerts, storedAlerts } from './sachet'
import { getForecast } from './weather'

// The main audience's states. One Agmarknet request per state and day covers every crop below (~70 KB,
// ~0.5 ms to parse), so a run stays far inside the free plan's 50 subrequests and 10 ms CPU.
const SNAPSHOT_STATES = ['Andhra Pradesh', 'Telangana', 'Karnataka', 'Tamil Nadu', 'Kerala']
const SNAPSHOT_CROPS = [
  'Paddy',
  'Cotton',
  'Maize',
  'Groundnut',
  'Red Gram',
  'Dry Chillies',
  'Green Chilli',
  'Tomato',
  'Onion',
  'Potato',
  'Brinjal',
  'Turmeric',
  'Ragi',
  'Jowar',
  'Bajra',
  'Bengal Gram',
  'Green Gram',
  'Black Gram',
  'Soyabean',
  'Banana',
  'Coconut',
  'Copra',
  'Arecanut',
  'Mango',
  'Black pepper',
  'Cardamom',
  'Ginger',
  'Tapioca',
  'Coffee',
  'Cashewnut',
  'Rubber',
  'Sugarcane',
]
export const SNAPSHOT_CRON = '30 14 * * *'

const isoDay = (offsetDays: number) => new Date(indiaNow().getTime() + offsetDays * 86400_000).toISOString().slice(0, 10)

/** Saves today's mandi prices (and yesterday's, for mandis that report late) for 7-day trends and outages. */
export async function snapshotPrices(env: Env) {
  const started = Date.now()
  const ids = await agmarknetIdsFor(env, SNAPSHOT_CROPS)
  const jobs = SNAPSHOT_STATES.flatMap((name) => [isoDay(0), isoDay(-1)].map((date) => ({ state: findState(name)!, date })))
  const results = await Promise.allSettled(jobs.map((j) => agmarknetStateDay(env, j.state, j.date, ids)))
  const rows: SnapshotRow[] = []
  results.forEach((r, i) => {
    if (r.status === 'rejected') return console.warn(`snapshot ${jobs[i].state.id} ${jobs[i].date} failed: ${String(r.reason)}`)
    for (const p of r.value) {
      rows.push({
        state: jobs[i].state.id,
        district: p.district,
        market: p.market,
        commodity: p.commodity,
        date: p.date,
        modal: Math.round(p.modalPrice),
        unit: p.unit,
      })
    }
  })
  const saved = await saveSnapshot(env.DB, rows)
  await cleanUp(env.DB)
  console.log({ event: 'snapshot', saved, failed: results.filter((r) => r.status === 'rejected').length, ms: Date.now() - started })
}

async function check(run: () => Promise<string>): Promise<ServiceStatus> {
  const checked = Date.now()
  try {
    return { ok: true, checked, detail: (await run()).slice(0, 200) }
  } catch (err) {
    return { ok: false, checked, detail: (err instanceof Error ? err.message : String(err)).slice(0, 200) }
  }
}

/** Checks the free upstream services and stores the result for /api/health (and uptime monitors). */
export async function probeUpstreams(env: Env) {
  const [agmarknet, datagov, met, sachet] = await Promise.all([
    check(() => agmarknetProbe(env, findState('Telangana')!)),
    check(() => dataGovProbe(env)),
    // Hyderabad, through the normal cache: MET's Expires/If-Modified-Since rules apply.
    check(async () => `forecast updated ${(await getForecast(env, 17.4, 78.5)).updatedAt}`),
    check(async () => `${(await loadAlerts(env)).alerts.length} active South-India warnings`),
  ])
  // A dead data.gov.in costs farmers a 6 s timeout per question: skip it everywhere until the next probe.
  if (!datagov.ok && env.DATA_GOV_API_KEY) await restDataGov(env, 30)
  await writeStatus(env.DB, { agmarknet, datagov, met, sachet })
  console.log({ event: 'probe', agmarknet: agmarknet.ok, datagov: datagov.ok, met: met.ok, sachet: sachet.ok })
}

export async function runCron(cron: string, env: Env) {
  if (cron === SNAPSHOT_CRON) await snapshotPrices(env)
  else if (cron === MORNING_CRON) await sendMorning(env)
  else {
    await probeUpstreams(env)
    // The probe has just refreshed the warnings; push the serious new ones.
    await sendWarnings(env, await storedAlerts(env))
  }
}

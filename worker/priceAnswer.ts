import { COMMODITIES } from '../shared/commodities'
import { PHRASES, fill } from '../shared/phrases'
import { findState } from '../shared/states'
import { LANG_INFO, type Lang, type PriceResult } from '../shared/types'

const rupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const rupeesPerKg = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 })
const SHOW_ROWS = 5
const SHOW_FORMS = 2
const STALE_DAYS = 2

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400_000)

/**
 * A ready answer for "what is today's price of X", written from the price tool's rows without calling the AI.
 * Undefined when there is nothing trustworthy to show (then the AI explains instead).
 */
export function priceAnswer(result: PriceResult, lang: Lang, opts: { today: string; requestedDistrict?: string }): string | undefined {
  const forms = result.forms
    .map((f) => ({ ...f, rows: f.rows.filter((r) => !r.suspicious) }))
    .filter((f) => f.rows.length)
    .slice(0, SHOW_FORMS)
  if (!forms.length) return undefined

  const p = PHRASES[lang]
  const crop = COMMODITIES.find((c) => c.id === result.commodity)?.names[lang] ?? result.commodity
  const state = findState(result.state)?.names[lang] ?? result.state
  const date = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(LANG_INFO[lang].bcp47, { day: 'numeric', month: 'short', timeZone: 'UTC' })

  const lines: string[] = []
  if (result.scope === 'district' && result.district) lines.push(fill(p.priceHeadingDistrict, { crop, district: result.district }))
  else if (opts.requestedDistrict) lines.push(fill(p.priceStateFallback, { crop, district: opts.requestedDistrict, state }))
  else lines.push(fill(p.priceHeading, { crop }))

  let newest = ''
  for (const form of forms) {
    if (forms.length > 1 || result.forms.length > 1) lines.push(`**${form.name}**`)
    for (const row of form.rows.slice(0, SHOW_ROWS)) {
      if (row.date > newest) newest = row.date
      const where = result.scope === 'state' ? `${row.market}, ${row.district}` : row.market
      const price = /quintal/i.test(row.unit)
        ? `**₹${rupees.format(row.modalPrice)}**/${p.quintal} (₹${rupeesPerKg.format(row.modalPrice / 100)}/${p.kg})`
        : `**₹${rupees.format(row.modalPrice)}** ${row.unit}`
      lines.push(`- ${where} (${date(row.date)}): ${price}`)
    }
    if (form.mandis >= 3) {
      // No "(₹1,000–₹1,000)" when every mandi has the same price.
      const template = form.lowest === form.highest ? p.priceTypical.replace(/\s*\(₹\{low\}–₹\{high\}\)/, '') : p.priceTypical
      lines.push(fill(template, { typical: rupees.format(form.typicalPrice), low: rupees.format(form.lowest), high: rupees.format(form.highest) }))
    }
  }

  if (result.msp) {
    const template = result.msp.season ? p.priceMsp : p.priceMsp.replace(' ({season})', '')
    lines.push(fill(template, { season: result.msp.season ?? '', msp: rupees.format(result.msp.price) }))
    if (forms[0].typicalPrice < result.msp.price) lines.push(p.priceBelowMsp)
  }
  if (newest && daysBetween(newest, opts.today) > STALE_DAYS) lines.push(fill(p.priceStale, { date: date(newest) }))
  lines.push(p.priceClose)
  return lines.join('\n')
}

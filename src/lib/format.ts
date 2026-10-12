const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const rupeePaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

/** Indian digit grouping (₹1,25,000) for every language: farmers read Western digits on rates everywhere. */
export const formatRupees = (n: number) => rupee.format(Math.round(n))
export const formatRupeesPrecise = (n: number) => rupeePaise.format(n)
export const formatNumber = (n: number) => number.format(n)

export function formatDate(iso: string | number, bcp47: string) {
  const d = typeof iso === 'number' ? new Date(iso) : new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(bcp47, { day: 'numeric', month: 'short' })
}

export function formatDateTime(ms: number, bcp47: string) {
  return new Date(ms).toLocaleString(bcp47, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export function formatTime(iso: string, bcp47: string) {
  return new Date(iso).toLocaleTimeString(bcp47, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

/** yyyy-mm-dd for today in India. */
export function todayInIndia(offsetDays = 0) {
  return new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400 * 1000).toISOString().slice(0, 10)
}

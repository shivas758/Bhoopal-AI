const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const rupeePaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

/** Indian digit grouping (₹1,25,000) for every language: farmers read Western digits on rates everywhere. */
export const formatRupees = (n: number) => rupee.format(Math.round(n))
export const formatRupeesPrecise = (n: number) => rupeePaise.format(n)
export const formatNumber = (n: number) => number.format(n)

// Building an Intl.DateTimeFormat is slow on cheap phones and the Weather page formats ~40 dates per render.
const formatters = new Map<string, Intl.DateTimeFormat>()
function dateTimeFormat(bcp47: string, options: Intl.DateTimeFormatOptions) {
  const key = `${bcp47}|${JSON.stringify(options)}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(bcp47, options)
    formatters.set(key, f)
  }
  return f
}

export function formatDate(iso: string | number, bcp47: string) {
  const d = typeof iso === 'number' ? new Date(iso) : new Date(`${iso}T00:00:00`)
  return dateTimeFormat(bcp47, { day: 'numeric', month: 'short' }).format(d)
}

export function formatDateTime(ms: number, bcp47: string) {
  return dateTimeFormat(bcp47, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(ms))
}

/** "7:00 am", or in Indian languages the local word for the time of day ("ఉదయం 7:00") instead of a Latin "AM". */
export function formatTime(iso: string | number, bcp47: string) {
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }
  // Older browsers ignore dayPeriod and print AM/PM: still correct.
  return dateTimeFormat(bcp47, bcp47.startsWith('en') ? options : { ...options, dayPeriod: 'short' }).format(new Date(iso))
}

/** yyyy-mm-dd for today in India. */
export function todayInIndia(offsetDays = 0) {
  return new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400 * 1000).toISOString().slice(0, 10)
}

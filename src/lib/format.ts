import { dateTimeFormat } from '../../shared/time'

export { formatTime, todayInIndia } from '../../shared/time'

const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const rupeePaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

/** Indian digit grouping (₹1,25,000) for every language: farmers read Western digits on rates everywhere. */
export const formatRupees = (n: number) => rupee.format(Math.round(n))
export const formatRupeesPrecise = (n: number) => rupeePaise.format(n)
export const formatNumber = (n: number) => number.format(n)

export function formatDate(iso: string | number, bcp47: string) {
  const d = typeof iso === 'number' ? new Date(iso) : new Date(`${iso}T00:00:00`)
  return dateTimeFormat(bcp47, { day: 'numeric', month: 'short' }).format(d)
}

/** "13 Oct, 1:38 pm", with the local word for the time of day in Indian languages (like formatTime). */
export function formatDateTime(ms: number, bcp47: string) {
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }
  return dateTimeFormat(bcp47, bcp47.startsWith('en') ? options : { ...options, dayPeriod: 'short' }).format(new Date(ms))
}

// Date helpers that must give India's date and time wherever the code runs (a phone, or a Worker in UTC).

const formatters = new Map<string, Intl.DateTimeFormat>()
/** Building an Intl.DateTimeFormat is slow on cheap phones and the Weather page formats ~40 dates per render. */
export function dateTimeFormat(bcp47: string, options: Intl.DateTimeFormatOptions) {
  const key = `${bcp47}|${JSON.stringify(options)}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(bcp47, options)
    formatters.set(key, f)
  }
  return f
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

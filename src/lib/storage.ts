const PREFIX = 'bhoopal.'

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the app still works, it just won't remember this.
  }
}

export function removeKey(key: string) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* ignore */
  }
}

export function clearAll(keep: string[] = []) {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX) && !keep.includes(key.slice(PREFIX.length))) localStorage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
}

interface Saved<T> {
  at: number
  data: T
}

// Bump when the shape of a saved API response changes (WeatherResponse, PriceResult…), so a phone never
// renders an old copy with new code.
const OFFLINE_VERSION = 2
const OFFLINE_PREFIX = `offline:v${OFFLINE_VERSION}:`
const OFFLINE_INDEX = `offline-index-v${OFFLINE_VERSION}`
// Weather, district lists and a price card per crop.
const MAX_OFFLINE_ENTRIES = 12

/** Saves an API response for offline use, keeping only the most recent few to stay within storage limits. */
export function saveOffline<T>(key: string, data: T) {
  const index = readJson<string[]>(OFFLINE_INDEX, []).filter((k) => k !== key)
  index.unshift(key)
  for (const old of index.splice(MAX_OFFLINE_ENTRIES)) removeKey(OFFLINE_PREFIX + old)
  writeJson(OFFLINE_INDEX, index)
  writeJson(OFFLINE_PREFIX + key, { at: Date.now(), data } satisfies Saved<T>)
}

export function loadOffline<T>(key: string): Saved<T> | null {
  const saved = readJson<Saved<T> | null>(OFFLINE_PREFIX + key, null)
  return saved && typeof saved === 'object' && typeof saved.at === 'number' && saved.data ? saved : null
}

/** Removes offline copies saved by older versions of the app. */
export function dropOldOfflineCopies() {
  try {
    for (const key of Object.keys(localStorage)) {
      const name = key.slice(PREFIX.length)
      if (key.startsWith(PREFIX) && (name.startsWith('offline:') || name.startsWith('offline-index')) && !name.startsWith(OFFLINE_PREFIX) && name !== OFFLINE_INDEX) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    /* ignore */
  }
}

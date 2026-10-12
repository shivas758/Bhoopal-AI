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

const OFFLINE_INDEX = 'offline-index'
const MAX_OFFLINE_ENTRIES = 6

/** Saves an API response for offline use, keeping only the most recent few to stay within storage limits. */
export function saveOffline<T>(key: string, data: T) {
  const index = readJson<string[]>(OFFLINE_INDEX, []).filter((k) => k !== key)
  index.unshift(key)
  for (const old of index.splice(MAX_OFFLINE_ENTRIES)) removeKey(`offline:${old}`)
  writeJson(OFFLINE_INDEX, index)
  writeJson(`offline:${key}`, { at: Date.now(), data } satisfies Saved<T>)
}

export function loadOffline<T>(key: string): Saved<T> | null {
  return readJson<Saved<T> | null>(`offline:${key}`, null)
}

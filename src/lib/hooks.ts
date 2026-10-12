import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { loadOffline, saveOffline } from './storage'

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine)
}

export interface OfflineData<T> {
  data: T | null
  /** When `data` was fetched (ms since epoch). */
  savedAt: number | null
  loading: boolean
  error: unknown
  reload: () => void
}

// A saved copy older than this is refreshed when the farmer comes back to the app.
const STALE_MS = 30 * 60 * 1000

/**
 * Shows the last saved copy instantly (works offline), then refreshes from the network.
 * Pass `key = null` to skip loading (e.g. no state selected yet).
 */
export function useOfflineData<T>(key: string | null, fetcher: () => Promise<T>): OfflineData<T> {
  const [state, setState] = useState<Omit<OfflineData<T>, 'reload'>>({ data: null, savedAt: null, loading: false, error: null })
  const [attempt, setAttempt] = useState(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (!key) {
      setState({ data: null, savedAt: null, loading: false, error: null })
      return
    }
    const saved = loadOffline<T>(key)
    setState({ data: saved?.data ?? null, savedAt: saved?.at ?? null, loading: true, error: null })
    let cancelled = false
    fetcherRef
      .current()
      .then((data) => {
        if (cancelled) return
        saveOffline(key, data)
        setState({ data, savedAt: Date.now(), loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error }))
      })
    return () => {
      cancelled = true
    }
  }, [key, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  // In a field with a weak signal the phone stays "online", so the `online` event never fires. Retry when the
  // farmer comes back to the app instead, if the last try failed or the copy is old.
  useEffect(() => {
    if (!key) return
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return
      const s = stateRef.current
      if (!s.loading && (s.error || (s.savedAt && Date.now() - s.savedAt > STALE_MS))) reload()
    }
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    return () => {
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
    }
  }, [key, reload])

  return { ...state, reload }
}

/** A tiny shared flag store, e.g. "an answer is being written" for components far apart in the tree. */
export function createFlag(initial = false) {
  let value = initial
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const get = () => value
  return {
    set(next: boolean) {
      if (next === value) return
      value = next
      listeners.forEach((l) => l())
    },
    use: () => useSyncExternalStore(subscribe, get),
  }
}

/** True while the chat is writing an answer: the update toast waits, so a reload can't cut it off. */
export const answering = createFlag()

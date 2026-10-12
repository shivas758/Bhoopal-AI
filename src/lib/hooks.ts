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

/**
 * Shows the last saved copy instantly (works offline), then refreshes from the network.
 * Pass `key = null` to skip loading (e.g. no state selected yet).
 */
export function useOfflineData<T>(key: string | null, fetcher: () => Promise<T>): OfflineData<T> {
  const [state, setState] = useState<Omit<OfflineData<T>, 'reload'>>({ data: null, savedAt: null, loading: false, error: null })
  const [attempt, setAttempt] = useState(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

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
  return { ...state, reload }
}

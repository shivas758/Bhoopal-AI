import { useSyncExternalStore } from 'react'

export const ROUTES = ['home', 'chat', 'weather', 'diagnose', 'schemes', 'tools', 'settings', 'more', 'admin'] as const
export type Route = (typeof ROUTES)[number]

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

const getHash = () => window.location.hash

/** Hash routing (#/prices?x=y) keeps the PWA a single cached page that works offline. */
export function useRoute(): { route: Route; params: URLSearchParams } {
  const hash = useSyncExternalStore(subscribe, getHash)
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const route = (ROUTES as readonly string[]).includes(path) ? (path as Route) : 'home'
  return { route, params: new URLSearchParams(query) }
}

export function go(route: Route, params?: Record<string, string>) {
  const query = params ? `?${new URLSearchParams(params)}` : ''
  window.location.hash = `#/${route === 'home' ? '' : route}${query}`
  window.scrollTo(0, 0)
}

/**
 * Switches bottom-nav tabs without adding history entries, so Android's back button leaves the app instead of
 * replaying every tab tap. replaceState fires no hashchange, so one is dispatched for useRoute.
 */
export function goTab(route: Route) {
  const hash = `#/${route === 'home' ? '' : route}`
  if (window.location.hash === hash || (route === 'home' && !window.location.hash)) return
  window.history.replaceState(null, '', hash)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  window.scrollTo(0, 0)
}

const ASK_KEY = 'bhoopal.ask'

/**
 * Opens the chat with a question to send right away. Only questions asked inside the app are auto-sent: a
 * forwarded "#/chat?q=…" link just fills the box, so nobody can spend a farmer's quota or plant a question.
 */
export function goAsk(params: { q?: string; crop?: string; voice?: '1' }) {
  const query = new URLSearchParams(params as Record<string, string>).toString()
  try {
    sessionStorage.setItem(ASK_KEY, query)
  } catch {
    /* private mode: the question will just fill the box */
  }
  go('chat', params as Record<string, string>)
}

/** True (once) when these chat params came from goAsk() in this tab. */
export function takeAsk(params: URLSearchParams): boolean {
  try {
    const ok = sessionStorage.getItem(ASK_KEY) === params.toString()
    sessionStorage.removeItem(ASK_KEY)
    return ok
  } catch {
    return false
  }
}

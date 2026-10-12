import { useSyncExternalStore } from 'react'

export const ROUTES = ['home', 'chat', 'weather', 'diagnose', 'schemes', 'tools', 'settings', 'more'] as const
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

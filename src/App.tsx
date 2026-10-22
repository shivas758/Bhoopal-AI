import { Suspense, lazy, useEffect, useRef } from 'react'
import { BottomNav } from './components/BottomNav'
import { UpdateToast } from './components/PwaPrompts'
import { PushSync } from './components/PushToggle'
import { OfflineBanner, Spinner } from './components/ui'
import { useSession } from './lib/auth'
import { useRoute, type Route } from './lib/router'
import { Chat } from './pages/Chat'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { Weather } from './pages/Weather'
import { useSettings } from './settings'

// Home, Ask and Weather are in the first download; the rest load when opened (and are still cached for offline
// use by the service worker), so the first screen appears sooner on 2G.
const PAGES: Record<Route, React.ComponentType> = {
  home: Home,
  chat: Chat,
  weather: Weather,
  diagnose: lazy(() => import('./pages/Diagnose').then((m) => ({ default: m.Diagnose }))),
  schemes: lazy(() => import('./pages/Schemes').then((m) => ({ default: m.Schemes }))),
  tools: lazy(() => import('./pages/Tools').then((m) => ({ default: m.Tools }))),
  settings: lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings }))),
  more: lazy(() => import('./pages/More').then((m) => ({ default: m.More }))),
}

function Main() {
  const { route } = useRoute()
  const Page = PAGES[route]
  const first = useRef(true)
  // After a page change, move focus to its heading so screen readers announce the new page (not on app start).
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    document.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
  }, [route])
  return (
    <div className="mx-auto min-h-dvh max-w-xl bg-soil-50" style={{ paddingBottom: 'var(--nav-h, 4rem)' }}>
      <OfflineBanner />
      <Suspense fallback={<Spinner />}>
        <Page />
      </Suspense>
      <BottomNav current={route} />
    </div>
  )
}

export function App() {
  const { settings } = useSettings()
  const session = useSession()
  return (
    <>
      {/* Language first, so the log-in screen is in the farmer's language; then log in; then the farm questions. */}
      {!settings.lang ? <Onboarding /> : !session ? <Login /> : settings.onboarded ? <Main /> : <Onboarding />}
      {/* Also registers the service worker, so it stays mounted from the very first (onboarding) screen:
          the app is cached for offline use from the farmer's first visit. */}
      <UpdateToast />
      <PushSync />
    </>
  )
}

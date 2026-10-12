import { BottomNav } from './components/BottomNav'
import { UpdateToast } from './components/PwaPrompts'
import { OfflineBanner } from './components/ui'
import { useRoute } from './lib/router'
import { Chat } from './pages/Chat'
import { Diagnose } from './pages/Diagnose'
import { Home } from './pages/Home'
import { More } from './pages/More'
import { Onboarding } from './pages/Onboarding'
import { Schemes } from './pages/Schemes'
import { Settings } from './pages/Settings'
import { Tools } from './pages/Tools'
import { Weather } from './pages/Weather'
import { useSettings } from './settings'

const PAGES = {
  home: Home,
  chat: Chat,
  weather: Weather,
  diagnose: Diagnose,
  schemes: Schemes,
  tools: Tools,
  settings: Settings,
  more: More,
}

function Main() {
  const { route } = useRoute()
  const Page = PAGES[route]
  return (
    <div className="mx-auto min-h-dvh max-w-xl bg-soil-50 pb-16">
      <OfflineBanner />
      <Page />
      <BottomNav current={route} />
    </div>
  )
}

export function App() {
  const { settings } = useSettings()
  return (
    <>
      {settings.onboarded ? <Main /> : <Onboarding />}
      {/* Also registers the service worker, so it stays mounted from the very first (onboarding) screen:
          the app is cached for offline use from the farmer's first visit. */}
      <UpdateToast />
    </>
  )
}

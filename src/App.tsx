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

export function App() {
  const { settings } = useSettings()
  const { route } = useRoute()

  if (!settings.onboarded) return <Onboarding />

  const Page = PAGES[route]
  return (
    <div className="mx-auto min-h-dvh max-w-xl bg-soil-50 pb-16">
      <OfflineBanner />
      <Page />
      <UpdateToast />
      <BottomNav current={route} />
    </div>
  )
}

import { CloudSun, Home, LayoutGrid, MessageCircle } from 'lucide-react'
import type { MessageKey } from '../i18n'
import { go, type Route } from '../lib/router'
import { useT } from '../settings'

const ITEMS: { route: Route; label: MessageKey; Icon: typeof Home }[] = [
  { route: 'home', label: 'nav.home', Icon: Home },
  { route: 'chat', label: 'nav.ask', Icon: MessageCircle },
  { route: 'weather', label: 'nav.weather', Icon: CloudSun },
  { route: 'more', label: 'nav.more', Icon: LayoutGrid },
]

const MORE_ROUTES: Route[] = ['more', 'diagnose', 'schemes', 'tools', 'settings']

export function BottomNav({ current }: { current: Route }) {
  const { t } = useT()
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white">
      <ul className="mx-auto flex max-w-xl">
        {ITEMS.map(({ route, label, Icon }) => {
          const active = route === current || (route === 'more' && MORE_ROUTES.includes(current))
          return (
            <li key={route} className="flex-1">
              <button
                onClick={() => go(route)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full flex-col items-center gap-0.5 py-2 text-xs font-medium ${active ? 'text-brand-700' : 'text-stone-500'}`}
              >
                <Icon className="size-6" strokeWidth={active ? 2.4 : 2} />
                <span className="max-w-full truncate px-1">{t(label)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

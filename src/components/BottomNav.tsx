import { CloudSun, Home, LayoutGrid, MessageCircle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { MessageKey } from '../i18n'
import { goTab, type Route } from '../lib/router'
import { useT } from '../settings'

const ITEMS: { route: Route; label: MessageKey; Icon: typeof Home }[] = [
  { route: 'home', label: 'nav.home', Icon: Home },
  { route: 'chat', label: 'nav.ask', Icon: MessageCircle },
  { route: 'weather', label: 'nav.weather', Icon: CloudSun },
  { route: 'more', label: 'nav.more', Icon: LayoutGrid },
]

const MORE_ROUTES: Route[] = ['more', 'diagnose', 'schemes', 'tools', 'settings']

/** Publishes an element's height as a CSS variable, so fixed bars stack correctly at any font size. */
export function useHeightVar<T extends HTMLElement = HTMLElement>(name: string) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty(name, `${el.offsetHeight}px`)
    set()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(set)
    observer.observe(el)
    return () => observer.disconnect()
  }, [name])
  return ref
}

export function BottomNav({ current }: { current: Route }) {
  const { t } = useT()
  const ref = useHeightVar('--nav-h')
  return (
    <nav ref={ref} className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white">
      <ul className="mx-auto flex max-w-xl">
        {ITEMS.map(({ route, label, Icon }) => {
          const active = route === current || (route === 'more' && MORE_ROUTES.includes(current))
          return (
            <li key={route} className="flex-1">
              <button
                onClick={() => goTab(route)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full flex-col items-center gap-0.5 py-2 text-sm font-medium ${active ? 'text-brand-700' : 'text-stone-600'}`}
              >
                <Icon className="size-6" strokeWidth={active ? 2.4 : 2} aria-hidden />
                <span className="max-w-full truncate px-1">{t(label)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

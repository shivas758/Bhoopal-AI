import { Calculator, Camera, ChevronRight, Landmark, Settings as SettingsIcon } from 'lucide-react'
import { ExperimentalBadge, PageHeader, ShareButton, secondaryButton } from '../components/ui'
import type { MessageKey } from '../i18n'
import { go, type Route } from '../lib/router'
import { appUrl } from '../lib/share'
import { useT } from '../settings'

const ITEMS: { route: Route; label: MessageKey; Icon: typeof Camera; tint: string; experimental?: boolean }[] = [
  { route: 'diagnose', label: 'feature.diagnose', Icon: Camera, tint: 'bg-rose-100 text-rose-700', experimental: true },
  { route: 'schemes', label: 'feature.schemes', Icon: Landmark, tint: 'bg-sky-100 text-sky-800' },
  { route: 'tools', label: 'feature.tools', Icon: Calculator, tint: 'bg-violet-100 text-violet-800' },
  { route: 'settings', label: 'feature.settings', Icon: SettingsIcon, tint: 'bg-stone-200 text-stone-700' },
]

export function More() {
  const { t } = useT()
  return (
    <>
      <PageHeader title={t('more.title')} back={null} />
      <main className="flex flex-col gap-2 p-3 pb-24">
        {ITEMS.map(({ route, label, Icon, tint, experimental }) => (
          <button
            key={route}
            onClick={() => go(route)}
            className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm active:bg-stone-50"
          >
            <span className={`rounded-xl p-2 ${tint}`}>
              <Icon className="size-6" />
            </span>
            <span className="flex flex-1 flex-wrap items-center gap-2 font-semibold">
              {t(label)}
              {experimental && <ExperimentalBadge />}
            </span>
            <ChevronRight className="size-5 text-stone-400" />
          </button>
        ))}
        {/* Farmers hear about apps from other farmers: make passing it on one tap. */}
        <ShareButton content={async () => ({ text: t('share.appText', { url: appUrl() }) })} label={t('share.app')} className={`${secondaryButton} mt-2`} />
      </main>
    </>
  )
}

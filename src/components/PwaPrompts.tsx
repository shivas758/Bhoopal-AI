import { Download, RefreshCw, X } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { answering } from '../lib/hooks'
import { useT } from '../settings'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// beforeinstallprompt can fire before React mounts, so capture it at module load.
let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as InstallPromptEvent
  listeners.forEach((l) => l())
})
window.addEventListener('appinstalled', () => {
  deferred = null
  listeners.forEach((l) => l())
})

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

/** "Install BhooPal" card for the home screen (Android prompt, or instructions on iPhone). */
export function InstallCard() {
  const { t } = useT()
  const prompt = useSyncExternalStore(subscribe, () => deferred)
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('bhoopal.installDismissed') === '1')

  if (dismissed || isStandalone() || (!prompt && !isIos())) return null

  const dismiss = () => {
    sessionStorage.setItem('bhoopal.installDismissed', '1')
    setDismissed(true)
  }

  return (
    <div className="relative flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
      <img src="/logo.svg" alt="" className="size-12 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-brand-900">{t('pwa.installTitle')}</p>
        <p className="text-sm text-brand-900/80">{prompt ? t('pwa.installBody') : t('pwa.iosHint')}</p>
        {prompt && (
          <button
            onClick={async () => {
              await prompt.prompt()
              await prompt.userChoice
              deferred = null
              dismiss()
            }}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
          >
            <Download className="size-4" /> {t('pwa.install')}
          </button>
        )}
      </div>
      <button onClick={dismiss} aria-label={t('common.close')} className="-m-1 rounded-full p-2.5 text-brand-900">
        <X className="size-5" />
      </button>
    </div>
  )
}

/** Toasts for "new version available" and "ready to work offline". */
export function UpdateToast() {
  const { t } = useT()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // Farmers may keep the app open for days. Check for an update when they come back to it, at most every
      // 6 hours, and never on Data Saver (an update downloads the whole new app).
      let lastCheck = Date.now()
      document.addEventListener('visibilitychange', () => {
        const saveData = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData
        if (document.visibilityState !== 'visible' || saveData || Date.now() - lastCheck < 6 * 3600 * 1000) return
        lastCheck = Date.now()
        void registration.update()
      })
    },
  })

  useEffect(() => {
    if (!offlineReady) return
    const timer = setTimeout(() => setOfflineReady(false), 4000)
    return () => clearTimeout(timer)
  }, [offlineReady, setOfflineReady])

  // Updating reloads the page, which would cut off an answer being written; wait until it's done.
  const busy = answering.use()
  if ((!needRefresh && !offlineReady) || busy) return null
  return (
    // At the top: at the bottom it covered the chat box.
    <div className="fixed inset-x-3 top-3 z-40 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-stone-900 p-3 text-sm text-white shadow-lg">
      <span className="flex-1">{needRefresh ? t('pwa.updateAvailable') : t('pwa.offlineReady')}</span>
      {needRefresh && (
        <button onClick={() => updateServiceWorker(true)} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 font-semibold">
          <RefreshCw className="size-4" /> {t('pwa.update')}
        </button>
      )}
      <button onClick={() => (setNeedRefresh(false), setOfflineReady(false))} aria-label={t('common.close')} className="-m-1 rounded-full p-2">
        <X className="size-5" />
      </button>
    </div>
  )
}

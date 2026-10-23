import { BadgeCheck, Download, EllipsisVertical, House, Loader2, Share, SquarePlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MessageKey } from '../i18n'
import { installScreenState, type InstallState } from '../lib/install'
import { endInstallRequest, promptInstall, useInstallPrompt } from '../lib/installPrompt'
import { isStandalone, platform } from '../lib/platform'
import { useSettings, useT } from '../settings'
import { Notice, primaryButton, secondaryButton } from './ui'

/** Whether to show the full-screen "add to home screen" step, and which version of it. */
export function useInstallState(): InstallState {
  const { settings, update } = useSettings()
  const { prompt, justInstalled, requested, relatedInstalled } = useInstallPrompt()
  // Remember an install for good: Chrome won't offer the prompt again, and the screen must not ask again.
  useEffect(() => {
    if ((justInstalled || relatedInstalled) && settings.installedAt === undefined) update({ installedAt: Date.now() })
  }, [justInstalled, relatedInstalled, settings.installedAt, update])
  return installScreenState({
    platform: platform(),
    standalone: isStandalone(),
    hasPrompt: prompt !== null,
    justInstalled,
    requested,
    installed: settings.installedAt !== undefined || relatedInstalled,
    dismissed: settings.installDismissedAt !== undefined,
  })
}

type Step = [MessageKey, typeof House]
// Phone menus are in the phone's language, so the step text quotes their English labels.
const ANDROID_STEPS: Step[] = [
  ['install.androidStep1', EllipsisVertical],
  ['install.androidStep2', SquarePlus],
  ['install.androidStep3', House],
]
const IOS_STEPS: Step[] = [
  ['install.iosStep1', Share],
  ['install.iosStep2', SquarePlus],
  ['install.iosStep3', House],
]

function Steps({ steps }: { steps: Step[] }) {
  const { t } = useT()
  return (
    <ol className="flex flex-col gap-4">
      {steps.map(([key, Icon], i) => (
        <li key={key} className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800">{i + 1}</span>
          <Icon className="mt-1.5 size-6 shrink-0 text-stone-600" aria-hidden />
          <span className="pt-1.5 text-lg">{t(key)}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Full screen asking the farmer to add BhooPal to the phone's home screen: one tap on Android Chrome, the steps
 * elsewhere. Shown once per phone (App.tsx); every way out records that.
 */
export function InstallScreen({ state }: { state: Exclude<InstallState, 'skip'> }) {
  const { t } = useT()
  const { update } = useSettings()
  const [busy, setBusy] = useState(false)

  const leave = () => {
    update({ installDismissedAt: Date.now() })
    endInstallRequest()
  }

  const install = async () => {
    setBusy(true)
    try {
      // The event works once. Cancelling Chrome's dialog is a "Not now": don't follow it with the manual steps.
      // Accepting flips the store, and the screen shows the "it's on your home screen" view.
      if ((await promptInstall()) === 'dismissed') leave()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 pb-36 pt-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src="/logo.svg" alt="" className="size-20 rounded-2xl shadow" />
          <h1 className="text-3xl font-bold text-brand-800">BhooPal</h1>
        </div>
        {state === 'installed' ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <BadgeCheck className="size-16 text-brand-700" aria-hidden />
            <h2 className="text-2xl font-bold">{t('install.doneTitle')}</h2>
            <p className="text-lg text-stone-700">{t('install.doneBody')}</p>
          </div>
        ) : (
          <>
            <h2 className="text-center text-2xl font-bold">{t('install.title')}</h2>
            <p className="text-center text-lg text-stone-700">{t('install.why')}</p>
            {state === 'android-prompt' && <p className="text-center text-stone-600">{t('install.free')}</p>}
            {/* If Chrome's event arrives while the steps are showing, the button replaces them (App re-renders). */}
            {state === 'android-manual' && (
              <>
                <Steps steps={ANDROID_STEPS} />
                <p className="text-sm text-stone-600">{t('install.androidHint')}</p>
              </>
            )}
            {state === 'ios-steps' && (
              <>
                <Steps steps={IOS_STEPS} />
                {/* The home-screen app has its own storage on iPhone, so the language is asked again there. */}
                <Notice>{t('install.iosAgain')}</Notice>
              </>
            )}
          </>
        )}
      </main>
      {/* The way out always sits in a fixed bar, visible without scrolling on a small phone with large text. */}
      <div className="pb-safe fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-xl flex-col gap-2 px-4 py-3">
          {state === 'installed' ? (
            <button onClick={leave} className={`${primaryButton} w-full text-lg`}>
              {t('common.continue')}
            </button>
          ) : state === 'android-prompt' ? (
            <>
              <button onClick={() => void install()} disabled={busy} className={`${primaryButton} w-full text-lg`}>
                {busy ? <Loader2 className="size-5 motion-safe:animate-spin" /> : <Download className="size-5" aria-hidden />}
                {t('install.button')}
              </button>
              <button onClick={leave} className="self-center py-2 font-semibold text-brand-800 underline">
                {t('install.notNow')}
              </button>
            </>
          ) : (
            <button onClick={leave} className={`${secondaryButton} w-full`}>
              {t('install.notNow')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

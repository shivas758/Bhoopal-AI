import { useSyncExternalStore } from 'react'

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallPromptSnapshot {
  /** Chrome's saved beforeinstallprompt event, when one tap can install. */
  prompt: InstallPromptEvent | null
  /** Installed in this tab: the install dialog was accepted, or appinstalled fired. */
  justInstalled: boolean
  /** The farmer asked for the install screen from the More page. */
  requested: boolean
  /** Android Chrome says BhooPal is already installed on this phone (getInstalledRelatedApps). */
  relatedInstalled: boolean
}

let deferred: InstallPromptEvent | null = null
let justInstalled = false
let requested = false
let relatedInstalled = false
// useSyncExternalStore must get the same object back until something changes, or React re-renders forever.
let snapshot: InstallPromptSnapshot = { prompt: null, justInstalled, requested, relatedInstalled }
const listeners = new Set<() => void>()

function notify() {
  snapshot = { prompt: deferred, justInstalled, requested, relatedInstalled }
  listeners.forEach((l) => l())
}

// beforeinstallprompt can fire before React mounts, so capture it at module load.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as InstallPromptEvent
  notify()
})
// Also fires when the farmer installs from Chrome's own menu while following the manual steps.
window.addEventListener('appinstalled', () => {
  deferred = null
  justInstalled = true
  notify()
})
// Chrome never fires beforeinstallprompt for an app that is already installed, so without this a farmer who
// installed earlier and opens the link in a Chrome tab would be told to install it. Android Chrome/Edge only;
// the manifest lists BhooPal itself under related_applications (vite.config.ts). Only ever sets, never clears.
const nav = navigator as { getInstalledRelatedApps?: () => Promise<unknown[]> }
nav.getInstalledRelatedApps?.().then(
  (apps) => {
    if (apps.length > 0) {
      relatedInstalled = true
      notify()
    }
  },
  () => {},
)

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export const useInstallPrompt = () => useSyncExternalStore(subscribe, () => snapshot)

/** Opens Chrome's install dialog. 'none' when there is no saved event (or it failed: the manual steps take over). */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'none'> {
  const e = deferred
  if (!e) return 'none'
  try {
    await e.prompt()
    const { outcome } = await e.userChoice
    if (outcome === 'accepted') justInstalled = true
    return outcome
  } catch {
    return 'none'
  } finally {
    // Only now: dropping the event earlier would switch the screen to manual steps while the dialog is open.
    deferred = null
    notify()
  }
}

/** From the More page: show the install screen again. */
export function requestInstallScreen() {
  requested = true
  notify()
}

/** The farmer left the install screen (Not now, or Continue after installing). */
export function endInstallRequest() {
  requested = false
  justInstalled = false
  notify()
}

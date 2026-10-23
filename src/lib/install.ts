import type { Platform } from './platform'

export type InstallState = 'android-prompt' | 'android-manual' | 'ios-steps' | 'installed' | 'skip'

export interface InstallFacts {
  platform: Platform
  /** Opened from the home-screen icon. */
  standalone: boolean
  /** Chrome's beforeinstallprompt event is in hand, so one tap can install. */
  hasPrompt: boolean
  /** Installed in this tab (install dialog accepted, or appinstalled fired) and the farmer hasn't tapped Continue yet. */
  justInstalled: boolean
  /** The farmer tapped "Add BhooPal to home screen" on the More page. */
  requested: boolean
  /** Android reported the app installed at some point (settings.installedAt). */
  installed: boolean
  /** The farmer closed the full screen before (settings.installDismissedAt). */
  dismissed: boolean
}

/** Which full-screen "add to home screen" view to show, if any. Pure, so it is tested without a browser. */
export function installScreenState(f: InstallFacts): InstallState {
  // Never inside the installed app, on a computer, or inside another app's browser (no way to install there).
  if (f.standalone || f.platform === 'other') return 'skip'
  // Installed from the Home card after saying "Not now": no full-screen takeover of what they were doing.
  if (f.justInstalled) return f.requested || !f.dismissed ? 'installed' : 'skip'
  // The full screen shows once per phone; after that only when asked for from the More page.
  if (!f.requested && (f.dismissed || f.installed)) return 'skip'
  // Asked from More while still installed (Chrome offers no prompt for an installed app): it is already there.
  if (f.installed && !f.hasPrompt) return 'installed'
  if (f.platform === 'ios') return 'ios-steps'
  return f.hasPrompt ? 'android-prompt' : 'android-manual'
}

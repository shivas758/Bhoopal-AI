export type Platform = 'android' | 'ios' | 'other'

/** What kind of phone this is, from the user agent, so it can be tested without a browser. */
export function platformFrom(ua: string, maxTouchPoints: number): Platform {
  // iPadOS 13+ calls itself a Mac; a real Mac has no touch points.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && maxTouchPoints > 1)) return 'ios'
  // "; wv)" is Android's WebView (a link opened inside Facebook, Instagram and the like): no "Add to Home screen" there.
  if (/android/i.test(ua) && !/; wv\)/.test(ua)) return 'android'
  return 'other'
}

export const platform = () => platformFrom(navigator.userAgent, navigator.maxTouchPoints ?? 0)

export const isIos = () => platform() === 'ios'

/** Opened from the home-screen icon, not in a browser tab. */
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

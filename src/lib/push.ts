import type { Settings } from '../settings'
import { api } from './api'
import { readJson, writeJson } from './storage'

/** Why the morning message can't be turned on here, if it can't. */
export type PushBlock = 'unsupported' | 'ios-install' | 'denied'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

export function pushBlock(): PushBlock | undefined {
  // iPhones support Web Push only for apps added to the Home Screen (iOS 16.4+), where PushManager appears.
  if (!('PushManager' in window)) return isIos() ? 'ios-install' : 'unsupported'
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return undefined
}

const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.length && new Uint8Array(a).every((v, i) => v === b[i])

/** The service worker, or undefined when there is none (e.g. local development). */
async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  return Promise.race([navigator.serviceWorker.ready, new Promise<undefined>((r) => setTimeout(r, 5000))])
}

/** This phone's push subscription, made (or remade, after a server key change) if needed. */
async function subscription(reg: ServiceWorkerRegistration) {
  const key = fromB64url((await api.pushKey()).key)
  const current = await reg.pushManager.getSubscription()
  if (current && sameKey(current.options.applicationServerKey, key)) return current
  await current?.unsubscribe()
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
}

const body = (endpoint: string, s: Settings) => ({
  endpoint,
  lang: s.lang ?? 'en',
  state: s.state,
  district: s.district,
  ...(s.coords ? { coords: { lat: s.coords.lat, lon: s.coords.lon } } : {}),
})

/**
 * What the service worker shows if it can't reach the Worker when a push arrives (no signal): BhooPal and
 * "tap to see today's weather", in the farmer's language.
 */
async function saveFallback(title: string, text: string) {
  try {
    const cache = await caches.open('bhoopal-push')
    await cache.put(
      '/push-fallback',
      new Response(JSON.stringify({ title, body: text, tag: 'morning', url: '/#/weather' }), { headers: { 'content-type': 'application/json' } }),
    )
  } catch {
    // Without it, the English fallback is shown.
  }
}

/** Asks for permission (must follow a tap), subscribes and tells the Worker where the farm is. */
export async function enablePush(s: Settings, fallback: { title: string; body: string }): Promise<'on' | 'denied' | 'failed'> {
  if ((await Notification.requestPermission()) !== 'granted') return 'denied'
  try {
    const reg = await registration()
    if (!reg) return 'failed'
    const sub = await subscription(reg)
    await api.pushSubscribe(body(sub.endpoint, s))
    await saveFallback(fallback.title, fallback.body)
    writeJson(SYNCED_KEY, { at: Date.now(), profile: profile(s) })
    return 'on'
  } catch (err) {
    console.warn('push subscribe failed', err)
    return 'failed'
  }
}

/** Unsubscribes; the Worker deletes everything it kept for this phone. */
export async function disablePush() {
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await api.pushUnsubscribe(sub.endpoint).catch(() => {})
  await sub.unsubscribe().catch(() => {})
}

const SYNCED_KEY = 'push.synced'
const RESYNC_MS = 7 * 86400_000
const profile = (s: Settings) => JSON.stringify(body('', s))

/**
 * Keeps the Worker's copy of the farm (language, district, location) current, and resubscribes if the browser
 * dropped the subscription. Runs when those settings change, and at most weekly otherwise.
 */
export async function syncPush(s: Settings, fallback: { title: string; body: string }) {
  if (!s.alerts || pushBlock() || Notification.permission !== 'granted') return
  const synced = readJson<{ at?: number; profile?: string }>(SYNCED_KEY, {})
  if (synced.profile === profile(s) && Date.now() - (synced.at ?? 0) < RESYNC_MS) return
  try {
    const reg = await registration()
    if (!reg) return
    const sub = await subscription(reg)
    await api.pushSubscribe(body(sub.endpoint, s))
    await saveFallback(fallback.title, fallback.body)
    writeJson(SYNCED_KEY, { at: Date.now(), profile: profile(s) })
  } catch (err) {
    console.warn('push sync failed', err)
  }
}

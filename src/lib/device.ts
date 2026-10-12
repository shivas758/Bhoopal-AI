const KEY = 'bhoopal.device'

/**
 * A random id for this phone, kept in its storage. Many farmers can share one carrier IP, so the Worker counts
 * each phone's daily share of the free AI by this id. It identifies nothing about the farmer.
 */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('-')
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return ''
  }
}

export const deviceHeader = (): Record<string, string> => {
  const id = deviceId()
  return id ? { 'x-bhoopal-device': id } : {}
}

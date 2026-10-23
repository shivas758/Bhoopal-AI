import type { AdminStats } from '../../shared/types'
import { readJson, removeKey, writeJson } from './storage'

// The owner's analytics page (src/pages/Admin.tsx) opens with the ADMIN_TOKEN secret, remembered in this browser.

const KEY = 'admin'

export const loadToken = () => {
  const saved = readJson<unknown>(KEY, null)
  return typeof saved === 'string' && saved.length >= 20 ? saved : null
}
export const saveToken = (token: string) => writeJson(KEY, token)
export const forgetToken = () => removeKey(KEY)

export type AdminErrorCode = 'unauthorized' | 'not_configured' | 'network' | 'server'

export class AdminError extends Error {
  constructor(readonly code: AdminErrorCode) {
    super(code)
  }
}

/** Not through api.ts on purpose: a wrong admin token must not log a farmer account on this browser out. */
export async function fetchAdminStats(token: string, days: number): Promise<AdminStats> {
  let res: Response
  try {
    res = await fetch(`/api/admin/stats?days=${days}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(30_000) : undefined,
    })
  } catch {
    throw new AdminError('network')
  }
  if (res.status === 401) throw new AdminError('unauthorized')
  if (res.status === 404) throw new AdminError('not_configured')
  if (!res.ok) throw new AdminError('server')
  return (await res.json()) as AdminStats
}

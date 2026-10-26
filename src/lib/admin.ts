import type { AdminAnswers, AdminStats, Lang, Vote } from '../../shared/types'
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
async function adminGet<T>(token: string, path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      headers: { authorization: `Bearer ${token}` },
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(30_000) : undefined,
    })
  } catch {
    throw new AdminError('network')
  }
  if (res.status === 401) throw new AdminError('unauthorized')
  if (res.status === 404) throw new AdminError('not_configured')
  if (!res.ok) throw new AdminError('server')
  return (await res.json()) as T
}

export const fetchAdminStats = (token: string, days: number) => adminGet<AdminStats>(token, `/api/admin/stats?days=${days}`)

export interface AnswersFilter {
  kind?: 'chat' | 'photo'
  vote?: Vote
  lang?: Lang
  /** A phrase in the question or the answer. */
  q?: string
  /** Rows older than this moment (ms): the next page. */
  before?: number
  limit?: number
}

/** The kept questions and answers (7 days), newest first. */
export function fetchAdminAnswers(token: string, filter: AnswersFilter): Promise<AdminAnswers> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filter)) if (value !== undefined && value !== '') params.set(key, String(value))
  return adminGet<AdminAnswers>(token, `/api/admin/answers?${params}`)
}

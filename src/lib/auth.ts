import { useSyncExternalStore } from 'react'
import type { AuthResponse } from '../../shared/types'
import { readJson, removeKey, writeJson } from './storage'

export type Session = AuthResponse

const KEY = 'session'

function load(): Session | null {
  const saved = readJson<Partial<Session> | null>(KEY, null)
  return saved && typeof saved.token === 'string' && typeof saved.phone === 'string' ? { token: saved.token, phone: saved.phone } : null
}

let current = load()
// The server ended the session (e.g. the password was reset on another phone): the log-in screen says why.
let ended = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function logIn(session: Session) {
  current = session
  ended = false
  writeJson(KEY, session)
  notify()
}

export function logOut(reason?: 'ended') {
  if (!current) return
  current = null
  ended = reason === 'ended'
  removeKey(KEY)
  notify()
}

/** The logged-in account, or null: the app shows the log-in screen. */
export const useSession = () => useSyncExternalStore(subscribe, () => current)

export const sessionEnded = () => ended

export const authHeader = (): Record<string, string> => (current ? { authorization: `Bearer ${current.token}` } : {})

import { asciiDigits } from './text'

// Log-in rules shared by the app and the Worker, so the app never sends what the Worker would refuse.
export const MIN_PASSWORD = 6
export const MAX_PASSWORD = 64

/**
 * An Indian mobile number as its 10 digits, from however a farmer types it ("+91 98765-43210", "098765 43210",
 * Telugu digits), or undefined if it isn't one.
 */
export function normalizePhone(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const digits = asciiDigits(raw)
    .replace(/[\s().-]/g, '')
    .replace(/^(\+?91|0)(?=\d{10}$)/, '')
  return /^[6-9]\d{9}$/.test(digits) ? digits : undefined
}

export const validPassword = (password: unknown): password is string =>
  typeof password === 'string' && password.length >= MIN_PASSWORD && password.length <= MAX_PASSWORD

/** "+91 98765 43210" */
export const formatPhone = (phone: string) => `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`

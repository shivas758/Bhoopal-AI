import { spend } from './store'
import { nextPacificMidnight } from './util'

// Gemini's free quota is shared by every farmer, and the per-minute rate limits can't stop one phone (or one
// script) from using a whole day's worth. These daily caps can. Values come from DAILY_LIMITS in wrangler.jsonc.
const DEFAULT_LIMITS = { chatPerDevice: 25, chatPerIp: 40, photosPerDevice: 5, photosPerIp: 10, photosTotal: 25 }
type Limits = typeof DEFAULT_LIMITS

export type BudgetKind = 'chat' | 'photo'

export interface BudgetResult {
  ok: boolean
  /** Which limit was reached: this phone, this network (IP), or the photo checks of the whole app. */
  scope?: 'device' | 'ip' | 'total'
  retryAt?: number
}

const pacificDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' })

/** The budget day, which resets with Gemini's quota at midnight in California (~12:30 or 1:30 PM IST). */
export const budgetDay = (now = Date.now()) => pacificDate.format(now)

/** A random id the app keeps in the phone's storage: lets many farmers behind one carrier IP each get their share. */
export function deviceId(request: Request): string | undefined {
  const id = request.headers.get('x-bhoopal-device') ?? ''
  return /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : undefined
}

/** IPs are only ever stored as a short one-way hash. */
async function ipHash(ip: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`bhoopal:${ip}`))
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function limitsFrom(env: Env): Limits {
  const configured = (env.DAILY_LIMITS ?? {}) as Partial<Limits>
  return { ...DEFAULT_LIMITS, ...configured }
}

/**
 * Counts one AI use against today's budgets and says whether it is allowed. Call it only right before
 * Gemini is actually called (price buttons and cached answers are free). Without the store, it allows.
 */
export async function spendDailyBudget(env: Env, kind: BudgetKind, request: Request): Promise<BudgetResult> {
  const limits = limitsFrom(env)
  const device = deviceId(request)
  const ip = request.headers.get('cf-connecting-ip')
  const scopes: { key: string; limit: number; scope: NonNullable<BudgetResult['scope']> }[] = []
  if (device) scopes.push({ key: `${kind}:dev:${device}`, limit: kind === 'chat' ? limits.chatPerDevice : limits.photosPerDevice, scope: 'device' })
  if (ip) scopes.push({ key: `${kind}:ip:${await ipHash(ip)}`, limit: kind === 'chat' ? limits.chatPerIp : limits.photosPerIp, scope: 'ip' })
  if (kind === 'photo') scopes.push({ key: 'photo:all', limit: limits.photosTotal, scope: 'total' })

  const counts = await spend(
    env.DB,
    budgetDay(),
    scopes.map((s) => s.key),
  )
  if (!counts) return { ok: true }
  const over = scopes.findIndex((s, i) => counts[i] > s.limit)
  if (over < 0) return { ok: true }
  console.warn(`daily ${kind} limit reached (${scopes[over].scope}: ${counts[over]}/${scopes[over].limit})`)
  return { ok: false, scope: scopes[over].scope, retryAt: nextPacificMidnight() }
}

import { normalizePhone, validPassword } from '../shared/account'
import type { AuthResponse } from '../shared/types'
import { BadRequest, apiError, b64url, fromB64url, json, sha256Hex, utf8 } from './util'

// Accounts are a mobile number and a password; nothing else about the farmer is kept. Passwords are stored as
// PBKDF2-SHA256 (the only password hash in Web Crypto). OWASP asks for 600,000 rounds, but the free plan allows
// 10 ms CPU per request and 20,000 already take about 5 ms. The round count is saved in each hash, so it can be
// raised later (e.g. on a paid plan) without breaking existing passwords.
export const ITERATIONS = 20_000
// Farmers shouldn't have to remember their password often.
const SESSION_MS = 365 * 86400_000

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256))
}

/** "pbkdf2-sha256$<rounds>$<salt>$<hash>" (base64url). */
export async function hashPassword(password: string, iterations = ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2-sha256$${iterations}$${b64url(salt)}$${b64url(await derive(password, salt, iterations))}`
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, rounds, salt, hash] = stored.split('$')
  const iterations = Number(rounds)
  if (scheme !== 'pbkdf2-sha256' || !Number.isInteger(iterations) || iterations < 1 || !salt || !hash) return false
  const expected = fromB64url(hash)
  const actual = await derive(password, fromB64url(salt), iterations)
  // Compares every byte, so the time taken says nothing about how much of the hash matched.
  let diff = actual.length ^ expected.length
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ (expected[i] ?? 0)
  return diff === 0
}

async function credentials(request: Request) {
  const body = (await request.json().catch(() => null)) as { phone?: unknown; password?: unknown } | null
  const phone = normalizePhone(body?.phone)
  const password = body?.password
  if (!phone || !validPassword(password)) throw new BadRequest('invalid phone or password')
  return { phone, password }
}

/** A random token for the phone; only its SHA-256 is stored, so a leaked table can't be used to log in. */
async function startSession(env: Env, phone: string): Promise<Response> {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)))
  const now = Date.now()
  await env.DB.prepare('INSERT INTO sessions (id, phone, created, expires) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), phone, now, now + SESSION_MS)
    .run()
  return json({ token, phone } satisfies AuthResponse)
}

export async function handleSignup(request: Request, env: Env): Promise<Response> {
  const { phone, password } = await credentials(request)
  const { meta } = await env.DB.prepare('INSERT INTO users (phone, password, created) VALUES (?, ?, ?) ON CONFLICT (phone) DO NOTHING')
    .bind(phone, await hashPassword(password), Date.now())
    .run()
  if (!meta.changes) return apiError('account_exists', 409)
  return startSession(env, phone)
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const { phone, password } = await credentials(request)
  const user = await env.DB.prepare('SELECT password FROM users WHERE phone = ?').bind(phone).first<{ password: string }>()
  if (!user) return apiError('no_account', 404)
  if (!(await checkPassword(password, user.password))) return apiError('wrong_password', 401)
  return startSession(env, phone)
}

/**
 * Forgot password: for now the farmer just sets a new one. There is no free way to send an OTP, so anyone who
 * knows the number can do this; add OTP (or another check) here before accounts hold anything private.
 * Logs the number out everywhere else.
 */
export async function handleReset(request: Request, env: Env): Promise<Response> {
  const { phone, password } = await credentials(request)
  const { meta } = await env.DB.prepare('UPDATE users SET password = ? WHERE phone = ?')
    .bind(await hashPassword(password), phone)
    .run()
  if (!meta.changes) return apiError('no_account', 404)
  await env.DB.prepare('DELETE FROM sessions WHERE phone = ?').bind(phone).run()
  return startSession(env, phone)
}

function bearer(request: Request) {
  return /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(request.headers.get('authorization') ?? '')?.[1]
}

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const token = bearer(request)
  if (token)
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?')
      .bind(await sha256Hex(token))
      .run()
  return new Response(null, { status: 204 })
}

/** The logged-in farmer's number, or undefined. A D1 failure throws (a 500), so it never logs anyone out. */
export async function sessionPhone(request: Request, env: Env): Promise<string | undefined> {
  const token = bearer(request)
  if (!token) return undefined
  const row = await env.DB.prepare('SELECT phone FROM sessions WHERE id = ? AND expires > ?')
    .bind(await sha256Hex(token), Date.now())
    .first<{ phone: string }>()
  return row?.phone
}

/** Only logged-in farmers can use the AI (chat and photo checks). */
export async function rejectLoggedOut(request: Request, env: Env): Promise<Response | undefined> {
  return (await sessionPhone(request, env)) ? undefined : apiError('unauthorized', 401)
}

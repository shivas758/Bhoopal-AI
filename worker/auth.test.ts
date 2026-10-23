import { describe, expect, test } from 'vitest'
import { formatPhone, normalizePhone, validPassword } from '../shared/account'
import { ITERATIONS, checkPassword, handleLogin, handleLogout, handleReset, handleSignup, hashPassword, sessionPhone } from './auth'
import worker from './index'

/** Just the users, sessions and activity tables, for the statements worker/auth.ts runs. */
function fakeDb() {
  const users = new Map<string, { password: string; created: number; lastSeen?: number }>()
  const sessions = new Map<string, { phone: string; created: number; expires: number }>()
  const activity = new Map<string, Record<string, number>>()
  const statement = (sql: string, params: unknown[] = []) => ({
    bind: (...p: unknown[]) => statement(sql, p),
    async run() {
      let changes = 0
      if (sql.startsWith('INSERT INTO users')) {
        const [phone, password, created] = params as [string, string, number]
        if (!users.has(phone)) {
          users.set(phone, { password, created })
          changes = 1
        }
      } else if (sql.startsWith('UPDATE users SET password')) {
        const [password, phone] = params as [string, string]
        const user = users.get(phone)
        if (user) {
          user.password = password
          changes = 1
        }
      } else if (sql.startsWith('UPDATE users SET last_seen')) {
        const [lastSeen, phone] = params as [number, string]
        const user = users.get(phone)
        if (user) {
          user.lastSeen = lastSeen
          changes = 1
        }
      } else if (sql.startsWith('INSERT INTO activity')) {
        const kind = /INSERT INTO activity \(day, phone, (\w+)\)/.exec(sql)![1]
        const [day, phone] = params as [string, string]
        const row = activity.get(`${day}:${phone}`) ?? {}
        row[kind] = (row[kind] ?? 0) + 1
        activity.set(`${day}:${phone}`, row)
        changes = 1
      } else if (sql.startsWith('INSERT INTO sessions')) {
        const [id, phone, created, expires] = params as [string, string, number, number]
        sessions.set(id, { phone, created, expires })
        changes = 1
      } else if (sql === 'DELETE FROM sessions WHERE phone = ?') {
        for (const [id, s] of sessions) if (s.phone === params[0] && sessions.delete(id)) changes++
      } else if (sql === 'DELETE FROM sessions WHERE id = ?') {
        changes = sessions.delete(params[0] as string) ? 1 : 0
      } else {
        throw new Error(`unexpected SQL: ${sql}`)
      }
      return { success: true, meta: { changes } }
    },
    async first() {
      if (sql.startsWith('SELECT password FROM users')) {
        const user = users.get(params[0] as string)
        return user ? { password: user.password } : null
      }
      if (sql.startsWith('SELECT phone FROM sessions')) {
        const s = sessions.get(params[0] as string)
        return s && s.expires > (params[1] as number) ? { phone: s.phone } : null
      }
      throw new Error(`unexpected SQL: ${sql}`)
    },
  })
  const db = {
    prepare: (sql: string) => statement(sql),
    batch: (statements: ReturnType<typeof statement>[]) => Promise.all(statements.map((s) => s.run())),
  }
  return { db: db as unknown as D1Database, users, sessions, activity }
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://bhoopal.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

describe('phone numbers', () => {
  test('accepts the ways farmers type an Indian mobile number', () => {
    for (const typed of ['9876543210', '+91 98765 43210', '+919876543210', '919876543210', '098765-43210', '(98765) 43210', '९८७६५४३२१०']) {
      expect(normalizePhone(typed), typed).toBe('9876543210')
    }
  })
  test('a 10-digit number that starts with 91 is not cut short', () => {
    expect(normalizePhone('9198765432')).toBe('9198765432')
  })
  test('rejects landlines, short numbers and other junk', () => {
    for (const typed of ['5876543210', '987654321', '98765432101', '+1 9876543210', 'abc', '', undefined, 9876543210]) {
      expect(normalizePhone(typed), String(typed)).toBeUndefined()
    }
  })
  test('formats for display', () => {
    expect(formatPhone('9876543210')).toBe('+91 98765 43210')
  })
})

test('passwords need 6 to 64 characters', () => {
  expect(validPassword('12345')).toBe(false)
  expect(validPassword('123456')).toBe(true)
  expect(validPassword('పాస్‌వర్డ్')).toBe(true)
  expect(validPassword('x'.repeat(65))).toBe(false)
  expect(validPassword(123456)).toBe(false)
})

describe('password hashes', () => {
  test('check the right password, refuse a wrong one', async () => {
    const stored = await hashPassword('ragi2026')
    expect(stored).toMatch(new RegExp(`^pbkdf2-sha256\\$${ITERATIONS}\\$[\\w-]{22}\\$[\\w-]{43}$`))
    expect(stored).not.toContain('ragi2026')
    expect(await checkPassword('ragi2026', stored)).toBe(true)
    expect(await checkPassword('ragi2027', stored)).toBe(false)
  })
  test('the same password gets a different salt each time', async () => {
    expect(await hashPassword('ragi2026')).not.toBe(await hashPassword('ragi2026'))
  })
  test('older round counts keep working', async () => {
    expect(await checkPassword('ragi2026', await hashPassword('ragi2026', 1000))).toBe(true)
  })
  test('a damaged hash never matches', async () => {
    for (const stored of ['', 'plain', 'pbkdf2-sha256$0$abc$def', 'md5$1000$abc$def']) expect(await checkPassword('x', stored)).toBe(false)
  })
})

describe('accounts', () => {
  test('sign up, log out, log in, wrong password, unknown number', async () => {
    const { db, users, sessions, activity } = fakeDb()
    const env = { DB: db } as Env

    const signup = await handleSignup(post('/api/auth/signup', { phone: '+91 98765 43210', password: 'ragi2026' }), env)
    expect(signup.status).toBe(200)
    const { token, phone } = (await signup.json()) as { token: string; phone: string }
    expect(phone).toBe('9876543210')
    expect(users.get('9876543210')?.password).not.toContain('ragi2026')
    // Only the token's hash is stored.
    expect([...sessions.keys()][0]).toMatch(/^[0-9a-f]{64}$/)
    expect(await sessionPhone(post('/api/chat', {}, bearer(token)), env)).toBe('9876543210')
    // The log-in counts as today's activity for the owner's analytics page.
    expect([...activity.values()]).toEqual([{ logins: 1 }])
    expect(users.get('9876543210')?.lastSeen).toBeTypeOf('number')

    const again = await handleSignup(post('/api/auth/signup', { phone: '9876543210', password: 'other123' }), env)
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({ error: 'account_exists' })

    expect((await handleLogout(post('/api/auth/logout', {}, bearer(token)), env)).status).toBe(204)
    expect(await sessionPhone(post('/api/chat', {}, bearer(token)), env)).toBeUndefined()

    const wrong = await handleLogin(post('/api/auth/login', { phone: '9876543210', password: 'ragi2027' }), env)
    expect(wrong.status).toBe(401)
    expect(await wrong.json()).toEqual({ error: 'wrong_password' })

    const unknown = await handleLogin(post('/api/auth/login', { phone: '9123456789', password: 'ragi2026' }), env)
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toEqual({ error: 'no_account' })

    const login = await handleLogin(post('/api/auth/login', { phone: '09876543210', password: 'ragi2026' }), env)
    expect(login.status).toBe(200)
    const { token: second } = (await login.json()) as { token: string }
    expect(await sessionPhone(post('/api/chat', {}, bearer(second)), env)).toBe('9876543210')
  })

  test('a new password logs the number out everywhere else', async () => {
    const { db } = fakeDb()
    const env = { DB: db } as Env
    const first = (await (await handleSignup(post('/api/auth/signup', { phone: '9876543210', password: 'ragi2026' }), env)).json()) as { token: string }

    const reset = await handleReset(post('/api/auth/reset', { phone: '9876543210', password: 'jowar2026' }), env)
    expect(reset.status).toBe(200)
    const { token } = (await reset.json()) as { token: string }
    expect(await sessionPhone(post('/api/chat', {}, bearer(first.token)), env)).toBeUndefined()
    expect(await sessionPhone(post('/api/chat', {}, bearer(token)), env)).toBe('9876543210')
    expect((await handleLogin(post('/api/auth/login', { phone: '9876543210', password: 'ragi2026' }), env)).status).toBe(401)
    expect((await handleLogin(post('/api/auth/login', { phone: '9876543210', password: 'jowar2026' }), env)).status).toBe(200)

    const unknown = await handleReset(post('/api/auth/reset', { phone: '9123456789', password: 'jowar2026' }), env)
    expect(unknown.status).toBe(404)
  })

  test('bad numbers and short passwords are refused before touching the store', async () => {
    const env = { DB: fakeDb().db } as Env
    await expect(handleSignup(post('/api/auth/signup', { phone: '12345', password: 'ragi2026' }), env)).rejects.toThrow('invalid phone or password')
    await expect(handleSignup(post('/api/auth/signup', { phone: '9876543210', password: '123' }), env)).rejects.toThrow('invalid phone or password')
  })
})

describe('AI routes need a session', () => {
  const allow = { limit: async () => ({ success: true }) }
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
  test.each(['/api/chat', '/api/diagnose'])('%s without a valid token: 401', async (path) => {
    const env = { DB: fakeDb().db, CHAT_LIMITER: allow, PHOTO_LIMITER: allow } as unknown as Env
    for (const headers of [{}, bearer('not-a-real-session-token-at-all')]) {
      const res = await worker.fetch(post(path, {}, headers) as Parameters<typeof worker.fetch>[0], env, ctx)
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'unauthorized' })
    }
  })
})

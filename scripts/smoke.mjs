// Post-deploy smoke test: `node scripts/smoke.mjs <base-url>` (run by `npm run deploy` and `deploy:staging`).
// Uses no AI quota and creates no account: health, the app shell, weather (twice, to see Workers Cache), districts,
// prices, official warnings, the push key, the log-in tables and the POST guards. Exits non-zero if anything is wrong, so a broken deploy is noticed at once.
const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '')
// `npm run dev` serves the page through Vite (no _headers) and its proxy can't forward Node's sec-fetch
// headers, so those two checks only mean something on a deployed Worker.
const deployed = !/^https?:\/\/(localhost|127\.0\.0\.1)\b/.test(base)
let failed = 0

async function check(name, path, init, ok) {
  const started = Date.now()
  try {
    const res = await fetch(base + path, { ...init, signal: AbortSignal.timeout(30_000) })
    const text = await res.text()
    let body = text
    try {
      body = JSON.parse(text)
    } catch {
      /* not JSON */
    }
    const result = ok(res, body)
    const cache = res.headers.get('cf-cache-status')
    console.log(
      `${result === true ? 'ok  ' : 'FAIL'} ${name} ${res.status} ${Date.now() - started} ms${cache ? ` cache=${cache}` : ''}${result === true ? '' : ` – ${result}`}`,
    )
    if (result !== true) failed++
  } catch (err) {
    console.log(`FAIL ${name}: ${err.message}`)
    failed++
  }
}

const json = { 'content-type': 'application/json' }

console.log(`Smoke test ${base}`)
await check('health', '/api/health', {}, (r, b) => (r.status === 200 && typeof b.ai === 'boolean') || `${JSON.stringify(b).slice(0, 200)}`)
await check('app shell', '/', {}, (r, b) => (r.ok && typeof b === 'string' && b.includes('id="root"')) || 'no app root')
if (deployed) await check('security headers', '/', {}, (r) => (r.headers.get('content-security-policy') ? true : 'no CSP header'))
for (const round of ['weather', 'weather again']) {
  await check(round, '/api/weather?lat=17.39&lon=78.49', {}, (r, b) => (r.ok && Array.isArray(b.days) && b.days.length > 0) || 'no forecast days')
}
await check('districts', '/api/districts?state=Telangana', {}, (r, b) => (r.ok && Array.isArray(b.districts)) || 'no district list')
await check('prices', '/api/prices?commodity=Paddy&state=Telangana', {}, (r, b) => (r.ok && ('forms' in b || 'error' in b)) || 'bad price result')
await check('official warnings', '/api/alerts?lang=te&state=Telangana&district=Warangal', {}, (r, b) => (r.ok && Array.isArray(b.alerts)) || 'no alert list')
await check('push key', '/api/push/key', {}, (r, b) => (r.ok && typeof b.key === 'string' && b.key.length > 80) || 'no VAPID key (secret VAPID_PRIVATE_JWK?)')
await check(
  'push rejects other servers',
  '/api/push/subscribe',
  { method: 'POST', headers: json, body: JSON.stringify({ endpoint: 'https://example.com/x', lang: 'te', state: 'Telangana' }) },
  (r) => r.status === 400 || 'expected 400',
)
await check(
  'feedback',
  '/api/feedback',
  { method: 'POST', headers: json, body: JSON.stringify({ kind: 'chat', vote: 'up', lang: 'en', id: 'smoke' }) },
  (r) => r.status === 204 || 'expected 204',
)
// A made-up number: "no account" (or "wrong password", should someone own it) shows migration 0003 is applied.
await check(
  'log-in store',
  '/api/auth/login',
  { method: 'POST', headers: json, body: JSON.stringify({ phone: '6000000000', password: 'smoke-test-only' }) },
  (r, b) => r.status === 404 || r.status === 401 || `expected 404 or 401, got ${JSON.stringify(b).slice(0, 200)} (npm run db:migrate?)`,
)
// Rejections last: the Worker answers them without reading the body, which can upset a reused local
// dev-server connection for the next request.
// No body: the 401 comes before the body is read, and an unread body would upset the next request locally.
await check('chat needs log-in', '/api/chat', { method: 'POST', headers: json }, (r) => r.status === 401 || 'expected 401')
await check(
  'chat rejects text/plain',
  '/api/chat',
  { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' },
  (r) => r.status === 415 || 'expected 415',
)
if (deployed) {
  await check(
    'chat rejects cross-site',
    '/api/chat',
    { method: 'POST', headers: { ...json, 'sec-fetch-site': 'cross-site' }, body: '{}' },
    (r) => r.status === 403 || 'expected 403',
  )
}

console.log(failed ? `${failed} check(s) failed` : 'All checks passed')
process.exit(failed ? 1 : 0)

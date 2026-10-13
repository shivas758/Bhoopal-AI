// Prints a new Web Push (VAPID) signing key as JSON, for the VAPID_PRIVATE_JWK secret. Pipe it, don't paste it:
//   node scripts/vapid.mjs | npx wrangler secret put VAPID_PRIVATE_JWK [--env staging]
// A new key means every phone must turn alerts on again, so keep the key once it is set.
const { privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const { kty, crv, x, y, d } = await crypto.subtle.exportKey('jwk', privateKey)
process.stdout.write(JSON.stringify({ kty, crv, x, y, d }))

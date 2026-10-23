// Optional secrets. wrangler.jsonc's `secrets.required` generates the Env types, but `wrangler deploy` refuses to
// deploy while any secret listed there is unset, so an optional one is typed here instead (interfaces merge).
interface Env {
  /** A Cloudflare API token with "Account Analytics: Read": the AI section of the owner's analytics page (worker/admin.ts). */
  CF_ANALYTICS_TOKEN?: string
}

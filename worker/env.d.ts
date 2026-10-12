// Secrets aren't in wrangler.jsonc, so `wrangler types` can't see them.
interface Env {
  GEMINI_API_KEY?: string
  DATA_GOV_API_KEY?: string
}

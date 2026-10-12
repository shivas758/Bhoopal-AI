import { isLang, type FeedbackRequest } from '../shared/types'
import { handleChat } from './chat'
import { runCron } from './cron'
import { handleDiagnose } from './diagnose'
import { record } from './metrics'
import { handleDistricts, handlePrices } from './prices'
import { readStatus } from './store'
import { BadRequest, UpstreamError, apiError, json } from './util'
import { handleWeather } from './weather'

async function allowed(limiter: RateLimit, request: Request) {
  // Many rural users share mobile carrier IPs (CGNAT), so these limits are deliberately generous.
  const key = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const { success } = await limiter.limit({ key })
  return success
}

const MAX_BODY_BYTES: Record<string, number> = { '/api/chat': 64 * 1024, '/api/diagnose': 4 * 1024 * 1024, '/api/feedback': 2 * 1024 }

/**
 * The app only ever POSTs JSON from its own pages. Rejecting other content types and cross-site requests stops
 * another website from spending the free AI quota through its visitors' browsers (curl still can: the rate
 * limits are the backstop). A missing Sec-Fetch-Site is allowed, for old browsers.
 */
function rejectPost(request: Request, path: string): Response | undefined {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return apiError('bad_request', 415)
  if (request.headers.get('sec-fetch-site') === 'cross-site') return apiError('bad_request', 403)
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES[path]) return apiError('bad_request', 413)
  return undefined
}

// A probe older than this says nothing about now (e.g. the cron stopped).
const STATUS_FRESH_MS = 2 * 3600 * 1000

/**
 * For uptime monitors: 503 when the last probe found both price sources down. Never runs the AI or calls an
 * upstream itself; the cron probe (every 30 min) does that.
 */
async function handleHealth(env: Env): Promise<Response> {
  const status = await readStatus(env.DB)
  const fresh = (name: string) => (status[name] && Date.now() - status[name].checked < STATUS_FRESH_MS ? status[name] : undefined)
  const pricesDown = fresh('agmarknet')?.ok === false && (fresh('datagov')?.ok === false || !env.DATA_GOV_API_KEY)
  return json(
    {
      ai: Boolean(env.GEMINI_API_KEY),
      prices: Boolean(env.DATA_GOV_API_KEY),
      version: env.CF_VERSION_METADATA?.id,
      sources: status,
    },
    pricesDown ? 503 : 200,
  )
}

async function handleFeedback(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Partial<FeedbackRequest> | null
  if (!body || (body.kind !== 'chat' && body.kind !== 'photo') || (body.vote !== 'up' && body.vote !== 'down') || !isLang(body.lang)) {
    throw new BadRequest('invalid feedback')
  }
  const short = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : undefined)
  record(env, { kind: 'feedback', outcome: body.vote, detail: body.kind, id: short(body.id, 16), model: short(body.model, 60), lang: body.lang })
  return new Response(null, { status: 204 })
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    try {
      switch (`${request.method} ${url.pathname}`) {
        case 'GET /api/health':
          return await handleHealth(env)
        case 'GET /api/districts':
          if (!(await allowed(env.DATA_LIMITER, request))) return apiError('rate_limited', 429)
          return await handleDistricts(url, env)
        case 'GET /api/weather':
          if (!(await allowed(env.DATA_LIMITER, request))) return apiError('rate_limited', 429)
          return await handleWeather(url, env)
        case 'GET /api/prices':
          if (!(await allowed(env.PRICES_LIMITER, request))) return apiError('rate_limited', 429)
          return await handlePrices(url, env)
        case 'POST /api/chat':
          if (!(await allowed(env.CHAT_LIMITER, request))) return apiError('rate_limited', 429)
          return rejectPost(request, url.pathname) ?? (await handleChat(request, env, ctx))
        case 'POST /api/diagnose':
          if (!(await allowed(env.PHOTO_LIMITER, request))) return apiError('rate_limited', 429)
          return rejectPost(request, url.pathname) ?? (await handleDiagnose(request, env))
        case 'POST /api/feedback':
          if (!(await allowed(env.DATA_LIMITER, request))) return apiError('rate_limited', 429)
          return rejectPost(request, url.pathname) ?? (await handleFeedback(request, env))
      }
      return apiError('bad_request', 404)
    } catch (err) {
      if (err instanceof BadRequest) return apiError('bad_request', err.status)
      console.error(`${url.pathname} failed`, err)
      if (err instanceof UpstreamError && err.status === 429) {
        return apiError('busy', 503, err.retryAt ? { retryAt: new Date(err.retryAt).toISOString() } : {})
      }
      if (err instanceof UpstreamError) return apiError('upstream', 502)
      return apiError('server_error', 500)
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runCron(controller.cron, env))
  },
} satisfies ExportedHandler<Env>

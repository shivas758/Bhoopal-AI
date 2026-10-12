import { handleChat } from './chat'
import { handleDiagnose } from './diagnose'
import { handleDistricts } from './prices'
import { BadRequest, UpstreamError, apiError, json } from './util'
import { handleWeather } from './weather'

async function allowed(limiter: RateLimit, request: Request) {
  // Many rural users share mobile carrier IPs (CGNAT), so these limits are deliberately generous.
  const key = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const { success } = await limiter.limit({ key })
  return success
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    try {
      switch (`${request.method} ${url.pathname}`) {
        case 'GET /api/health':
          return json({ ai: Boolean(env.GEMINI_API_KEY), prices: Boolean(env.DATA_GOV_API_KEY) })
        case 'GET /api/districts':
          return await handleDistricts(url, env)
        case 'GET /api/weather':
          return await handleWeather(url, env)
        case 'POST /api/chat':
          if (!(await allowed(env.CHAT_LIMITER, request))) return apiError('rate_limited', 429)
          return await handleChat(request, env, ctx)
        case 'POST /api/diagnose':
          if (!(await allowed(env.PHOTO_LIMITER, request))) return apiError('rate_limited', 429)
          return await handleDiagnose(request, env)
      }
      return apiError('bad_request', 404)
    } catch (err) {
      if (err instanceof BadRequest) return apiError('bad_request', 400)
      console.error(`${url.pathname} failed`, err)
      if (err instanceof UpstreamError) return apiError(err.status === 429 ? 'busy' : 'upstream', err.status === 429 ? 503 : 502)
      return apiError('server_error', 500)
    }
  },
} satisfies ExportedHandler<Env>

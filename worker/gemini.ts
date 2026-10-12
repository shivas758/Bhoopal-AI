import { UpstreamError, upstreamFetch } from './util'

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export interface GeminiPart {
  text?: string
  thought?: boolean
  thoughtSignature?: string
  inlineData?: { mimeType: string; data: string }
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> }
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> }
}

export interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

export interface GeminiChunk {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
}

export interface GeminiRequest {
  contents: GeminiContent[]
  systemInstruction?: { parts: { text: string }[] }
  tools?: unknown[]
  toolConfig?: unknown
  generationConfig?: Record<string, unknown>
}

type Method = 'generateContent' | 'streamGenerateContent'

/**
 * The free tier allows only ~20 requests per day *per model*, so we rotate through a pool of models
 * (GEMINI_MODELS, best first). A model that runs out rests until Google says its quota resets.
 * This map is per Worker isolate; other isolates rediscover the limit with one failed call each.
 */
const restingUntil = new Map<string, number>()

export const modelPool = (env: Env) =>
  String(env.GEMINI_MODELS ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)

function thinkingConfig(env: Env, model: string) {
  const level = String(env.GEMINI_THINKING_LEVEL ?? '')
  // Gemini 2.x takes a token budget instead of a level; leave it on its default.
  return level && !model.startsWith('gemini-2') ? { thinkingLevel: level } : undefined
}

function post(env: Env, model: string, method: Method, body: GeminiRequest) {
  const thinking = thinkingConfig(env, model)
  const generationConfig = thinking ? { ...body.generationConfig, thinkingConfig: thinking } : body.generationConfig
  const query = method === 'streamGenerateContent' ? '?alt=sse' : ''
  return upstreamFetch('Gemini', `${BASE}/${model}:${method}${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY ?? '' },
    body: JSON.stringify({ ...body, generationConfig }),
  })
}

interface ErrorInfo {
  summary: string
  daily: boolean
  retrySeconds?: number
}

/** e.g. "RESOURCE_EXHAUSTED GenerateRequestsPerDayPerProjectPerModel-FreeTier limit=20 retry=40320s" */
function parseError(text: string): ErrorInfo {
  try {
    const err = (
      JSON.parse(text) as {
        error: {
          status?: string
          message?: string
          details?: { violations?: { quotaId?: string; quotaValue?: string }[]; retryDelay?: string }[]
        }
      }
    ).error
    const violations = (err.details ?? []).flatMap((d) => d.violations ?? [])
    const retry = err.details?.find((d) => d.retryDelay)?.retryDelay
    return {
      summary:
        [err.status, ...violations.map((v) => `${v.quotaId} limit=${v.quotaValue}`), retry && `retry=${retry}`].filter(Boolean).join(' ') ||
        (err.message ?? '').slice(0, 200),
      daily: violations.some((v) => /PerDay/i.test(v.quotaId ?? '')),
      retrySeconds: retry ? parseFloat(retry) : undefined,
    }
  } catch {
    return { summary: text.slice(0, 200), daily: false }
  }
}

export interface GeminiCallOptions {
  /** Try this model first, to keep one model for a whole tool-calling answer. */
  preferModel?: string
  /** Rewrites the request for a different model than the one that started the answer. */
  forOtherModel?: (body: GeminiRequest) => GeminiRequest
  /** Use only these models (local testing). */
  models?: string[]
}

/** Calls the best Gemini model that still has free quota, moving down the pool on rate limits or outages. */
export async function callGemini(
  env: Env,
  method: Method,
  body: GeminiRequest,
  opts: GeminiCallOptions = {},
): Promise<{ res: Response; model: string }> {
  const now = Date.now()
  const pool = (opts.models ?? modelPool(env)).filter((m) => (restingUntil.get(m) ?? 0) <= now)
  const models = opts.preferModel && pool.includes(opts.preferModel) ? [opts.preferModel, ...pool.filter((m) => m !== opts.preferModel)] : pool
  let lastError = new UpstreamError('Gemini: every model in the pool is out of free quota', 429)

  for (const model of models) {
    const request = opts.preferModel && model !== opts.preferModel && opts.forOtherModel ? opts.forOtherModel(body) : body
    const res = await post(env, model, method, request)
    if (res.ok && res.body) return { res, model }

    const info = parseError(await res.text().catch(() => ''))
    console.warn(`Gemini ${model} ${res.status}: ${info.summary}`)
    if (res.status === 400) throw new UpstreamError(`Gemini 400: ${info.summary}`, 400)
    if (res.status === 429) {
      // Daily quota: rest until reset. Per-minute: a short pause.
      const seconds = info.daily ? (info.retrySeconds ?? 3600) : Math.min(info.retrySeconds ?? 30, 60)
      restingUntil.set(model, Date.now() + seconds * 1000)
    } else if (res.status === 404) {
      restingUntil.set(model, Date.now() + 6 * 3600 * 1000) // retired or unavailable to this key
    }
    lastError = new UpstreamError(`Gemini ${res.status}`, res.status)
    if (![404, 429, 500, 503].includes(res.status)) break
  }
  throw lastError
}

/**
 * Turns earlier tool calls into plain text. Gemini 3 ties tool calls to the model that made them
 * (thought signatures), so a fallback model can't continue the original parts but can read this.
 */
export function toolHistoryAsText(contents: GeminiContent[]): GeminiContent[] {
  return contents.map((c) => ({
    role: c.role,
    parts: c.parts
      .filter((p) => !p.thought)
      .map((p): GeminiPart => {
        if (p.functionCall) return { text: `[Looked up ${p.functionCall.name} ${JSON.stringify(p.functionCall.args ?? {})}]` }
        if (p.functionResponse) return { text: `[Result of ${p.functionResponse.name}: ${JSON.stringify(p.functionResponse.response)}]` }
        return { text: p.text ?? '' }
      })
      .filter((p) => p.text),
  }))
}

/** Parses Gemini's `?alt=sse` stream into JSON chunks. */
export async function* readGeminiStream(body: ReadableStream<Uint8Array>): AsyncGenerator<GeminiChunk> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    // The last event may arrive without a trailing newline; flush it rather than drop the end of the answer.
    buffer += done ? '\n' : value
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim()
        if (data) yield JSON.parse(data) as GeminiChunk
      }
    }
    if (done) break
  }
}

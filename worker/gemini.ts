import { rest, restingNow } from './store'
import { UpstreamError, nextPacificMidnight, upstreamFetch } from './util'

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
// A whole streamed answer (including thinking) must finish within this, or the farmer is left waiting.
const CALL_TIMEOUT_MS = 90_000

export interface GeminiPart {
  text?: string
  thought?: boolean
  thoughtSignature?: string
  inlineData?: { mimeType: string; data: string }
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> }
  functionResponse?: { id?: string; name: string; response: object }
}

export interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

export interface GeminiChunk {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
  /** An overloaded model can fail in the middle of a stream that started with HTTP 200. */
  error?: { code?: number; message?: string; status?: string }
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
 * (GEMINI_MODELS, best first). A model that runs out rests until its quota resets.
 * This map is per Worker isolate; other isolates rediscover the limit with one failed call each.
 */
const restingUntil = new Map<string, number>()

/**
 * Gemini refuses some places the Worker can run in (e.g. Cloudflare's Hong Kong data centre, where the Gemini API
 * isn't offered: 400 FAILED_PRECONDITION). An isolate stays in one data centre, so after every model refused, this
 * one stops asking for a while and chat goes straight to the backup model instead of waiting for five refusals.
 */
export class GeminiRefusedHere extends UpstreamError {
  constructor() {
    super('Gemini: not available from this location', 403)
  }
}
const REFUSED_PAUSE_MS = 10 * 60 * 1000
let refusedHereUntil = 0

/** A model failed mid-stream (overloaded): skip it in this isolate for a minute. */
export function pauseModel(model: string, seconds = 60) {
  restingUntil.set(model, Math.max(restingUntil.get(model) ?? 0, Date.now() + seconds * 1000))
}

export const modelPool = (env: Env) =>
  String(env.GEMINI_MODELS ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)

function thinkingConfig(env: Env, model: string, plain: boolean) {
  // Gemini 2.x takes a token budget, and its default (dynamic) budget can eat the whole output limit.
  if (model.startsWith('gemini-2')) return { thinkingBudget: plain ? 0 : 512 }
  const level = String(env.GEMINI_THINKING_LEVEL ?? '')
  return level ? { thinkingLevel: level } : undefined
}

function post(env: Env, model: string, method: Method, body: GeminiRequest, opts: GeminiCallOptions) {
  const thinking = thinkingConfig(env, model, Boolean(opts.plain))
  const generationConfig = thinking ? { ...body.generationConfig, thinkingConfig: thinking } : body.generationConfig
  const query = method === 'streamGenerateContent' ? '?alt=sse' : ''
  const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS)
  return upstreamFetch('Gemini', `${BASE}/${model}:${method}${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY ?? '' },
    body: JSON.stringify({ ...body, generationConfig }),
    signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
  })
}

interface ErrorInfo {
  summary: string
  daily: boolean
  retrySeconds?: number
  /** "User location is not supported for the API use", or the free tier not offered in this country. */
  refusedHere: boolean
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
      // Quota errors are summed up by their limits; anything else needs Google's own words to be understood.
      summary:
        [
          err.status,
          ...violations.map((v) => `${v.quotaId} limit=${v.quotaValue}`),
          retry && `retry=${retry}`,
          !violations.length && err.message?.slice(0, 160),
        ]
          .filter(Boolean)
          .join(' ') || (err.message ?? '').slice(0, 200),
      daily: violations.some((v) => /PerDay/i.test(v.quotaId ?? '')),
      retrySeconds: retry ? parseFloat(retry) : undefined,
      refusedHere: err.status === 'FAILED_PRECONDITION',
    }
  } catch {
    return { summary: text.slice(0, 200), daily: false, refusedHere: false }
  }
}

export interface GeminiCallOptions {
  /** Try this model first, to keep one model for a whole tool-calling answer. */
  preferModel?: string
  /** Skip these models, e.g. one that just went quiet, so a retry goes to another model. */
  exclude?: string[]
  /** Rewrites the request for a different model than the one that started the answer. */
  forOtherModel?: (body: GeminiRequest) => GeminiRequest
  /** Use only these models (local testing). */
  models?: string[]
  /** A plain-answer retry: no thinking on models that allow turning it off. */
  plain?: boolean
  /** Aborts the call when the farmer goes away. */
  signal?: AbortSignal
}

/** Earliest time a model of the pool is free again, when all are resting. */
function poolRetryAt(models: string[]) {
  const times = models.map((m) => restingUntil.get(m) ?? 0)
  return times.length ? Math.min(...times) : undefined
}

/** Calls the best Gemini model that still has free quota, moving down the pool on rate limits or outages. */
export async function callGemini(env: Env, method: Method, body: GeminiRequest, opts: GeminiCallOptions = {}): Promise<{ res: Response; model: string }> {
  if (Date.now() < refusedHereUntil) throw new GeminiRefusedHere()
  // Models another isolate already found out of quota today (shared store), so this one doesn't re-probe them.
  for (const [service, until] of Object.entries(await restingNow(env.DB))) {
    if (service.startsWith('gemini:') && until > (restingUntil.get(service.slice(7)) ?? 0)) restingUntil.set(service.slice(7), until)
  }
  const now = Date.now()
  const all = opts.models ?? modelPool(env)
  const pool = all.filter((m) => (restingUntil.get(m) ?? 0) <= now && !opts.exclude?.includes(m))
  const models = opts.preferModel && pool.includes(opts.preferModel) ? [opts.preferModel, ...pool.filter((m) => m !== opts.preferModel)] : pool
  let lastError = new UpstreamError('Gemini: no other model available', 503)
  let refusals = 0

  for (const model of models) {
    const request = opts.preferModel && model !== opts.preferModel && opts.forOtherModel ? opts.forOtherModel(body) : body
    const res = await post(env, model, method, request, opts)
    if (res.ok && res.body) return { res, model }

    const info = parseError(await res.text().catch(() => ''))
    console.warn(`Gemini ${model} ${res.status}: ${info.summary}`)
    // A 400 can be model-specific (a setting one model doesn't support): try the next model, which costs no
    // quota, rather than failing the whole question.
    if (res.status === 429) {
      // Daily quota: rest until the Pacific-midnight reset (shared with every isolate). Per-minute: a short pause.
      const until = info.daily ? nextPacificMidnight() : Date.now() + Math.min(info.retrySeconds ?? 30, 60) * 1000
      restingUntil.set(model, until)
      if (info.daily) await rest(env.DB, `gemini:${model}`, until)
    } else if (res.status === 404) {
      const until = Date.now() + 6 * 3600 * 1000 // retired or unavailable to this key
      restingUntil.set(model, until)
      await rest(env.DB, `gemini:${model}`, until)
    }
    if (info.refusedHere) refusals++
    lastError = new UpstreamError(`Gemini ${res.status}`, res.status)
    if (![400, 404, 429, 500, 503].includes(res.status)) break
  }
  // Every model refused this location (one refusal alone could be about that model, so all are tried first).
  if (refusals && refusals === models.length) {
    refusedHereUntil = Date.now() + REFUSED_PAUSE_MS
    throw new GeminiRefusedHere()
  }
  // Every model is resting: report when the first one is back, so the farmer gets a real time.
  const later = Date.now()
  if (all.every((m) => (restingUntil.get(m) ?? 0) > later)) throw new UpstreamError('Gemini: every model is resting', 429, poolRetryAt(all))
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
        if (p.functionResponse) return { text: toolResultText(p.functionResponse.name, p.functionResponse.response) }
        return { text: p.text ?? '' }
      })
      .filter((p) => p.text),
  }))
}

/** How a tool result reads as text, both for fallback models and for results the Worker looked up in advance. */
export const toolResultText = (name: string, result: unknown) => `[Result of ${name}: ${JSON.stringify(result)}]`

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

import { HELPLINES, SCHEMES, SCHEMES_CHECKED } from '../shared/schemes'
import { DEFAULT_AGRI_OFFICE, STATE_AGRI_INFO } from '../shared/stateSchemes'
import { findState } from '../shared/states'
import {
  MAX_HISTORY,
  MAX_MESSAGE_CHARS,
  isLang,
  type ChatEvent,
  type ChatIntent,
  type ChatMessage,
  type ChatRequest,
  type Lang,
  type PriceResult,
} from '../shared/types'
import { fold } from '../shared/text'
import { spendDailyBudget } from './budget'
import { callGemini, pauseModel, readGeminiStream, toolHistoryAsText, toolResultText, type GeminiChunk, type GeminiContent, type GeminiPart } from './gemini'
import { record, type MetricEvent } from './metrics'
import { readAnswer, writeAnswer } from './store'
import { detectIntents } from './intents'
import { createOutputFilter } from './outputFilter'
import { priceAnswer } from './priceAnswer'
import { mandiPricesTool } from './prices'
import { chatSystemPrompt } from './prompts'
import { BadRequest, UpstreamError, apiError, indiaNow } from './util'
import { inIndia, weatherTool } from './weather'

// Rounds of tool calls before the model must answer (e.g. prices for two crops, then weather). With the
// Worker looking data up in advance, most questions need no tool round at all.
const MAX_TOOL_ROUNDS = 2
// Indic scripts use ~3-4x the tokens of English, and thinking tokens share this budget.
const MAX_OUTPUT_TOKENS = 8192
// A weather lookup done in advance must never hold up the answer for long.
const PREFETCH_WEATHER_MS = 2500

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'get_mandi_prices',
        description:
          "Latest wholesale price at each mandi (APMC) for one crop, from the Government of India's Agmarknet, with the crop's MSP if it has one. Defaults to the farmer's district/state. Call once per crop.",
        parameters: {
          type: 'OBJECT',
          properties: {
            commodity: {
              type: 'STRING',
              description:
                'Crop name in English, e.g. Tomato, Onion, Paddy, Cotton, Groundnut, Dry Chillies, Green Chilli, Turmeric, Banana, Coconut, Arecanut, Maize, Cashewnut, Coffee, Horse gram, Jasmine',
            },
            state: { type: 'STRING', description: "Indian state in English. Omit to use the farmer's state." },
            district: { type: 'STRING', description: "District in English. Omit to use the farmer's district." },
          },
          required: ['commodity'],
        },
      },
      {
        name: 'get_weather_forecast',
        description: "Hourly forecast for the next 24 hours and daily forecast for 7 days (temperature, rain, wind, humidity) at the farmer's location.",
      },
      {
        name: 'get_scheme_info',
        description:
          "Details of central government farmer schemes (PM-KISAN, PMFBY crop insurance, Kisan Credit Card, Soil Health Card, e-NAM, PM-KUSUM, KVK), the farmer's state schemes and where to confirm them, and free helpline numbers.",
      },
    ],
  },
]

export interface ParsedChat extends ChatRequest {
  /** Older messages were dropped, so the model may be missing details the farmer gave earlier. */
  historyCut: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function parseRequest(body: unknown): ParsedChat {
  const req = body as Partial<ChatRequest>
  if (!req || !Array.isArray(req.messages) || !req.messages.length || !isLang(req.lang)) throw new BadRequest('invalid chat request')
  // Gemini needs alternating turns; a question re-sent after an error would otherwise give two user turns.
  const merged: ChatMessage[] = []
  for (const m of req.messages) {
    if (!m || typeof m.text !== 'string' || !m.text.trim()) continue
    const role = m.role === 'model' ? 'model' : 'user'
    const text = m.text.slice(0, MAX_MESSAGE_CHARS)
    const last = merged.at(-1)
    if (last?.role === role) last.text = `${last.text}\n\n${text}`.slice(-MAX_MESSAGE_CHARS)
    else merged.push({ role, text })
  }
  let messages = merged.slice(-MAX_HISTORY)
  while (messages[0]?.role === 'model') messages = messages.slice(1)
  if (messages.at(-1)?.role !== 'user') throw new BadRequest('last message must be from the user')

  const str = (v: unknown) => (typeof v === 'string' && v.length < 80 ? v : undefined)
  const crops = Array.isArray(req.crops) ? req.crops.filter((c): c is string => typeof c === 'string' && c.length < 60).slice(0, 30) : []
  // ~1 km is plenty for farm weather, and the farmer's exact position never needs to leave the phone.
  const coords =
    req.coords && inIndia(Number(req.coords.lat), Number(req.coords.lon)) ? { lat: round2(req.coords.lat), lon: round2(req.coords.lon) } : undefined
  const intent: ChatIntent | undefined =
    req.intent?.kind === 'price' && typeof req.intent.commodity === 'string' && req.intent.commodity.length < 60
      ? { kind: 'price', commodity: req.intent.commodity }
      : undefined
  return {
    messages,
    lang: req.lang,
    state: str(req.state),
    district: str(req.district),
    crops,
    coords,
    intent,
    historyCut: merged.length > messages.length,
  }
}

/** Scheme details in the farmer's language: the same wording the app's Schemes page shows. */
function schemeInfo(lang: Lang, stateId: string | undefined) {
  const state = stateId ? STATE_AGRI_INFO[stateId] : undefined
  return {
    lastChecked: SCHEMES_CHECKED,
    schemes: SCHEMES.map((s) => ({ ...s.text[lang], ...(lang === 'en' ? {} : { name_en: s.text.en.name }), website: s.url, phones: s.phones })),
    helplines: HELPLINES.map((h) => ({ phone: h.phone, for: h.label[lang] })),
    stateSchemes: {
      state: stateId ?? 'unknown',
      names: state?.schemes ?? [],
      whereToConfirm: state?.office ?? DEFAULT_AGRI_OFFICE,
      note: 'Never quote state scheme amounts or dates; tell the farmer to confirm at this office.',
    },
    note: 'Rules and amounts can change; tell the farmer to confirm at the agriculture office, bank or official website. Never pay agents.',
  }
}

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))])

/**
 * Key for the shared answer cache: same language, place, crops, quarter of the India day (the prompt has the
 * time, and advice like "spray this evening" ages) and question, ignoring case and spacing.
 */
export async function answerHash(req: Pick<ChatRequest, 'lang' | 'district' | 'crops'>, stateId: string | undefined, question: string, now = indiaNow()) {
  const slot = `${now.toISOString().slice(0, 10)}#${Math.floor(now.getUTCHours() / 6)}`
  const key = JSON.stringify([req.lang, stateId ?? '', req.district ?? '', [...(req.crops ?? [])].sort(), slot, fold(question)])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Short, stable id for a question, so a farmer's bug report can be matched in the 3-day logs without storing their text. */
function questionId(text: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

export async function handleChat(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = (await request.json().catch(() => null)) as (Partial<ChatRequest> & { model?: unknown }) | null
  const req = parseRequest(body)
  // Price buttons can be answered without the AI; everything else needs it.
  if (!env.GEMINI_API_KEY && !req.intent) return apiError('not_configured', 503)
  // Local testing only: compare models on the same question.
  const local = new URL(request.url).hostname === 'localhost'
  const onlyModels = local && typeof body?.model === 'string' ? [body.model] : undefined
  // Local testing only (the golden set): skip the shared answer cache, which would replay old answers.
  const noCache = local && (body as { noCache?: unknown } | null)?.noCache === true
  const state = findState(req.state)
  const farmer = { state: state?.id, district: req.district, crops: req.crops }
  const question = req.messages.at(-1)!.text
  const qid = questionId(question)

  const runTool = async (name: string, args: Record<string, unknown>): Promise<object> => {
    try {
      switch (name) {
        case 'get_mandi_prices':
          return await mandiPricesTool(env, args, farmer)
        case 'get_weather_forecast':
          return await weatherTool(env, { coords: req.coords, stateName: state?.id, stateCoords: state && { lat: state.lat, lon: state.lon } })
        case 'get_scheme_info':
          return schemeInfo(req.lang, state?.id)
        default:
          return { error: `Unknown tool ${name}` }
      }
    } catch (err) {
      console.error(`${name} failed`, err)
      return { error: 'This information service is not responding right now. Tell the farmer and suggest another way to find out.' }
    }
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const send = (event: ChatEvent) => writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
  let sentText = ''
  const filter = createOutputFilter(req.lang, (text) => {
    sentText += text
    return send({ type: 'text', text })
  })
  const started = Date.now()
  const metric = (outcome: string, extra: Partial<MetricEvent> = {}) =>
    record(env, { kind: 'chat', outcome, id: qid, lang: req.lang, state: state?.id, ms: Date.now() - started, ...extra })

  const run = async () => {
    let calls = 0
    const toolsUsed = new Set<string>()
    try {
      // 1. Look up what the question obviously needs before the first AI call (saves a whole tool round).
      const intents = detectIntents(question)
      const priceCrop = req.intent?.kind === 'price' ? req.intent.commodity : intents.priceCrop?.id
      if (priceCrop) await send({ type: 'tool', name: 'get_mandi_prices' })
      if (intents.weather) await send({ type: 'tool', name: 'get_weather_forecast' })
      const [prices, weather] = await Promise.all([
        priceCrop ? runTool('get_mandi_prices', { commodity: priceCrop }) : undefined,
        intents.weather ? withTimeout(runTool('get_weather_forecast', {}), PREFETCH_WEATHER_MS) : undefined,
      ])
      if (prices) toolsUsed.add('get_mandi_prices')
      if (weather) toolsUsed.add('get_weather_forecast')

      // 2. A price button answered straight from Agmarknet: no AI call, works even when the AI is resting.
      if (req.intent?.kind === 'price' && prices && !('error' in prices)) {
        const text = priceAnswer(prices as PriceResult, req.lang, {
          today: indiaNow().toISOString().slice(0, 10),
          requestedDistrict: req.district,
        })
        if (text) {
          await send({ type: 'meta', model: 'template', id: qid })
          await send({ type: 'text', text })
          await send({ type: 'done' })
          metric('template', { model: 'template', tools: 'get_mandi_prices', detail: req.intent.commodity })
          return
        }
      }

      // 3. The same first question from a farmer with the same profile, earlier today: replay that answer.
      // Not for live prices or weather, which change during the day.
      const answerKey = !noCache && req.messages.length === 1 && !priceCrop && !intents.weather ? await answerHash(req, state?.id, question) : undefined
      const saved = answerKey ? await readAnswer(env.DB, answerKey) : undefined
      if (saved) {
        await send({ type: 'meta', model: `cache:${saved.model ?? ''}`, id: qid })
        await send({ type: 'text', text: saved.text })
        await send({ type: 'done' })
        metric('cached', { model: saved.model ?? '' })
        return
      }

      if (!env.GEMINI_API_KEY) {
        await send({ type: 'error', code: 'not_configured' })
        return
      }
      // 4. Today's free-AI share for this phone and network.
      const budget = await spendDailyBudget(env, 'chat', request)
      if (!budget.ok) {
        await send({ type: 'error', code: 'daily_limit', ...(budget.retryAt ? { retryAt: new Date(budget.retryAt).toISOString() } : {}) })
        metric('daily_limit', { detail: budget.scope })
        return
      }

      // 5. The AI answers, with the looked-up data attached to the question as tool results.
      const lookedUp: GeminiPart[] = [
        ...(prices ? [{ text: toolResultText('get_mandi_prices', prices) }] : []),
        ...(weather ? [{ text: toolResultText('get_weather_forecast', weather) }] : []),
      ]
      let contents: GeminiContent[] = req.messages.map((m, i) => ({
        role: m.role,
        parts: [{ text: m.text }, ...(i === req.messages.length - 1 ? lookedUp : [])],
      }))
      const schemes = intents.schemes ? schemeInfo(req.lang, state?.id) : undefined
      const systemInstruction = { parts: [{ text: chatSystemPrompt(req.lang, farmer, { historyCut: req.historyCut, schemes }) }] }
      const generationConfig = { temperature: 0.5, maxOutputTokens: MAX_OUTPUT_TOKENS }

      let model: string | undefined
      let finishReason: string | undefined
      let answered = false
      let toolRounds = 0
      let forceAnswer = false
      let streamRetries = 0
      const quiet: string[] = []

      while (true) {
        if (request.signal.aborted) return
        // After the last tool round the model must answer with what it has. Gemini doesn't always honour
        // functionCallingConfig NONE, so send no tools at all, with earlier results as plain text.
        const last = toolRounds >= MAX_TOOL_ROUNDS || forceAnswer
        calls++
        const call = await callGemini(
          env,
          'streamGenerateContent',
          last
            ? { contents: toolHistoryAsText(contents), systemInstruction, generationConfig }
            : { contents, systemInstruction, tools: TOOLS, generationConfig },
          {
            // A retry after a quiet round goes to a different model, plainly.
            preferModel: forceAnswer ? undefined : model,
            exclude: quiet,
            models: onlyModels,
            plain: forceAnswer,
            signal: request.signal,
            forOtherModel: (b) => ({ ...b, contents: toolHistoryAsText(b.contents) }),
          },
        )
        if (model && call.model !== model) contents = toolHistoryAsText(contents)
        model = call.model
        await send({ type: 'meta', model, id: qid })

        let roundText = false
        finishReason = undefined
        const modelParts: GeminiPart[] = []
        const toolCalls: NonNullable<GeminiPart['functionCall']>[] = []
        let chunks = 0
        let lastChunk = ''
        let streamError: GeminiChunk['error']
        for await (const chunk of readGeminiStream(call.res.body!)) {
          chunks++
          lastChunk = JSON.stringify(chunk).slice(0, 300)
          if (chunk.error) {
            streamError = chunk.error
            break
          }
          const candidate = chunk.candidates?.[0]
          if (chunk.promptFeedback?.blockReason || candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
            await filter.flush()
            await send({ type: 'error', code: 'blocked' })
            metric('blocked', { model, finish: chunk.promptFeedback?.blockReason ?? candidate?.finishReason, calls })
            return
          }
          if (candidate?.finishReason) finishReason = candidate.finishReason
          for (const part of candidate?.content?.parts ?? []) {
            // Keep parts verbatim (incl. thought signatures) — Gemini needs them back for tool calls.
            modelParts.push(part)
            if (part.functionCall) toolCalls.push(part.functionCall)
            else if (part.text && !part.thought) {
              roundText = true
              await filter.push(part.text)
            }
          }
        }
        // An overloaded model can fail in the middle of an answer that started fine. Once per question, start
        // the answer again on another model; the app drops what it received so far.
        if (streamError) {
          console.warn(`chat ${qid}: ${model} failed mid-answer after ${chunks} chunks: ${streamError.status ?? streamError.code} ${streamError.message ?? ''}`)
          pauseModel(model)
          if (streamRetries < 1) {
            streamRetries++
            filter.discard()
            if (sentText) {
              sentText = ''
              await send({ type: 'reset' })
            }
            quiet.push(model)
            continue
          }
        }
        await filter.flush()

        if (toolCalls.length && !last) {
          // A preface like "Let me check prices…" is not the answer: the round after the tools must answer.
          toolRounds++
          contents.push({ role: 'model', parts: modelParts })
          for (const name of new Set(toolCalls.map((c) => c.name))) {
            toolsUsed.add(name)
            await send({ type: 'tool', name })
          }
          const results = await Promise.all(toolCalls.map((c) => runTool(c.name, c.args ?? {})))
          // Only the crop is logged from tool arguments, never anything the farmer typed.
          toolCalls.forEach((c, i) =>
            console.log(`chat ${qid} tool ${c.name}${c.args?.commodity ? ` ${String(c.args.commodity)}` : ''} -> ${'error' in results[i] ? 'error' : 'ok'}`),
          )
          contents.push({
            role: 'user',
            parts: toolCalls.map((c, i) => ({ functionResponse: { ...(c.id ? { id: c.id } : {}), name: c.name, response: results[i] } })),
          })
          continue
        }
        if (roundText) {
          answered = true
          // MAX_TOKENS, or a stream that ended without saying why: the farmer sees "answer cut short".
          if (finishReason === 'MAX_TOKENS' || !finishReason) {
            console.warn(`chat ${qid} answer cut short by ${model} (${finishReason ?? 'stream ended early'}; ${chunks} chunks; last: ${lastChunk})`)
            await send({ type: 'cut' })
          }
          break
        }
        // No text: some models go quiet after tool results or after long thinking. Ask once more, plainly,
        // on another model.
        if (forceAnswer) break
        console.warn(`chat ${qid}: ${model} gave no text (${finishReason}); asking another model`)
        quiet.push(model)
        forceAnswer = true
      }

      const summary = { model, finish: finishReason, calls, toolRounds, tools: [...toolsUsed].join(',') }
      if (!answered) {
        await send({ type: 'error', code: 'upstream' })
        metric('no_answer', summary)
        return
      }
      await send({ type: 'done' })
      metric('answered', summary)
      // Keep a complete, tool-free answer for the next farmer who asks exactly this today.
      if (answerKey && model && finishReason === 'STOP' && toolRounds === 0 && sentText.trim()) {
        ctx.waitUntil(writeAnswer(env.DB, answerKey, sentText, model))
      }
    } catch (err) {
      await filter.flush().catch(() => {})
      if (request.signal.aborted) {
        metric('aborted', { calls })
        return
      }
      console.error(`chat ${qid} failed`, err)
      const busy = err instanceof UpstreamError && err.status === 429
      const retryAt = busy && err.retryAt ? new Date(err.retryAt).toISOString() : undefined
      await send({ type: 'error', code: busy ? 'busy' : 'upstream', ...(retryAt ? { retryAt } : {}) }).catch(() => {})
      metric(busy ? 'busy' : 'upstream', { calls, detail: err instanceof Error ? err.message.slice(0, 120) : undefined })
    } finally {
      await writer.close().catch(() => {})
    }
  }
  ctx.waitUntil(run())

  return new Response(readable, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-content-type-options': 'nosniff' },
  })
}

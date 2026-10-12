import { HELPLINES, SCHEMES, SCHEMES_CHECKED } from '../shared/schemes'
import { findState } from '../shared/states'
import { isLang, type ChatEvent, type ChatRequest } from '../shared/types'
import { callGemini, readGeminiStream, toolHistoryAsText, type GeminiContent, type GeminiPart } from './gemini'
import { mandiPricesTool } from './prices'
import { chatSystemPrompt } from './prompts'
import { BadRequest, UpstreamError, apiError } from './util'
import { weatherTool } from './weather'

const MAX_HISTORY = 12
const MAX_TEXT = 4000
// Rounds of tool calls before the model must answer (e.g. prices for two crops, then weather).
const MAX_TOOL_ROUNDS = 3
// Indic scripts use ~3-4x the tokens of English, and thinking tokens share this budget.
const MAX_OUTPUT_TOKENS = 4096

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
              description: 'Crop name in English, e.g. Tomato, Onion, Paddy, Cotton, Groundnut, Dry Chillies, Turmeric, Banana, Coconut, Arecanut, Maize',
            },
            state: { type: 'STRING', description: "Indian state in English. Omit to use the farmer's state." },
            district: { type: 'STRING', description: "District in English. Omit to use the farmer's district." },
          },
          required: ['commodity'],
        },
      },
      {
        name: 'get_weather_forecast',
        description:
          "Hourly forecast for the next 24 hours and daily forecast for 7 days (temperature, rain, wind, humidity) at the farmer's location.",
      },
      {
        name: 'get_scheme_info',
        description:
          'Verified details of central government farmer schemes (PM-KISAN, PMFBY crop insurance, Kisan Credit Card, Soil Health Card, e-NAM, PM-KUSUM, KVK) and free helpline numbers.',
      },
    ],
  },
]

function parseRequest(body: unknown): ChatRequest {
  const req = body as Partial<ChatRequest>
  if (!req || !Array.isArray(req.messages) || !req.messages.length || !isLang(req.lang)) throw new BadRequest('invalid chat request')
  const messages = req.messages
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role === 'model' ? ('model' as const) : ('user' as const), text: m.text.slice(0, MAX_TEXT) }))
  if (messages.at(-1)?.role !== 'user') throw new BadRequest('last message must be from the user')
  const str = (v: unknown) => (typeof v === 'string' && v.length < 80 ? v : undefined)
  const crops = Array.isArray(req.crops) ? req.crops.filter((c): c is string => typeof c === 'string' && c.length < 60).slice(0, 30) : []
  const coords =
    req.coords && Number.isFinite(req.coords.lat) && Number.isFinite(req.coords.lon) ? { lat: req.coords.lat, lon: req.coords.lon } : undefined
  return { messages, lang: req.lang, state: str(req.state), district: str(req.district), crops, coords }
}

function schemeInfo() {
  return {
    lastChecked: SCHEMES_CHECKED,
    schemes: SCHEMES.map((s) => ({ ...s.text.en, website: s.url, phones: s.phones })),
    helplines: HELPLINES.map((h) => ({ phone: h.phone, for: h.label.en })),
    note: 'Rules and amounts can change; tell the farmer to confirm at the agriculture office, bank or official website. Never pay agents.',
  }
}

export async function handleChat(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.GEMINI_API_KEY) return apiError('not_configured', 503)
  const body = (await request.json().catch(() => null)) as (Partial<ChatRequest> & { model?: unknown }) | null
  const req = parseRequest(body)
  // Local testing only: compare models on the same question.
  const onlyModels = new URL(request.url).hostname === 'localhost' && typeof body?.model === 'string' ? [body.model] : undefined
  const state = findState(req.state)

  let contents: GeminiContent[] = req.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }))
  const systemInstruction = { parts: [{ text: chatSystemPrompt(req.lang, { state: state?.id, district: req.district, crops: req.crops }) }] }

  const runTool = async (call: NonNullable<GeminiPart['functionCall']>): Promise<Record<string, unknown>> => {
    try {
      switch (call.name) {
        case 'get_mandi_prices':
          return await mandiPricesTool(env, call.args ?? {}, req)
        case 'get_weather_forecast':
          return await weatherTool(env, { coords: req.coords, stateName: state?.id, stateCoords: state && { lat: state.lat, lon: state.lon } })
        case 'get_scheme_info':
          return schemeInfo()
        default:
          return { error: `Unknown tool ${call.name}` }
      }
    } catch (err) {
      console.error(`${call.name} failed`, err)
      return { error: 'This information service is not responding right now. Tell the farmer and suggest another way to find out.' }
    }
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const send = (event: ChatEvent) => writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))

  const run = async () => {
    try {
      let model: string | undefined
      let answered = false
      let finishReason: string | undefined
      const generationConfig = { temperature: 0.4, maxOutputTokens: MAX_OUTPUT_TOKENS }
      let forceAnswer = false
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        // After the last tool round the model must answer with what it has. Gemini doesn't always honour
        // functionCallingConfig NONE, so send no tools at all, with earlier results as plain text.
        const last = round === MAX_TOOL_ROUNDS || forceAnswer
        let roundText = false
        const call = await callGemini(
          env,
          'streamGenerateContent',
          last
            ? { contents: toolHistoryAsText(contents), systemInstruction, generationConfig }
            : { contents, systemInstruction, tools: TOOLS, generationConfig },
          { preferModel: model, models: onlyModels, forOtherModel: (b) => ({ ...b, contents: toolHistoryAsText(b.contents) }) },
        )
        if (model && call.model !== model) contents = toolHistoryAsText(contents)
        model = call.model
        const res = call.res

        const modelParts: GeminiPart[] = []
        const calls: NonNullable<GeminiPart['functionCall']>[] = []
        for await (const chunk of readGeminiStream(res.body!)) {
          if (chunk.promptFeedback?.blockReason) {
            await send({ type: 'error', code: 'blocked' })
            return
          }
          const candidate = chunk.candidates?.[0]
          if (candidate?.finishReason) finishReason = candidate.finishReason
          for (const part of candidate?.content?.parts ?? []) {
            // Keep parts verbatim (incl. thought signatures) — Gemini needs them back for tool calls.
            modelParts.push(part)
            if (part.functionCall) calls.push(part.functionCall)
            else if (part.text && !part.thought) {
              answered = roundText = true
              await send({ type: 'text', text: part.text })
            }
          }
          if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
            await send({ type: 'error', code: 'blocked' })
            return
          }
          if (candidate?.finishReason === 'MAX_TOKENS') {
            console.warn('chat answer hit MAX_TOKENS')
            await send({ type: 'text', text: '…' })
          }
        }
        if (last) break
        if (!calls.length) {
          // Some models go quiet after reading tool results; ask once more for a plain answer.
          if (round > 0 && !roundText) {
            console.warn(`${model} gave no text after tool results; asking again without tools`)
            forceAnswer = true
            continue
          }
          break
        }

        contents.push({ role: 'model', parts: modelParts })
        for (const name of new Set(calls.map((c) => c.name))) await send({ type: 'tool', name })
        const results = await Promise.all(calls.map(runTool))
        calls.forEach((c, i) => console.log(`tool ${c.name} ${JSON.stringify(c.args ?? {})} -> ${'error' in results[i] ? `error: ${results[i].error}` : 'ok'}`))
        contents.push({
          role: 'user',
          parts: calls.map((call, i) => ({
            functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response: results[i] },
          })),
        })
      }
      console.log(`chat answered by ${model} (${finishReason})`)
      if (!answered) {
        console.warn(`chat produced no answer (model ${model})`)
        await send({ type: 'error', code: 'upstream' })
        return
      }
      await send({ type: 'done' })
    } catch (err) {
      console.error('chat failed', err)
      const busy = err instanceof UpstreamError && err.status === 429
      await send({ type: 'error', code: busy ? 'busy' : 'upstream' }).catch(() => {})
    } finally {
      await writer.close().catch(() => {})
    }
  }
  ctx.waitUntil(run())

  return new Response(readable, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform' },
  })
}

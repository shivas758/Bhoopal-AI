import { isLang, type DiagnoseRequest, type DiagnoseResult } from '../shared/types'
import { callGemini, type GeminiChunk } from './gemini'
import { DIAGNOSE_SCHEMA, diagnoseSystemPrompt } from './prompts'
import { BadRequest, UpstreamError, apiError, json } from './util'

const MAX_IMAGE_BASE64 = 3_000_000 // ~2.2 MB; the app compresses photos to ~200 KB first
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

const text = (v: unknown, max = 600) => (typeof v === 'string' ? v.slice(0, max) : '')

/** Never trust model JSON blindly: coerce to the exact shape the UI expects. */
function sanitize(raw: Partial<DiagnoseResult>): DiagnoseResult {
  const problems = Array.isArray(raw.possible_problems) ? raw.possible_problems.slice(0, 3) : []
  return {
    is_plant_image: raw.is_plant_image !== false,
    image_quality: raw.image_quality === 'poor' ? 'poor' : 'good',
    crop: text(raw.crop, 80),
    looks_healthy: raw.looks_healthy === true,
    summary: text(raw.summary, 800),
    retake_tips: text(raw.retake_tips),
    possible_problems: problems.map((p) => ({
      name: text(p?.name, 120),
      type: ['disease', 'pest', 'nutrient', 'water', 'other'].includes(p?.type) ? p.type : 'other',
      likelihood: p?.likelihood === 'high' || p?.likelihood === 'medium' ? p.likelihood : 'low',
      signs: text(p?.signs),
      safe_steps: Array.isArray(p?.safe_steps) ? p.safe_steps.slice(0, 5).map((s) => text(s, 300)).filter(Boolean) : [],
      expert_options: text(p?.expert_options),
    })),
  }
}

export async function handleDiagnose(request: Request, env: Env): Promise<Response> {
  if (!env.GEMINI_API_KEY) return apiError('not_configured', 503)
  const req = (await request.json().catch(() => null)) as Partial<DiagnoseRequest> | null
  if (!req || typeof req.image !== 'string' || !isLang(req.lang) || !MIME_TYPES.has(req.mimeType ?? '')) {
    throw new BadRequest('invalid diagnose request')
  }
  if (req.image.length > MAX_IMAGE_BASE64) throw new BadRequest('image too large')

  const context = [
    req.crop ? `Crop (according to the farmer): ${text(req.crop, 80)}` : 'The farmer did not name the crop.',
    req.note ? `Farmer's note: ${text(req.note, 400)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const { res } = await callGemini(env, 'generateContent', {
    systemInstruction: { parts: [{ text: diagnoseSystemPrompt(req.lang) }] },
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: req.mimeType!, data: req.image } }, { text: context }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: DIAGNOSE_SCHEMA,
    },
  })
  const body = (await res.json()) as GeminiChunk
  if (body.promptFeedback?.blockReason) return apiError('blocked', 422)
  const output = body.candidates?.[0]?.content?.parts?.find((p) => p.text && !p.thought)?.text
  if (!output) throw new UpstreamError('Gemini returned no diagnosis')
  try {
    return json(sanitize(JSON.parse(output)))
  } catch {
    throw new UpstreamError('Gemini returned invalid JSON')
  }
}

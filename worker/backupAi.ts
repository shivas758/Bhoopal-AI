import type { ChatMessage } from '../shared/types'
import { spend } from './store'

// When every Gemini model has used its free daily quota, chat falls back to Workers AI (free: 10,000
// neurons a day, reset at 00:00 UTC). Gemma 4 writes the Indian languages best of the free-plan models
// (Oct 2026); with thinking off a backup answer takes ~7 s and ~30-40 neurons.
export const BACKUP_MODEL = '@cf/google/gemma-4-26b-a4b-it'
// Stops well before the neuron allowance runs out, so a backup answer is never cut off by Cloudflare.
const BACKUP_AI_DAILY = 220
const MAX_TOKENS = 1500

/** Counts one backup answer against today's allowance (UTC day, like the neurons). Without the store, it allows. */
export async function spendBackupBudget(env: Env): Promise<boolean> {
  const counts = await spend(env.DB, new Date().toISOString().slice(0, 10), ['backup:all'])
  return !counts || counts[0] <= BACKUP_AI_DAILY
}

interface BackupChunk {
  response?: string
  choices?: { delta?: { content?: string }; finish_reason?: string | null }[]
}

/**
 * Streams a backup answer: text pieces, then (as the last value) whether the output limit cut it short.
 * There are no tools: everything the model may use is already in `system` and the messages.
 */
export async function* streamBackupAnswer(env: Env, system: string, messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string, { cut: boolean }> {
  const input: Ai_Cf_Google_Gemma_4_26B_A4B_It_Input = {
    messages: [
      { role: 'system', content: system },
      ...messages.map((m) => ({ role: m.role === 'model' ? ('assistant' as const) : ('user' as const), content: m.text })),
    ],
    stream: true,
    max_tokens: MAX_TOKENS,
    temperature: 0.5,
    // Gemma 4 "thinks" by default: 5x the time and neurons, and the thinking can use up the whole budget.
    chat_template_kwargs: { enable_thinking: false },
  }
  const stream = (await env.AI.run(BACKUP_MODEL, input)) as unknown as ReadableStream<Uint8Array>

  const reader = stream.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let finish: string | null | undefined
  try {
    while (!signal?.aborted) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trim()
        buffer = buffer.slice(end + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') return { cut: finish === 'length' }
        let chunk: BackupChunk
        try {
          chunk = JSON.parse(data) as BackupChunk
        } catch {
          continue
        }
        // Workers AI streams either its own { response } chunks or OpenAI-style choices[].delta.
        const text = chunk.response ?? chunk.choices?.[0]?.delta?.content
        finish = chunk.choices?.[0]?.finish_reason ?? finish
        if (text) yield text
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  return { cut: finish === 'length' }
}

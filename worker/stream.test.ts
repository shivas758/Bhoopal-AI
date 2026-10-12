import { afterEach, expect, test, vi } from 'vitest'
import type { ChatEvent } from '../shared/types'
import { handleChat } from './chat'

const sse = (...events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join('')
const text = (t: string, finishReason?: string) => ({ candidates: [{ content: { parts: [{ text: t }] }, ...(finishReason ? { finishReason } : {}) }] })

afterEach(() => vi.unstubAllGlobals())

async function chat(geminiStreams: Record<string, string>) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const model = Object.keys(geminiStreams).find((m) => url.includes(`/${m}:`))
      if (!model) return new Response('unexpected', { status: 500 })
      calls.push(model)
      return new Response(geminiStreams[model], { headers: { 'content-type': 'text/event-stream' } })
    }),
  )
  const env = { GEMINI_API_KEY: 'test', GEMINI_MODELS: Object.keys(geminiStreams).join(','), USER_AGENT: 'test' } as unknown as Env
  const waits: Promise<unknown>[] = []
  const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} } as unknown as ExecutionContext
  const request = new Request('https://bhoopal.test/api/chat', {
    method: 'POST',
    body: JSON.stringify({ lang: 'en', messages: [{ role: 'user', text: 'How do I make compost at home?' }] }),
  })
  const res = await handleChat(request, env, ctx)
  const body = await res.text()
  await Promise.all(waits)
  const events = body
    .split('\n\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => JSON.parse(l.slice(5)) as ChatEvent)
  return { calls, events }
}

test('a model failing mid-answer is replaced, and the app is told to drop the partial text', async () => {
  const { calls, events } = await chat({
    'model-a': sse(text('Great question! '), text('Mix dry leaves. Then'), { error: { code: 503, status: 'UNAVAILABLE' } }),
    'model-b': sse(text('Great question! Mix dry leaves and dung, keep it moist, turn it weekly. 🌱', 'STOP')),
  })
  expect(calls).toEqual(['model-a', 'model-b'])
  const types = events.map((e) => e.type)
  expect(types).toContain('reset')
  expect(types.at(-1)).toBe('done')
  expect(types).not.toContain('cut')
  const afterReset = events.slice(types.lastIndexOf('reset'))
  expect(afterReset.map((e) => (e.type === 'text' ? e.text : '')).join('')).toBe('Great question! Mix dry leaves and dung, keep it moist, turn it weekly. 🌱')
})

test('a stream that ends without a finish reason is marked as cut short', async () => {
  // A fresh model name: the first test paused model-a for a minute (module-level state, as in a real isolate).
  const { events } = await chat({ 'model-c': sse(text('Mix dry leaves and dung. Keep it')) })
  expect(events.map((e) => e.type).filter((t) => t !== 'text')).toEqual(['meta', 'cut', 'done'])
})

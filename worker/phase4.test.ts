import { describe, expect, test } from 'vitest'
import { dayLabel } from '../shared/advice'
import { LANGS } from '../shared/types'
import { WEATHER_TEXT, weatherT } from '../shared/weatherText'
import { streamBackupAnswer } from './backupAi'
import { chatSystemPrompt } from './prompts'
import { validEndpoint } from './push'

describe('push endpoints', () => {
  test('only real push services, over https', () => {
    expect(validEndpoint('https://fcm.googleapis.com/fcm/send/abc:def')).toBe(true)
    expect(validEndpoint('https://web.push.apple.com/QGuQyavXutnMei')).toBe(true)
    expect(validEndpoint('https://updates.push.services.mozilla.com/wpush/v2/gAAA')).toBe(true)
    expect(validEndpoint('https://wns2-bl2p.notify.windows.com/w/?token=x')).toBe(true)
    expect(validEndpoint('http://fcm.googleapis.com/fcm/send/x')).toBe(false)
    expect(validEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false)
    expect(validEndpoint('https://169.254.169.254/latest')).toBe(false)
    expect(validEndpoint(42)).toBe(false)
  })
})

/** A fake Workers AI binding that streams these SSE lines. */
const fakeAi = (lines: string[]) =>
  ({
    AI: {
      run: async () =>
        new ReadableStream<Uint8Array>({
          start(c) {
            for (const l of lines) c.enqueue(new TextEncoder().encode(`${l}\n`))
            c.close()
          },
        }),
    },
  }) as unknown as Env

async function collect(env: Env) {
  const gen = streamBackupAnswer(env, 'system', [{ role: 'user', text: 'hi' }])
  let text = ''
  let step = await gen.next()
  while (!step.done) {
    text += step.value
    step = await gen.next()
  }
  return { text, cut: step.value.cut }
}

describe('backup model stream', () => {
  test('reads OpenAI-style deltas and notices the output limit', async () => {
    const env = fakeAi([
      'data: {"choices":[{"delta":{"content":"నమస్కారం"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"! 🌱"},"finish_reason":"length"}]}',
      'data: [DONE]',
    ])
    expect(await collect(env)).toEqual({ text: 'నమస్కారం! 🌱', cut: true })
  })

  test("reads Workers AI's own { response } chunks", async () => {
    expect(await collect(fakeAi(['data: {"response":"Hello"}', 'data: {"response":" farmer"}', 'data: [DONE]']))).toEqual({ text: 'Hello farmer', cut: false })
  })
})

describe('backup prompt', () => {
  const backup = chatSystemPrompt('te', { state: 'Telangana' }, { backup: true })
  test('has no tools and forbids medicine names and doses', () => {
    expect(backup).not.toMatch(/get_mandi_prices/)
    expect(backup).toMatch(/never name a chemical pesticide/)
    expect(chatSystemPrompt('te', { state: 'Telangana' })).toMatch(/get_mandi_prices/)
  })
})

describe('shared weather words', () => {
  test('weekday of an India date, whatever the time zone', () => {
    const t = weatherT('hi')
    // 2026-10-16 is a Friday.
    expect(dayLabel('2026-10-16', 'hi', 'hi-IN', t)).toBe('शुक्रवार को')
    expect(dayLabel('2026-10-16', 'en', 'en-IN', weatherT('en'))).toBe('on Friday')
  })

  test('every language has every key', () => {
    const english = Object.keys(WEATHER_TEXT.en).sort()
    for (const lang of LANGS) expect(Object.keys(WEATHER_TEXT[lang]).sort()).toEqual(english)
  })
})

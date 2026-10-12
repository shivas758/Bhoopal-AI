// Uses the phone's built-in speech engines: free, no server cost, but quality depends on the device.

interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export const canListen = () => Boolean(recognitionCtor())
export const canSpeak = () => 'speechSynthesis' in window

/** 'network': Chrome's recogniser runs on Google's servers, so a weak 2G signal fails it. 'nomic': no microphone. */
export type ListenError = 'unsupported' | 'denied' | 'network' | 'nomic' | 'failed'

/** Starts speech-to-text. Returns a function that stops listening. */
export function listen(
  bcp47: string,
  handlers: { onText: (text: string, isFinal: boolean) => void; onEnd: () => void; onError: (e: ListenError) => void },
): () => void {
  const Ctor = recognitionCtor()
  if (!Ctor) {
    handlers.onError('unsupported')
    handlers.onEnd()
    return () => {}
  }
  const rec = new Ctor()
  rec.lang = bcp47
  rec.interimResults = true
  rec.continuous = false
  rec.maxAlternatives = 1
  rec.onresult = (e) => {
    let text = ''
    let isFinal = false
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript
      isFinal = e.results[i].isFinal
    }
    handlers.onText(text, isFinal)
  }
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return
    handlers.onError(
      e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'denied'
        : e.error === 'network'
          ? 'network'
          : e.error === 'audio-capture'
            ? 'nomic'
            : 'failed',
    )
  }
  rec.onend = handlers.onEnd
  try {
    rec.start()
  } catch {
    handlers.onError('failed')
    handlers.onEnd()
  }
  return () => rec.stop()
}

function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  const voices = speechSynthesis.getVoices()
  if (voices.length) return Promise.resolve(voices)
  // Chrome loads voices asynchronously.
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices())
    speechSynthesis.addEventListener('voiceschanged', done, { once: true })
    setTimeout(done, 1200)
  })
}

/**
 * Strips markdown and emojis (phones read "🌱" aloud as "seedling") and splits into sentence-sized chunks
 * (Chrome cuts off long utterances).
 */
export function chunks(text: string): string[] {
  const plain = text
    .replace(/[*_#`>|]/g, '')
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  // A sentence ends at . ! ? or । followed by a space or the end, so "2.5 ml" and "6.30" stay whole.
  const parts = plain.match(/.+?(?:[.!?।](?=\s|$)|$)/g) ?? [plain]
  const out: string[] = []
  for (const p of parts) {
    const s = p.trim()
    if (!s) continue
    if (out.length && out[out.length - 1].length + s.length < 180) out[out.length - 1] += ' ' + s
    else out.push(s)
  }
  return out
}

const SCRIPTS: [RegExp, string][] = [
  [/[ऀ-ॿ]/g, 'hi-IN'],
  [/[ఀ-౿]/g, 'te-IN'],
  [/[஀-௿]/g, 'ta-IN'],
  [/[ಀ-೿]/g, 'kn-IN'],
  [/[ഀ-ൿ]/g, 'ml-IN'],
  [/[a-z]/gi, 'en-IN'],
]

/**
 * The language an answer is actually written in (by its most used script), so it is read with the right
 * voice even when the farmer asked in a different language from the app's.
 */
export function answerLanguage(text: string, fallback: string): string {
  let best = fallback
  let bestCount = 0
  for (const [re, bcp47] of SCRIPTS) {
    // Latin letters appear in Indic answers too (MSP, KVK, eNAM), so English needs a clear majority.
    const count = (text.match(re)?.length ?? 0) * (bcp47 === 'en-IN' ? 0.3 : 1)
    if (count > bestCount) {
      best = bcp47
      bestCount = count
    }
  }
  return best
}

/**
 * Reads text aloud. Resolves false if the phone has no voice for this language,
 * so the UI can explain how to install one.
 */
export async function speak(text: string, bcp47: string, onDone?: () => void): Promise<boolean> {
  if (!canSpeak()) return false
  speechSynthesis.cancel()
  const voices = await voicesReady()
  const base = bcp47.slice(0, 2)
  const voice = voices.find((v) => v.lang.replace('_', '-') === bcp47) ?? voices.find((v) => v.lang.toLowerCase().startsWith(base))
  // If the browser reports voices but none for this language, an English voice would garble the text.
  if (voices.length && !voice) return false

  const parts = chunks(text)
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part)
    u.lang = bcp47
    if (voice) u.voice = voice
    u.rate = 0.95
    if (i === parts.length - 1 && onDone) {
      u.onend = onDone
      u.onerror = onDone
    }
    speechSynthesis.speak(u)
  })
  return true
}

export function stopSpeaking() {
  if (canSpeak()) speechSynthesis.cancel()
}

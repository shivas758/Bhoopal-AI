import { Loader2, Mic, MicOff, Send, Square, Trash2, Volume2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { ChatMessage } from '../../shared/types'
import { Notice, PageHeader } from '../components/ui'
import type { MessageKey } from '../i18n'
import { ApiError, errorMessageKey, streamChat } from '../lib/api'
import { useOnline } from '../lib/hooks'
import { Markdown } from '../lib/markdown'
import { useRoute } from '../lib/router'
import { canListen, listen, speak, stopSpeaking } from '../lib/speech'
import { readJson, writeJson } from '../lib/storage'
import { useSettings, useT } from '../settings'

const MAX_SAVED = 40
const EXAMPLES: MessageKey[] = ['chat.example1', 'chat.example2', 'chat.example3', 'chat.example4']

type Status = 'idle' | 'thinking' | 'prices' | 'writing'

export function Chat() {
  const { t, lang, bcp47 } = useT()
  const { settings } = useSettings()
  const online = useOnline()
  const { params } = useRoute()

  const [messages, setMessages] = useState<ChatMessage[]>(() => readJson<ChatMessage[]>('chat', []))
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<MessageKey | null>(null)
  const [listening, setListening] = useState(false)
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const stopListeningRef = useRef<(() => void) | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const handledParams = useRef(false)

  useEffect(() => {
    writeJson('chat', messages.slice(-MAX_SAVED))
  }, [messages])
  useEffect(() => {
    // Block body on purpose: newer browsers return a Promise from smooth scrollIntoView.
    void bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, status])
  useEffect(
    () => () => {
      abortRef.current?.abort()
      stopListeningRef.current?.()
      stopSpeaking()
    },
    [],
  )

  const readAloud = useCallback(
    async (index: number, text: string) => {
      if (speakingIndex === index) {
        stopSpeaking()
        setSpeakingIndex(null)
        return
      }
      setSpeakingIndex(index)
      const ok = await speak(text, bcp47, () => setSpeakingIndex((i) => (i === index ? null : i)))
      if (!ok) {
        setSpeakingIndex(null)
        setError('chat.noVoice')
      }
    },
    [bcp47, speakingIndex],
  )

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text || status !== 'idle') return
      if (!navigator.onLine) {
        setError('chat.offline')
        return
      }
      stopSpeaking()
      setError(null)
      setInput('')
      const history: ChatMessage[] = [...messages, { role: 'user', text }]
      setMessages([...history, { role: 'model', text: '' }])
      setStatus('thinking')

      const controller = new AbortController()
      abortRef.current = controller
      let answer = ''
      try {
        for await (const event of streamChat(
          { messages: history, lang, state: settings.state, district: settings.district, crops: settings.crops, coords: settings.coords },
          controller.signal,
        )) {
          if (controller.signal.aborted) break
          if (event.type === 'text') {
            answer += event.text
            setStatus('writing')
            setMessages([...history, { role: 'model', text: answer }])
          } else if (event.type === 'tool') {
            setStatus('prices')
          } else if (event.type === 'error') {
            throw new ApiError(event.code)
          }
        }
        // Aborted by "clear chat" or leaving the page: leave the messages as the user set them.
        if (controller.signal.aborted) return
        if (!answer) throw new ApiError('upstream')
        if (settings.autoSpeak) void readAloud(history.length, answer)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(errorMessageKey(err))
        // Keep whatever was already written; drop the empty bubble.
        setMessages(answer ? [...history, { role: 'model', text: answer }] : history)
      } finally {
        setStatus('idle')
        abortRef.current = null
      }
    },
    [lang, messages, readAloud, settings.autoSpeak, settings.district, settings.state, settings.crops, settings.coords, status],
  )

  const toggleMic = useCallback(() => {
    if (listening) {
      stopListeningRef.current?.()
      return
    }
    if (!canListen()) {
      setError('chat.micUnsupported')
      return
    }
    stopSpeaking()
    setError(null)
    setListening(true)
    stopListeningRef.current = listen(bcp47, {
      onText: (text, isFinal) => {
        setInput(text)
        // Voice-first farmers shouldn't have to find the send button.
        if (isFinal) void send(text)
      },
      onEnd: () => {
        setListening(false)
        stopListeningRef.current = null
      },
      onError: (e) => setError(e === 'denied' ? 'chat.micDenied' : e === 'unsupported' ? 'chat.micUnsupported' : 'error.generic'),
    })
  }, [bcp47, listening, send])

  // Arriving from the home screen with a typed question (?q=) or the mic button (?voice=1).
  // Deferred a tick so React StrictMode's mount/unmount/mount in dev doesn't abort the first request.
  useEffect(() => {
    if (handledParams.current) return
    const q = params.get('q')
    const voice = params.get('voice')
    if (!q && !voice) return
    const timer = setTimeout(() => {
      handledParams.current = true
      window.history.replaceState(null, '', '#/chat')
      if (q) void send(q)
      else toggleMic()
    })
    return () => clearTimeout(timer)
  }, [params, send, toggleMic])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void send(input)
  }

  const busy = status !== 'idle'
  const clear = () => {
    abortRef.current?.abort()
    stopSpeaking()
    setMessages([])
    setError(null)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader
        title={t('chat.title')}
        action={
          messages.length > 0 && (
            <button onClick={clear} aria-label={t('chat.clear')} className="rounded-full p-2 text-stone-500 active:bg-stone-100">
              <Trash2 className="size-5" />
            </button>
          )
        }
      />

      <main className="flex flex-1 flex-col gap-3 px-3 pb-44 pt-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3 py-4">
            <p className="text-center text-stone-600">{t('chat.empty')}</p>
            {EXAMPLES.map((key) => (
              <button key={key} onClick={() => void send(t(key))} className="rounded-2xl border border-brand-200 bg-white px-4 py-3 text-left text-brand-900 shadow-sm active:bg-brand-50">
                {t(key)}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="ml-10 self-end rounded-2xl rounded-br-sm bg-brand-700 px-4 py-2.5 text-white">
              {m.text}
            </div>
          ) : (
            <div key={i} className="mr-4 self-start rounded-2xl rounded-bl-sm border border-stone-200 bg-white px-4 py-3 shadow-sm">
              {m.text ? (
                <>
                  <Markdown text={m.text} />
                  {!(busy && i === messages.length - 1) && (
                    <button onClick={() => void readAloud(i, m.text)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-700">
                      {speakingIndex === i ? <Square className="size-4" /> : <Volume2 className="size-4" />}
                      {speakingIndex === i ? t('chat.stop') : t('chat.readAloud')}
                    </button>
                  )}
                </>
              ) : (
                <span className="inline-flex items-center gap-2 text-stone-500">
                  <Loader2 className="size-4 animate-spin" />
                  {status === 'prices' ? t('chat.checkingPrices') : t('chat.thinking')}
                </span>
              )}
            </div>
          ),
        )}

        {error && <Notice tone={error === 'chat.noVoice' || error === 'chat.micUnsupported' ? 'warn' : 'danger'}>{t(error)}</Notice>}
        <div ref={bottomRef} />
      </main>

      <div className="pb-safe fixed inset-x-0 bottom-[60px] z-20 border-t border-stone-200 bg-soil-50/95 px-3 pt-2 backdrop-blur">
        <p className="mx-auto mb-1.5 max-w-xl text-center text-[11px] leading-tight text-stone-500">{t('chat.disclaimer')}</p>
        <form onSubmit={submit} className="mx-auto flex max-w-xl items-end gap-2 pb-2">
          <button
            type="button"
            onClick={toggleMic}
            disabled={busy || !online}
            aria-label={t('chat.mic')}
            className={`shrink-0 rounded-full p-3.5 text-white disabled:opacity-40 ${listening ? 'listening bg-red-600' : 'bg-amber-500'}`}
          >
            {listening ? <MicOff className="size-6" /> : <Mic className="size-6" />}
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) submit(e)
            }}
            rows={1}
            placeholder={listening ? t('chat.listening') : online ? t('chat.placeholder') : t('chat.offline')}
            className="max-h-32 min-h-[52px] flex-1 resize-none rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-brand-600"
          />
          <button type="submit" disabled={busy || !input.trim()} aria-label={t('chat.send')} className="shrink-0 rounded-full bg-brand-700 p-3.5 text-white disabled:opacity-40">
            {busy ? <Loader2 className="size-6 animate-spin" /> : <Send className="size-6" />}
          </button>
        </form>
      </div>
    </div>
  )
}

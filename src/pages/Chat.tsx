import { Loader2, Mic, MicOff, Send, Square, Trash2, Volume2 } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { COMMODITIES } from '../../shared/commodities'
import { KCC_PHONE } from '../../shared/helplines'
import { MAX_HISTORY, MAX_MESSAGE_CHARS, type ChatIntent, type ChatMessage, type Vote } from '../../shared/types'
import { useHeightVar } from '../components/BottomNav'
import { CallKcc, ErrorNotice, Feedback, Notice, PageHeader, ShareButton, smallButton } from '../components/ui'
import type { MessageKey } from '../i18n'
import { ApiError, api, streamChat } from '../lib/api'
import { answering, useOnline } from '../lib/hooks'
import { Markdown } from '../lib/markdown'
import { go, takeAsk, useRoute, type Route } from '../lib/router'
import { appUrl, forWhatsApp } from '../lib/share'
import { answerLanguage, canListen, listen, speak, stopSpeaking, type ListenError } from '../lib/speech'
import { readJson, writeJson } from '../lib/storage'
import { useSettings, useT } from '../settings'

const MAX_SAVED = 40
// What the farmer sees while the Worker looks something up.
const TOOL_STATUS: Record<string, MessageKey> = {
  get_mandi_prices: 'chat.checkingPrices',
  get_weather_forecast: 'chat.checkingWeather',
  get_scheme_info: 'chat.checkingSchemes',
}
const MIC_ERRORS: Record<ListenError, MessageKey> = {
  unsupported: 'chat.micUnsupported',
  denied: 'chat.micDenied',
  network: 'chat.micNetwork',
  nomic: 'chat.micNoDevice',
  failed: 'error.generic',
}
// Seconds a spoken question waits before sending, so a pause mid-sentence can still be fixed.
const VOICE_SEND_DELAY = 3
const DRAFT_KEY = 'bhoopal.chatDraft'

type Status = 'idle' | 'thinking' | 'writing'

/** Saved chat, keeping only well-formed, non-empty messages (an old empty bubble would spin forever). */
function savedMessages(): ChatMessage[] {
  const raw = readJson<unknown>('chat', [])
  if (!Array.isArray(raw)) return []
  return raw
    .filter((m): m is ChatMessage => Boolean(m) && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text.trim() !== '')
    .map((m) => ({
      role: m.role,
      text: m.text,
      ...(typeof m.model === 'string' ? { model: m.model } : {}),
      ...(m.cut === true ? { cut: true } : {}),
      ...(typeof m.id === 'string' && m.id.length <= 16 ? { id: m.id } : {}),
      ...(m.vote === 'up' || m.vote === 'down' ? { vote: m.vote } : {}),
    }))
}

function savedDraft() {
  try {
    return sessionStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}

interface BubbleProps {
  m: ChatMessage
  index: number
  /** The answer being written right now. */
  streaming: boolean
  toolName: string | null
  speaking: boolean
  onRead: (index: number, text: string) => void
  onVote: (index: number, vote: Vote) => void
}

/** One message. Memoized: while an answer streams in, only its own bubble re-renders and re-parses Markdown. */
const Bubble = memo(function Bubble({ m, index, streaming, toolName, speaking, onRead, onVote }: BubbleProps) {
  const { t, bcp47 } = useT()
  if (m.role === 'user') return <div className="ml-10 self-end rounded-2xl rounded-br-sm bg-brand-700 px-4 py-2.5 text-white">{m.text}</div>
  return (
    <div
      lang={m.text ? answerLanguage(m.text, bcp47) : undefined}
      className="mr-4 self-start rounded-2xl rounded-bl-sm border border-stone-200 bg-white px-4 py-3 shadow-sm"
    >
      {m.text ? (
        <>
          <Markdown text={m.text} />
          {m.cut && <p className="mt-2 text-sm text-stone-700">{t('chat.cutShort')}</p>}
          {streaming ? (
            toolName && (
              <span role="status" className="mt-2 inline-flex items-center gap-2 text-sm text-stone-700">
                <Loader2 className="size-4 motion-safe:animate-spin" />
                {t(TOOL_STATUS[toolName] ?? 'chat.thinking')}
              </span>
            )
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={() => onRead(index, m.text)} className={smallButton}>
                {speaking ? <Square className="size-4" /> : <Volume2 className="size-4" />}
                {speaking ? t('chat.stop') : t('chat.readAloud')}
              </button>
              <ShareButton content={async () => ({ text: `${forWhatsApp(m.text)}\n\n${t('share.fromApp', { url: appUrl() })}` })} />
              <Feedback vote={m.vote} onVote={(vote) => onVote(index, vote)} />
            </div>
          )}
        </>
      ) : (
        <span role="status" className="inline-flex items-center gap-2 text-stone-700">
          <Loader2 className="size-4 motion-safe:animate-spin" />
          {t((toolName && TOOL_STATUS[toolName]) || 'chat.thinking')}
        </span>
      )}
    </div>
  )
})

/** What still works without internet, and the free helpline: an offline chat must not be a dead end. */
function OfflineCard() {
  const { t } = useT()
  const items: { key: MessageKey; route: Route }[] = [
    { key: 'chat.offlineWeather', route: 'weather' },
    { key: 'chat.offlinePrices', route: 'home' },
    { key: 'chat.offlineSchemes', route: 'schemes' },
    { key: 'chat.offlineTools', route: 'tools' },
  ]
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <p className="font-semibold text-amber-950">{t('chat.offlineTitle')}</p>
      <ul className="flex flex-col gap-1">
        {items.map(({ key, route }) => (
          <li key={key}>
            <button onClick={() => go(route)} className="py-1 text-left font-medium text-brand-800 underline">
              {t(key)}
            </button>
          </li>
        ))}
      </ul>
      <CallKcc />
    </div>
  )
}

export function Chat() {
  const { t, lang, bcp47 } = useT()
  const { settings } = useSettings()
  const online = useOnline()
  const { params } = useRoute()

  const [messages, setMessages] = useState<ChatMessage[]>(savedMessages)
  const [input, setInput] = useState(savedDraft)
  const [status, setStatus] = useState<Status>('idle')
  const [toolName, setToolName] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [notice, setNotice] = useState<MessageKey | null>(null)
  const [listening, setListening] = useState(false)
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const speakingRef = useRef(speakingIndex)
  speakingRef.current = speakingIndex
  // Set synchronously, so a voice result arriving during a typed send can't start a second request.
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const stopListeningRef = useRef<(() => void) | null>(null)
  const countdownRef = useRef<number | null>(null)
  const lastVoiceRef = useRef('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const shownCount = useRef(messages.length)
  const composerRef = useHeightVar<HTMLDivElement>('--composer-h')
  const handledParams = useRef(false)

  // Save only finished exchanges: a half-written answer is saved by the unmount cleanup below instead.
  useEffect(() => {
    if (status === 'idle') writeJson('chat', messages.filter((m) => m.text).slice(-MAX_SAVED))
  }, [messages, status])
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, input)
    } catch {
      /* ignore */
    }
  }, [input])
  useEffect(() => {
    // Follow the answer as it streams in, but don't yank a farmer who scrolled up to re-read something.
    const el = document.scrollingElement ?? document.documentElement
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    const newMessage = messages.length !== shownCount.current
    shownCount.current = messages.length
    if (!newMessage && !nearBottom) return
    const smooth = newMessage && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Block body on purpose: newer browsers return a Promise from smooth scrollIntoView.
    void bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' })
  }, [messages, status])
  useEffect(
    () => () => {
      // Leaving the page mid-answer: keep the question and whatever was written so far.
      if (busyRef.current) writeJson('chat', messagesRef.current.filter((m) => m.text).slice(-MAX_SAVED))
      abortRef.current?.abort()
      stopListeningRef.current?.()
      if (countdownRef.current) clearInterval(countdownRef.current)
      stopSpeaking()
      answering.set(false)
    },
    [],
  )

  const readAloud = useCallback(
    async (index: number, text: string, implicit = false) => {
      if (!implicit && speakingRef.current === index) {
        stopSpeaking()
        setSpeakingIndex(null)
        return
      }
      setSpeakingIndex(index)
      const ok = await speak(text, answerLanguage(text, bcp47), () => setSpeakingIndex((i) => (i === index ? null : i)))
      if (!ok) {
        setSpeakingIndex(null)
        // Reading a spoken question's answer aloud is automatic: don't nag about voices every time.
        if (!implicit) setNotice('chat.noVoice')
      }
    },
    [bcp47],
  )

  const cancelCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = null
    setCountdown(null)
  }, [])

  const send = useCallback(
    async (raw: string, opts: { intent?: ChatIntent; fromVoice?: boolean } = {}) => {
      const text = raw.trim().slice(0, MAX_MESSAGE_CHARS)
      if (!text || busyRef.current) return
      cancelCountdown()
      if (!navigator.onLine) {
        setInput(text)
        setNotice('chat.offline')
        return
      }
      busyRef.current = true
      answering.set(true)
      stopSpeaking()
      setSpeakingIndex(null)
      setError(null)
      setNotice(null)
      setConfirmClear(false)
      setInput('')
      const history: ChatMessage[] = [...messagesRef.current, { role: 'user', text }]
      setMessages([...history, { role: 'model', text: '' }])
      setStatus('thinking')
      setToolName(null)

      const controller = new AbortController()
      abortRef.current = controller
      let answer = ''
      let model: string | undefined
      let answerId: string | undefined
      let cut = false
      const reply = (): ChatMessage => ({
        role: 'model',
        text: answer,
        ...(model ? { model } : {}),
        ...(answerId ? { id: answerId } : {}),
        ...(cut ? { cut } : {}),
      })
      // Stopped, failed or left with nothing written: take the question back into the box to try again.
      const giveBack = () => {
        setMessages(history.slice(0, -1))
        setInput(text)
      }
      try {
        for await (const event of streamChat(
          {
            // Only what the Worker uses: on 2G, 40 saved messages in Telugu would be ~100 KB per question.
            messages: history.slice(-MAX_HISTORY).map((m) => ({ role: m.role, text: m.text })),
            lang: settings.lang ?? 'en',
            state: settings.state,
            district: settings.district,
            crops: settings.crops,
            // Rounded to ~1 km: also for fixes saved before rounding existed.
            coords: settings.coords && { lat: Math.round(settings.coords.lat * 100) / 100, lon: Math.round(settings.coords.lon * 100) / 100 },
            ...(opts.intent ? { intent: opts.intent } : {}),
          },
          controller.signal,
        )) {
          if (controller.signal.aborted) break
          if (event.type === 'text') {
            answer += event.text
            setStatus('writing')
            setToolName(null)
            setMessages([...history, reply()])
          } else if (event.type === 'tool') {
            setToolName(event.name)
          } else if (event.type === 'meta') {
            model = event.model
            answerId = event.id
          } else if (event.type === 'cut') {
            cut = true
          } else if (event.type === 'reset') {
            // The model failed mid-answer and another one is starting again.
            answer = ''
            setStatus('thinking')
            setMessages([...history, reply()])
          } else if (event.type === 'error') {
            throw new ApiError(event.code, event.retryAt)
          }
        }
        if (controller.signal.aborted) {
          if (answer) setMessages([...history, reply()])
          else giveBack()
          return
        }
        if (!answer) throw new ApiError('upstream')
        setMessages([...history, reply()])
        // A question asked by voice gets a spoken answer.
        if (settings.autoSpeak || opts.fromVoice) void readAloud(history.length, answer, true)
      } catch (err) {
        if (controller.signal.aborted && !(err instanceof ApiError)) {
          if (answer) setMessages([...history, reply()])
          else giveBack()
          return
        }
        setError(err)
        if (answer) setMessages([...history, reply()])
        else giveBack()
      } finally {
        setStatus('idle')
        setToolName(null)
        abortRef.current = null
        busyRef.current = false
        answering.set(false)
      }
    },
    [cancelCountdown, readAloud, settings.autoSpeak, settings.coords, settings.crops, settings.district, settings.lang, settings.state],
  )
  const sendRef = useRef(send)
  sendRef.current = send

  /** A spoken question waits a few seconds ("Sending… tap to edit"), so a pause doesn't send half a sentence. */
  const startCountdown = useCallback(
    (text: string) => {
      cancelCountdown()
      let left = VOICE_SEND_DELAY
      setCountdown(left)
      countdownRef.current = window.setInterval(() => {
        left -= 1
        if (left > 0) return setCountdown(left)
        cancelCountdown()
        void sendRef.current(text, { fromVoice: true })
      }, 1000)
    },
    [cancelCountdown],
  )

  const toggleMic = useCallback(() => {
    if (listening) {
      stopListeningRef.current?.()
      return
    }
    if (!canListen()) {
      setNotice('chat.micUnsupported')
      return
    }
    cancelCountdown()
    stopSpeaking()
    setNotice(null)
    setListening(true)
    stopListeningRef.current = listen(bcp47, {
      onText: (text, isFinal) => {
        if (busyRef.current) return
        setInput(text)
        if (isFinal) {
          lastVoiceRef.current = text.trim()
          startCountdown(text)
        }
      },
      onEnd: () => {
        setListening(false)
        stopListeningRef.current = null
      },
      onError: (e) => setNotice(MIC_ERRORS[e]),
    })
  }, [bcp47, cancelCountdown, listening, startCountdown])

  // Arriving from the home screen: a typed question (?q=), a crop's price (?crop=) or the mic (?voice=1).
  // Deferred a tick so React StrictMode's mount/unmount/mount in dev doesn't abort the first request.
  useEffect(() => {
    if (handledParams.current) return
    const q = params.get('q')
    const crop = COMMODITIES.find((c) => c.id === params.get('crop'))
    const voice = params.get('voice')
    if (!q && !crop && !voice) return
    const timer = setTimeout(() => {
      handledParams.current = true
      const fromApp = takeAsk(params)
      window.history.replaceState(null, '', '#/chat')
      if (voice) return toggleMic()
      const question = crop ? t('home.askPrice', { crop: crop.names[settings.lang ?? 'en'] }) : q!
      // Typed into the box first, so it isn't lost if the farmer is offline; sent only if it came from the app.
      setInput(question)
      if (fromApp) void send(question, crop ? { intent: { kind: 'price', commodity: crop.id } } : {})
    })
    return () => clearTimeout(timer)
  }, [params, send, settings.lang, t, toggleMic])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void send(input, { fromVoice: input.trim() !== '' && input.trim() === lastVoiceRef.current })
  }

  const voteOn = useCallback(
    (index: number, vote: Vote) => {
      const m = messagesRef.current[index]
      if (!m || m.vote) return
      setMessages((prev) => prev.map((msg, j) => (j === index ? { ...msg, vote } : msg)))
      void api.feedback({ kind: 'chat', vote, id: m.id, model: m.model, lang: settings.lang ?? 'en' })
    },
    [settings.lang],
  )

  // Example questions about the farmer's own crops (tomato and cotton until they've picked some).
  const crop = (id: string | undefined, fallback: string) => (COMMODITIES.find((c) => c.id === id) ?? COMMODITIES.find((c) => c.id === fallback))!
  const first = crop(settings.crops[0], 'Tomato')
  const second = crop(settings.crops[1] ?? settings.crops[0], 'Cotton')
  const examples: { text: string; intent?: ChatIntent }[] = [
    { text: t('chat.example1', { crop: first.names[lang] }), intent: { kind: 'price', commodity: first.id } },
    { text: t('chat.example2', { crop: second.names[lang] }) },
    { text: t('chat.example3') },
    { text: t('chat.example4') },
  ]
  // The helpline number inside the translated sentence becomes a tel: link.
  const disclaimer = t('chat.disclaimer', { kcc: '\u0000' }).split('\u0000')

  const busy = status !== 'idle'
  const clear = () => {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 4000)
      return
    }
    abortRef.current?.abort()
    stopSpeaking()
    setSpeakingIndex(null)
    setMessages([])
    setError(null)
    setNotice(null)
    setConfirmClear(false)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader
        title={t('chat.title')}
        action={
          messages.length > 0 &&
          !busy && (
            <button
              onClick={clear}
              aria-label={t('chat.clear')}
              className={`inline-flex items-center gap-1 rounded-full p-2.5 text-sm font-semibold ${confirmClear ? 'bg-red-50 px-3 text-red-700' : 'text-stone-500 active:bg-stone-100'}`}
            >
              <Trash2 className="size-5" />
              {confirmClear && t('settings.clearConfirm')}
            </button>
          )
        }
      />

      <main className="flex flex-1 flex-col gap-3 px-3 pt-3" style={{ paddingBottom: 'calc(var(--composer-h, 9rem) + 1rem)' }}>
        {messages.length === 0 && (
          <div className="flex flex-col gap-3 py-4">
            <p className="text-center text-stone-700">{t('chat.empty')}</p>
            {examples.map(({ text, intent }) => (
              <button
                key={text}
                onClick={() => void send(text, intent ? { intent } : {})}
                className="rounded-2xl border border-brand-200 bg-white px-4 py-3 text-left text-brand-900 shadow-sm active:bg-brand-50"
              >
                {text}
              </button>
            ))}
            {online && <CallKcc />}
          </div>
        )}
        {!online && <OfflineCard />}

        {messages.map((m, i) => {
          const streaming = busy && i === messages.length - 1
          return (
            <Bubble
              key={i}
              m={m}
              index={i}
              streaming={streaming}
              toolName={streaming ? toolName : null}
              speaking={speakingIndex === i}
              onRead={readAloud}
              onVote={voteOn}
            />
          )
        })}

        {error ? <ErrorNotice error={error} /> : null}
        {notice && (
          <Notice tone={notice === 'chat.offline' ? 'danger' : 'warn'} alert>
            {t(notice)}
          </Notice>
        )}
        <div ref={bottomRef} />
      </main>

      <div ref={composerRef} className="pb-safe fixed inset-x-0 z-20 border-t border-stone-200 bg-soil-50 px-3 pt-2" style={{ bottom: 'var(--nav-h, 60px)' }}>
        {countdown !== null ? (
          <button
            type="button"
            onClick={cancelCountdown}
            className="mx-auto mb-1.5 block w-full max-w-xl rounded-lg bg-amber-100 py-1.5 text-center text-sm font-semibold text-amber-950"
          >
            {t('chat.sendingIn', { n: countdown })}
          </button>
        ) : (
          // Readable outdoors, and the helpline number is a tap away.
          <p className="mx-auto mb-1.5 max-w-xl text-center text-sm leading-snug text-stone-700">
            {disclaimer[0]}
            <a href={`tel:${KCC_PHONE.replace(/-/g, '')}`} className="font-semibold text-brand-800 underline">
              {KCC_PHONE}
            </a>
            {disclaimer[1]}
          </p>
        )}
        <form onSubmit={submit} className="mx-auto flex max-w-xl items-end gap-2 pb-2">
          <button
            type="button"
            onClick={toggleMic}
            disabled={busy || !online}
            aria-label={t('chat.mic')}
            className={`shrink-0 rounded-full p-3.5 disabled:opacity-40 ${listening ? 'listening bg-red-600 text-white' : 'bg-amber-400 text-stone-900'}`}
          >
            {listening ? <MicOff className="size-6" /> : <Mic className="size-6" />}
          </button>
          <textarea
            value={input}
            onChange={(e) => {
              cancelCountdown()
              setInput(e.target.value)
            }}
            onFocus={cancelCountdown}
            onKeyDown={(e) => {
              // Indic phonetic keyboards press Enter to pick a word: that must not send half a question.
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter' && !e.shiftKey) submit(e)
            }}
            rows={1}
            aria-label={t('chat.placeholder')}
            placeholder={listening ? t('chat.listening') : online ? t('chat.placeholder') : t('chat.offline')}
            className="max-h-32 min-h-[52px] flex-1 resize-none rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none placeholder:text-stone-500 focus:border-brand-600"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              aria-label={t('chat.stop')}
              className="shrink-0 rounded-full bg-stone-700 p-3.5 text-white"
            >
              <Square className="size-6" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label={t('chat.send')}
              className="shrink-0 rounded-full bg-brand-700 p-3.5 text-white disabled:opacity-40"
            >
              <Send className="size-6" />
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

import type {
  ApiErrorBody,
  ApiErrorCode,
  ChatEvent,
  ChatRequest,
  DiagnoseRequest,
  DiagnoseResult,
  DistrictsResponse,
  FeedbackRequest,
  PricesResponse,
  WeatherResponse,
} from '../../shared/types'
import type { MessageKey, TranslateVars } from '../i18n'
import { deviceHeader } from './device'

export type ClientErrorCode = ApiErrorCode | 'network'

export class ApiError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    /** When the free AI is back (ISO time), for 'busy'. */
    readonly retryAt?: string,
  ) {
    super(code)
  }
}

export function errorMessageKey(err: unknown): MessageKey {
  const code = err instanceof ApiError ? err.code : 'server_error'
  switch (code) {
    case 'network':
      return 'error.network'
    case 'busy':
      return err instanceof ApiError && err.retryAt ? 'error.resting' : 'error.busy'
    case 'rate_limited':
      return 'error.rate_limited'
    case 'daily_limit':
      return 'error.daily_limit'
    case 'not_configured':
      return 'error.not_configured'
    case 'blocked':
      return 'error.blocked'
    case 'upstream':
      return 'error.upstream'
    default:
      return 'error.generic'
  }
}

const indiaDate = (ms: number) => new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10)

/**
 * Values for the error message, e.g. when the free AI is back: "1:30 PM", or "tomorrow 1:30 PM" once today's
 * reset (about 12:30/1:30 PM in India) has passed.
 */
export function errorMessageVars(err: unknown, bcp47: string, tomorrow: string): TranslateVars | undefined {
  if (!(err instanceof ApiError) || !err.retryAt) return undefined
  const at = new Date(err.retryAt)
  if (Number.isNaN(at.getTime())) return undefined
  const time = at.toLocaleTimeString(bcp47, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
  return { time: indiaDate(at.getTime()) === indiaDate(Date.now()) ? time : `${tomorrow.toLowerCase()} ${time}` }
}

/** An abort signal that fires after `ms`. AbortSignal.timeout is missing on old Android WebViews. */
function timeoutSignal(ms: number, outer?: AbortSignal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  outer?.addEventListener('abort', () => controller.abort(), { once: true })
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
  return controller.signal
}

async function errorFrom(res: Response) {
  const body = (await res.json().catch(() => ({}))) as Partial<ApiErrorBody>
  return new ApiError(body.error ?? 'server_error', body.retryAt)
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { ...init, signal: timeoutSignal(timeoutMs) })
    if (!res.ok) throw await errorFrom(res)
    return (await res.json()) as T
  } catch (err) {
    throw err instanceof ApiError ? err : new ApiError('network')
  }
}

const qs = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][]).toString()

export const api = {
  districts: (state: string) => request<DistrictsResponse>(`/api/districts?${qs({ state })}`),
  weather: (lat: number, lon: number) => request<WeatherResponse>(`/api/weather?${qs({ lat: lat.toFixed(2), lon: lon.toFixed(2) })}`),
  prices: (commodity: string, state: string, district?: string) => request<PricesResponse>(`/api/prices?${qs({ commodity, state, district })}`),
  diagnose: (body: DiagnoseRequest) =>
    request<DiagnoseResult>(
      '/api/diagnose',
      { method: 'POST', headers: { 'content-type': 'application/json', ...deviceHeader() }, body: JSON.stringify(body) },
      // Upload on 2G plus a careful look at the photo.
      120_000,
    ),
  /** Thumbs up/down. Best effort: a lost vote must never bother the farmer. */
  feedback: (body: FeedbackRequest) =>
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...deviceHeader() },
      body: JSON.stringify(body),
      signal: timeoutSignal(15_000),
    }).catch(() => undefined),
}

// The Worker can be silent for a while during price lookups and thinking, but not this long.
const STREAM_STALL_MS = 90_000

/** Streams the assistant's reply as it is written, so farmers on slow networks see text quickly. */
export async function* streamChat(body: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent> {
  // A stalled 2G connection would otherwise leave the spinner forever: abort after a long silence.
  const watchdog = new AbortController()
  let stalled = false
  let timer = setTimeout(() => {}, 0)
  const pet = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      stalled = true
      watchdog.abort()
    }, STREAM_STALL_MS)
  }
  signal.addEventListener('abort', () => watchdog.abort(), { once: true })
  pet()

  try {
    let res: Response
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...deviceHeader() },
        body: JSON.stringify(body),
        signal: watchdog.signal,
      })
    } catch {
      if (signal.aborted) return
      throw new ApiError('network')
    }
    if (!res.ok || !res.body) throw await errorFrom(res)

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    while (true) {
      let chunk: ReadableStreamReadResult<string>
      try {
        chunk = await reader.read()
      } catch {
        if (signal.aborted && !stalled) return
        throw new ApiError('network')
      }
      pet()
      // Flush a final event that arrived without its blank-line terminator.
      buffer += chunk.done ? '\n\n' : chunk.value
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const line = buffer.slice(0, sep).trim()
        buffer = buffer.slice(sep + 2)
        if (line.startsWith('data:')) yield JSON.parse(line.slice(5)) as ChatEvent
      }
      if (chunk.done) break
    }
  } finally {
    clearTimeout(timer)
  }
}

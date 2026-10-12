import type {
  ApiErrorCode,
  ChatEvent,
  ChatRequest,
  DiagnoseRequest,
  DiagnoseResult,
  DistrictsResponse,
  WeatherResponse,
} from '../../shared/types'
import type { MessageKey } from '../i18n'

export type ClientErrorCode = ApiErrorCode | 'network'

export class ApiError extends Error {
  constructor(readonly code: ClientErrorCode) {
    super(code)
  }
}

export function errorMessageKey(err: unknown): MessageKey {
  const code = err instanceof ApiError ? err.code : 'server_error'
  switch (code) {
    case 'network':
      return 'error.network'
    case 'busy':
      return 'error.busy'
    case 'rate_limited':
      return 'error.rate_limited'
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError('network')
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: ApiErrorCode }
    throw new ApiError(body.error ?? 'server_error')
  }
  return (await res.json()) as T
}

const qs = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][]).toString()

export const api = {
  districts: (state: string) => request<DistrictsResponse>(`/api/districts?${qs({ state })}`),
  weather: (lat: number, lon: number) => request<WeatherResponse>(`/api/weather?${qs({ lat: lat.toFixed(2), lon: lon.toFixed(2) })}`),
  diagnose: (body: DiagnoseRequest) =>
    request<DiagnoseResult>('/api/diagnose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
}

/** Streams the assistant's reply as it is written, so farmers on slow networks see text quickly. */
export async function* streamChat(body: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent> {
  let res: Response
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (signal.aborted) return
    throw err instanceof ApiError ? err : new ApiError('network')
  }
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: ApiErrorCode }
    throw new ApiError(data.error ?? 'server_error')
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  while (true) {
    let chunk: ReadableStreamReadResult<string>
    try {
      chunk = await reader.read()
    } catch {
      if (signal.aborted) return
      throw new ApiError('network')
    }
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
}

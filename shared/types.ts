export const LANGS = ['en', 'hi', 'te', 'ta', 'kn', 'ml'] as const
export type Lang = (typeof LANGS)[number]

export const LANG_INFO: Record<Lang, { native: string; english: string; bcp47: string }> = {
  en: { native: 'English', english: 'English', bcp47: 'en-IN' },
  hi: { native: 'हिन्दी', english: 'Hindi', bcp47: 'hi-IN' },
  te: { native: 'తెలుగు', english: 'Telugu', bcp47: 'te-IN' },
  ta: { native: 'தமிழ்', english: 'Tamil', bcp47: 'ta-IN' },
  kn: { native: 'ಕನ್ನಡ', english: 'Kannada', bcp47: 'kn-IN' },
  ml: { native: 'മലയാളം', english: 'Malayalam', bcp47: 'ml-IN' },
}

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v)
}

/** One mandi price row. Prices are ₹ per quintal (100 kg), as published by Agmarknet. */
export interface PriceRecord {
  state: string
  district: string
  market: string
  commodity: string
  variety: string
  grade: string
  /** ISO date (yyyy-mm-dd) the produce arrived at the mandi. */
  date: string
  min: number
  max: number
  modal: number
}

export interface DistrictsResponse {
  districts: { name: string; markets: string[] }[]
}

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'lightrain' | 'rain' | 'heavyrain' | 'thunder' | 'snow'

export interface WeatherHour {
  time: string
  temp: number
  rainMm: number
  windKmh: number
  humidity: number
  kind: WeatherKind
}

export interface WeatherDay {
  date: string
  tMin: number
  tMax: number
  rainMm: number
  windMaxKmh: number
  humidity: number
  kind: WeatherKind
}

export interface WeatherResponse {
  updatedAt: string
  hours: WeatherHour[]
  days: WeatherDay[]
}

export interface ChatMessage {
  role: 'user' | 'model'
  text: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  lang: Lang
  state?: string
  district?: string
  /** Crops the farmer grows (English names), so answers fit their farm. */
  crops?: string[]
  /** GPS position, if the farmer shared it, for the weather tool. */
  coords?: { lat: number; lon: number }
}

export type ApiErrorCode = 'busy' | 'rate_limited' | 'not_configured' | 'bad_request' | 'upstream' | 'blocked' | 'server_error'

/** Server-sent events streamed by /api/chat, one JSON object per `data:` line. */
export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'error'; code: ApiErrorCode }
  | { type: 'done' }

export interface DiagnoseRequest {
  /** Base64 JPEG/PNG/WebP without the data: prefix. */
  image: string
  mimeType: string
  lang: Lang
  crop?: string
  note?: string
}

export type Likelihood = 'low' | 'medium' | 'high'

export interface DiagnoseProblem {
  name: string
  type: 'disease' | 'pest' | 'nutrient' | 'water' | 'other'
  likelihood: Likelihood
  signs: string
  safe_steps: string[]
  expert_options: string
}

export interface DiagnoseResult {
  is_plant_image: boolean
  image_quality: 'good' | 'poor'
  crop: string
  looks_healthy: boolean
  summary: string
  possible_problems: DiagnoseProblem[]
  retake_tips: string
}

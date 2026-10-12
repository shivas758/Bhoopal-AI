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

/** Messages of history the Worker uses (and the app sends). */
export const MAX_HISTORY = 12
/** Longest single chat message, in characters. */
export const MAX_MESSAGE_CHARS = 4000

export interface ChatMessage {
  role: 'user' | 'model'
  text: string
  /** Which model wrote the answer ("template" when no AI was used), for bug reports. */
  model?: string
  /** The answer hit the output limit and stops mid-way. */
  cut?: boolean
}

/** A question the app already understands, so the Worker can answer it without the AI. */
export type ChatIntent = { kind: 'price'; commodity: string }

export interface ChatRequest {
  messages: ChatMessage[]
  lang: Lang
  state?: string
  district?: string
  /** Crops the farmer grows (English names), so answers fit their farm. */
  crops?: string[]
  /** GPS position, if the farmer shared it, for the weather tool. */
  coords?: { lat: number; lon: number }
  /** Set by one-tap buttons (e.g. a crop chip's "ask about prices"), never guessed from text. */
  intent?: ChatIntent
}

export type ApiErrorCode = 'busy' | 'rate_limited' | 'not_configured' | 'bad_request' | 'upstream' | 'blocked' | 'server_error'

/** JSON body of every API error. `retryAt` (ISO time) tells the farmer when the free AI quota is back. */
export interface ApiErrorBody {
  error: ApiErrorCode
  retryAt?: string
}

/**
 * Server-sent events streamed by /api/chat, one JSON object per `data:` line.
 * New event types must stay optional for the app: installed phones keep old bundles that ignore unknown types.
 */
export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'error'; code: ApiErrorCode; retryAt?: string }
  | { type: 'meta'; model: string }
  | { type: 'cut' }
  | { type: 'done' }

/** One mandi's latest price. Prices are ₹ per `unit` (almost always Rs./Quintal). */
export interface PriceRow {
  market: string
  district: string
  date: string
  modalPrice: number
  minPrice?: number
  maxPrice?: number
  variety?: string
  unit: string
  arrival?: string
  /** Far from the other mandis' prices: probably a reporting error. */
  suspicious?: boolean
}

/** One form of a crop as Agmarknet names it ("Ginger(Green)", "Groundnut pods (raw)"). */
export interface PriceForm {
  name: string
  /** Median modal price across the mandis below. */
  typicalPrice: number
  lowest: number
  highest: number
  mandis: number
  rows: PriceRow[]
}

/** GET /api/prices and the chat's get_mandi_prices tool. */
export interface PriceResult {
  commodity: string
  state: string
  district?: string
  scope: 'district' | 'state'
  forms: PriceForm[]
  msp?: { price: number; season?: string; note?: string }
  /** Agmarknet's state-wide average for the crop, ₹ per quintal. */
  stateAverage?: { price: number; date: string }
  note?: string
  howToRead: string
  source: string
}

export type PricesResponse = PriceResult | { error: string }

export interface DiagnoseRequest {
  /** Base64 JPEG/PNG/WebP without the data: prefix. */
  image: string
  mimeType: string
  lang: Lang
  crop?: string
  note?: string
  /** The farmer's profile, so likely pests match the region and season. */
  state?: string
  district?: string
  crops?: string[]
}

export type Likelihood = 'low' | 'medium' | 'high'

export interface DiagnoseProblem {
  name: string
  type: 'disease' | 'pest' | 'nutrient' | 'water' | 'other'
  likelihood: Likelihood
  signs: string
  safe_steps: string[]
  expert_options: string
  /** The model gave doses or a banned pesticide here, so the Worker removed the medicine names. */
  expert_options_redacted?: boolean
}

export interface DiagnoseResult {
  is_plant_image: boolean
  image_quality: 'good' | 'poor'
  crop: string
  looks_healthy: boolean
  summary: string
  possible_problems: DiagnoseProblem[]
  retake_tips: string
  /** The photo seems to show a different crop than the farmer named; likelihoods are capped at low. */
  crop_mismatch?: boolean
}

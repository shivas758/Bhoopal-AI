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

export type AlertSeverity = 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown'

/** An official warning (IMD or a State Disaster Management Authority) from NDMA's SACHET feed. */
export interface OfficialAlert {
  id: string
  /** Who issued it, e.g. "IMD Chennai", "Andhra Pradesh SDMA". */
  office: string
  /** e.g. "Moderate Rain", "Lightning", "Heat Wave". */
  event: string
  severity: AlertSeverity
  urgency: string
  certainty: string
  /** ISO times. */
  onset?: string
  expires: string
  /** The warning text, in the farmer's language when the issuer provided it, else English. */
  headline: string
  headlineLang: Lang
  /** The issuer's area description, e.g. "Tirunelveli, Tenkasi districts of Tamil Nadu". */
  area: string
}

export interface AlertsResponse {
  alerts: OfficialAlert[]
  /** ISO time the feed was last read. */
  checkedAt: string
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
  /** Answer id from the Worker, for feedback. */
  id?: string
  /** The farmer's thumbs up/down on this answer. */
  vote?: Vote
}

export type Vote = 'up' | 'down'

/** POST /api/feedback: a thumbs up/down on an answer or a photo check. */
export interface FeedbackRequest {
  kind: 'chat' | 'photo'
  vote: Vote
  id?: string
  model?: string
  lang: Lang
}

/** POST /api/auth/signup, /login and /reset. `phone` as typed; the Worker keeps its 10 digits. */
export interface AuthRequest {
  phone: string
  password: string
}

/** A new session. The app sends the token as "Authorization: Bearer <token>"; the Worker keeps only its hash. */
export interface AuthResponse {
  token: string
  phone: string
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

/**
 * 'daily_limit': this phone or network used its share of today's free AI questions. Old apps show it as generic.
 * 'unauthorized': not logged in, or the session ended (e.g. the password was reset); the others are log-in answers.
 */
export type ApiErrorCode =
  | 'busy'
  | 'rate_limited'
  | 'daily_limit'
  | 'not_configured'
  | 'bad_request'
  | 'upstream'
  | 'blocked'
  | 'server_error'
  | 'unauthorized'
  | 'no_account'
  | 'account_exists'
  | 'wrong_password'

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
  /** model: which AI wrote it ("template", "cache:<model>"); id: the answer's id, sent back with feedback. */
  | { type: 'meta'; model: string; id?: string }
  | { type: 'cut' }
  /** The model failed mid-answer and another one starts again: drop the text received so far. */
  | { type: 'reset' }
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
  /** State-wide typical price per recent day, from saved daily snapshots (direction only, not a prediction). */
  trend7d?: { date: string; typicalPrice: number; mandis: number }[]
  /** Set when the live services were down and these rows come from the saved snapshot of this date. */
  fromSnapshot?: string
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
  /** The check's id, sent back with thumbs up/down (older app bundles don't send it). */
  id?: string
}

// ---- the owner's analytics page (GET /api/admin/stats, worker/admin.ts, src/pages/Admin.tsx) -------------------

/** One India date of accounts and activity: a zero-filled row for every day in the window. */
export interface AdminDay {
  day: string
  signups: number
  /** Accounts that opened the app, logged in, asked or checked a photo that day. */
  active: number
  opens: number
  logins: number
  chats: number
  photos: number
}

export interface AdminUser {
  phone: string
  created: number
  lastSeen: number | null
  /** Counts within the window. */
  opens: number
  logins: number
  chats: number
  photos: number
  activeDays: number
}

export interface AdminAiDay {
  day: string
  chats: number
  photos: number
  /** Answered by the AI, the cache, a template or the backup AI; the rest were not answered. */
  answered: number
  failed: number
  /** Thumbs up and down on answers and photo checks. */
  up: number
  down: number
}

/** The AI's outcomes from Analytics Engine, only when CF_ANALYTICS_TOKEN is set. Counts are sampling-corrected and rounded. */
export interface AdminAiStats {
  daily: AdminAiDay[]
  outcomes: { kind: string; outcome: string; n: number }[]
  /** Chat answers per model and outcome, with the average time in ms. */
  models: { model: string; outcome: string; n: number; ms: number }[]
  langs: { kind: string; lang: string; n: number }[]
  states: { kind: string; state: string; n: number }[]
  /** Why the section is empty (the SQL API failed or isn't configured). */
  error?: string
}

/** One kept question and answer (GET /api/admin/answers, the `transcripts` table): 7 days. */
export interface AdminAnswer {
  id: number
  created: number
  kind: 'chat' | 'photo'
  /** The account that asked (10 digits); null for rows written before migration 0006. */
  phone: string | null
  lang: string
  state: string | null
  district: string | null
  /** "template", "cache:<model>", a model id, or null when nothing answered. */
  model: string | null
  outcome: string
  /** For a photo check: the crop the farmer named and their note, never the photo. */
  question: string
  /** Empty when there was no answer. */
  answer: string
  vote: Vote | null
  ms: number | null
}

export interface AdminAnswers {
  generated: number
  /** Newest first. */
  rows: AdminAnswer[]
  /** Older rows exist: ask again with `before` = the last row's `created`. */
  more: boolean
}

export interface AdminStats {
  /** When this was computed (ms since epoch). */
  generated: number
  /** Days in the window, today included. */
  days: number
  version?: string
  totals: {
    users: number
    /** Sessions not yet expired: roughly logged-in phones. */
    sessions: number
    pushSubs: number
    newToday: number
    new7: number
    new30: number
    activeToday: number
    active7: number
    active30: number
  }
  daily: AdminDay[]
  /** Most recently seen first; at most 500. */
  users: AdminUser[]
  push: { byState: { state: string; n: number }[]; byLang: { lang: string; n: number }[] }
  ai?: AdminAiStats
}

-- BhooPal's shared store (Cloudflare D1, free tier: 5M rows read / 100k rows written per day).
-- Memory is still the first cache level in each Worker isolate; these tables are shared by all isolates.

-- Upstream data (Agmarknet filters, mandi rows, state summaries) so a cold isolate doesn't refetch it.
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  expires INTEGER NOT NULL, -- ms since epoch
  json TEXT NOT NULL
);

-- Services that are out of quota or down, e.g. a Gemini model until the Pacific-midnight reset.
CREATE TABLE IF NOT EXISTS resting (
  service TEXT PRIMARY KEY,
  until INTEGER NOT NULL -- ms since epoch
);

-- Daily AI budgets (day = Pacific date, when Gemini's free quota resets). Scope e.g. 'chat:all',
-- 'chat:ip:<hash>', 'photo:dev:<id>'. IPs are stored only as a short hash.
CREATE TABLE IF NOT EXISTS budget (
  day TEXT NOT NULL,
  scope TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, scope)
);

-- Answers to identical first questions from farmers with the same profile on the same day.
-- hash covers language, state, district, crops, India date and the question; no farmer text is stored
-- except the answer itself.
CREATE TABLE IF NOT EXISTS answers (
  hash TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  model TEXT,
  created INTEGER NOT NULL
);

-- Daily mandi price snapshots (cron), for 7-day trends and as a fallback when Agmarknet is down.
CREATE TABLE IF NOT EXISTS prices (
  state TEXT NOT NULL,     -- our state id, e.g. 'Telangana'
  district TEXT NOT NULL,  -- Agmarknet district name
  market TEXT NOT NULL,
  commodity TEXT NOT NULL, -- Agmarknet commodity name, e.g. 'Paddy(Common)'
  date TEXT NOT NULL,      -- yyyy-mm-dd
  modal INTEGER NOT NULL,
  unit TEXT NOT NULL,
  PRIMARY KEY (state, market, commodity, date)
);
CREATE INDEX IF NOT EXISTS prices_by_crop ON prices (state, commodity, date);

-- Last result of the upstream health probe (cron), read by /api/health.
CREATE TABLE IF NOT EXISTS status (
  service TEXT PRIMARY KEY,
  ok INTEGER NOT NULL,
  checked INTEGER NOT NULL, -- ms since epoch
  detail TEXT
);

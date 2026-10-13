-- Morning weather messages and official warnings by Web Push (the farmer turns them on in Settings).
-- Only what sending needs is kept: the phone's push address and keys, language, state, district, the
-- district's LGD code (for official warnings) and, if the farmer shared GPS, the ~5 km forecast cell.
-- A row is deleted when the farmer turns alerts off or the push service says the phone is gone.
CREATE TABLE IF NOT EXISTS push_subs (
  id TEXT PRIMARY KEY,           -- SHA-256 of the endpoint (hex)
  endpoint TEXT NOT NULL,
  lang TEXT NOT NULL,
  state TEXT,
  district TEXT,
  lgd INTEGER,
  lat REAL,                      -- rounded to the 0.05° forecast grid
  lon REAL,
  created INTEGER NOT NULL,      -- ms since epoch
  morning_day TEXT,              -- India date of the last morning message
  alerts_sent TEXT NOT NULL DEFAULT '[]', -- ids of the last official warnings pushed
  last_alert INTEGER             -- ms since epoch
);
CREATE INDEX IF NOT EXISTS push_by_morning ON push_subs (morning_day);
CREATE INDEX IF NOT EXISTS push_by_lgd ON push_subs (lgd);

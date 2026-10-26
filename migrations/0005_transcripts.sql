-- Questions and answers for the owner's analytics page (#/admin "Recent answers", worker/admin.ts): what farmers
-- asked (or the note with a photo; never the photo itself) and what the AI said, with language, place, model,
-- outcome and the thumbs up/down. No phone number. The 8 PM cron deletes rows older than 7 days.
CREATE TABLE IF NOT EXISTS transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created INTEGER NOT NULL,   -- ms since epoch
  kind TEXT NOT NULL,         -- chat | photo
  qid TEXT,                   -- the answer id the app sends back with thumbs up/down
  lang TEXT NOT NULL,
  state TEXT,
  district TEXT,
  model TEXT,                 -- which AI wrote it ("template", "cache:<model>", a model id)
  outcome TEXT NOT NULL,      -- answered, cached, blocked, daily_limit, no_answer…
  question TEXT NOT NULL,
  answer TEXT NOT NULL,       -- empty when there was no answer
  vote TEXT,                  -- up | down | NULL
  ms INTEGER                  -- how long the answer took
);
CREATE INDEX IF NOT EXISTS transcripts_created ON transcripts (created);
CREATE INDEX IF NOT EXISTS transcripts_qid ON transcripts (kind, qid, created);

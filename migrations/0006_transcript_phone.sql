-- The owner asked to see which account asked each question: the farmer's number goes on the transcript
-- (worker/chat.ts, worker/diagnose.ts; shown and searchable on #/admin). Still deleted after 7 days.
ALTER TABLE transcripts ADD COLUMN phone TEXT;

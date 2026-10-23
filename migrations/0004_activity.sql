-- Activity per account, for the owner's analytics page (#/admin, worker/admin.ts): how many times each number
-- opened the app, logged in, asked a question and checked a photo on each India date. Counts only: never the
-- question, the photo or the answer. The 8 PM cron deletes rows older than about 13 months.
CREATE TABLE IF NOT EXISTS activity (
  day TEXT NOT NULL,                  -- India date, yyyy-mm-dd
  phone TEXT NOT NULL,
  opens INTEGER NOT NULL DEFAULT 0,   -- app opened with a saved log-in (the app reports it once a day)
  logins INTEGER NOT NULL DEFAULT 0,  -- sign-up, log-in or new password
  chats INTEGER NOT NULL DEFAULT 0,   -- questions sent to /api/chat
  photos INTEGER NOT NULL DEFAULT 0,  -- photo checks sent to /api/diagnose
  PRIMARY KEY (day, phone)
);

-- When the account was last used (ms since epoch): any of the above.
ALTER TABLE users ADD COLUMN last_seen INTEGER;

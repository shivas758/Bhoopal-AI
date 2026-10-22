-- Log-in with a mobile number and password (worker/auth.ts). Nothing else about the farmer is kept here: their
-- language, district and crops stay on the phone.
CREATE TABLE IF NOT EXISTS users (
  phone TEXT PRIMARY KEY,        -- 10-digit Indian mobile number
  password TEXT NOT NULL,        -- 'pbkdf2-sha256$<rounds>$<salt>$<hash>', never the password itself
  created INTEGER NOT NULL       -- ms since epoch
);

-- One row per logged-in phone. Only the SHA-256 of the token is stored; the token itself is on the phone.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,           -- SHA-256 of the token (hex)
  phone TEXT NOT NULL,
  created INTEGER NOT NULL,      -- ms since epoch
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_phone ON sessions (phone);

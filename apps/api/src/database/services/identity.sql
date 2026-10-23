CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 255),
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email) AND char_length(email) BETWEEN 1 AND 254),
  password_hash TEXT NOT NULL CHECK (char_length(password_hash) >= 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;

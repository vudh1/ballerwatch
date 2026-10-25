-- Accountless calendar profiles: public source fixtures remain authoritative.
-- All team preferences are AES-GCM ciphertext. Capability lookup is hash-only.
-- No participant names, raw tokens, browser identifiers or GitHub state.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS calendar_profiles (
  id TEXT PRIMARY KEY,
  read_hash TEXT NOT NULL UNIQUE,
  recovery_hash TEXT NOT NULL UNIQUE,
  selection_cipher TEXT NOT NULL,
  read_cipher TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_ms INTEGER NOT NULL,
  updated_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS calendar_managers (
  manager_hash TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES calendar_profiles(id) ON DELETE CASCADE,
  created_ms INTEGER NOT NULL,
  expires_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS calendar_managers_profile ON calendar_managers (profile_id);
CREATE TABLE IF NOT EXISTS calendar_pairings (
  ticket_hash TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES calendar_profiles(id) ON DELETE CASCADE,
  expires_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS calendar_pairings_expiry ON calendar_pairings (expires_ms);
CREATE TABLE IF NOT EXISTS calendar_rate (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL CHECK (hits >= 0),
  until_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS calendar_rate_expiry ON calendar_rate (until_ms);

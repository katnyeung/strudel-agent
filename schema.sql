-- Strudel Agent — Neon Event Logging Schema
-- Run this in your Neon console before starting the server with NEON_DATABASE_URL set.

CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY,
  skill_id      TEXT,
  skill_name    TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at      TIMESTAMPTZ,
  total_evolves INT DEFAULT 0,
  avg_rating    NUMERIC(3,2),
  final_code    TEXT
);

CREATE TABLE IF NOT EXISTS evolution_events (
  id            SERIAL PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  phase         TEXT NOT NULL,
  move_type     TEXT,
  code_before   TEXT,
  code_after    TEXT NOT NULL,
  voices        JSONB DEFAULT '[]',
  voice_count   INT DEFAULT 0,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ratings (
  id            SERIAL PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  code_snapshot TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS human_commands (
  id            SERIAL PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  command       TEXT NOT NULL,
  code_before   TEXT,
  code_after    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_evolution_session ON evolution_events(session_id);
CREATE INDEX IF NOT EXISTS idx_evolution_phase ON evolution_events(phase);
CREATE INDEX IF NOT EXISTS idx_evolution_created ON evolution_events(created_at);
CREATE INDEX IF NOT EXISTS idx_ratings_session ON ratings(session_id);
CREATE INDEX IF NOT EXISTS idx_commands_session ON human_commands(session_id);

-- Per-voice rating support
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS voice_name TEXT;
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS voice_type TEXT;
CREATE INDEX IF NOT EXISTS idx_ratings_voice ON ratings(voice_name) WHERE voice_name IS NOT NULL;

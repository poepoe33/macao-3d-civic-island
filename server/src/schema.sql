-- 澳門城市島：會員、圖鑑、任務、提案與投票
CREATE TABLE IF NOT EXISTS districts (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  name_en         TEXT,
  parish          TEXT,
  macro_region    TEXT,
  macro_region_en TEXT,
  landmass        TEXT,
  icon            TEXT,
  color           TEXT,
  population      TEXT,
  area_km2        TEXT,
  summary         TEXT,
  summary_en      TEXT,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS landmarks (
  id             TEXT PRIMARY KEY,
  district_id    TEXT NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  name_en        TEXT,
  description    TEXT,
  description_en TEXT,
  facts          JSONB NOT NULL DEFAULT '[]'::jsonb,
  facts_en       JSONB NOT NULL DEFAULT '[]'::jsonb,
  model          TEXT,
  schedule       TEXT,
  sort_order     INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS landmarks_district_idx ON landmarks(district_id);

CREATE TABLE IF NOT EXISTS users (
  id             BIGSERIAL PRIMARY KEY,
  google_sub     TEXT NOT NULL UNIQUE,
  email          TEXT,
  name           TEXT,
  avatar_url     TEXT,
  nickname       TEXT,
  district_id    TEXT REFERENCES districts(id) ON DELETE SET NULL,
  level          INT NOT NULL DEFAULT 1,
  xp             INT NOT NULL DEFAULT 0,
  coins          INT NOT NULL DEFAULT 0,
  streak_days    INT NOT NULL DEFAULT 0,
  last_active_on DATE,
  onboarded      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS discoveries (
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  landmark_id  TEXT NOT NULL REFERENCES landmarks(id) ON DELETE CASCADE,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, landmark_id)
);
CREATE INDEX IF NOT EXISTS discoveries_landmark_idx ON discoveries(landmark_id);

CREATE TABLE IF NOT EXISTS events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  ref_id     TEXT,
  xp         INT NOT NULL DEFAULT 0,
  coins      INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_user_time_idx ON events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS events_type_time_idx ON events(type, created_at DESC);

CREATE TABLE IF NOT EXISTS task_completions (
  user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL,
  day      DATE NOT NULL,
  xp       INT NOT NULL DEFAULT 0,
  coins    INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_key, day)
);

CREATE TABLE IF NOT EXISTS proposals (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  district_id TEXT REFERENCES districts(id) ON DELETE SET NULL,
  category    TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposals_district_idx ON proposals(district_id, created_at DESC);

CREATE TABLE IF NOT EXISTS proposal_votes (
  proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, user_id)
);

-- 分區建設沙盤：每位市民在自己的居住分區擁有 12 格建設用地
CREATE TABLE IF NOT EXISTS user_buildings (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  district_id   TEXT NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  slot          SMALLINT NOT NULL CHECK (slot >= 0 AND slot < 12),
  building_type TEXT NOT NULL,
  vitality      INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, slot)
);
CREATE INDEX IF NOT EXISTS user_buildings_district_idx ON user_buildings(district_id);

CREATE TABLE IF NOT EXISTS sandbox_likes (
  owner_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  liker_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, liker_id)
);

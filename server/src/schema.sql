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

-- 社群：好友關係（requester_id 永遠存較小 id）與社團
CREATE TABLE IF NOT EXISTS friendships (
  id           BIGSERIAL PRIMARY KEY,
  requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  CHECK (requester_id < addressee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_idx ON friendships (requester_id, addressee_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id, status);

CREATE TABLE IF NOT EXISTS guilds (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  icon        TEXT NOT NULL DEFAULT '🏙',
  description TEXT,
  owner_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guild_members (
  guild_id  BIGINT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS guild_members_user_idx ON guild_members (user_id);
CREATE INDEX IF NOT EXISTS guild_members_guild_idx ON guild_members (guild_id);

CREATE TABLE IF NOT EXISTS guild_claims (
  guild_id   BIGINT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  claimed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, week_start)
);

-- 鄰里打招呼：每人每天對同一位市民只能打招呼一次
CREATE TABLE IF NOT EXISTS greets (
  id           BIGSERIAL PRIMARY KEY,
  from_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day          DATE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_user_id, to_user_id, day)
);
CREATE INDEX IF NOT EXISTS greets_to_day_idx ON greets (to_user_id, day);

-- 好友沙盤巡訪：每人每天對同一沙盤只計一次
CREATE TABLE IF NOT EXISTS sandbox_visits (
  id         BIGSERIAL PRIMARY KEY,
  visitor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  host_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (visitor_id, host_id, day)
);
CREATE INDEX IF NOT EXISTS sandbox_visits_host_idx ON sandbox_visits (host_id, day);

-- 市民個人化資料、管理員與封禁狀態
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_emoji TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS figure_color TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS figure_style TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'citizen';
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_reason TEXT;

-- 私人訊息（PM）
CREATE TABLE IF NOT EXISTS messages (
  id           BIGSERIAL PRIMARY KEY,
  from_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_user_id <> to_user_id)
);
CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages (from_user_id, to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_to_unread_idx ON messages (to_user_id, read_at);

-- 城市活動
CREATE TABLE IF NOT EXISTS activities (
  id           BIGSERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'community',
  description  TEXT NOT NULL,
  district_id  TEXT REFERENCES districts(id) ON DELETE SET NULL,
  location     TEXT,
  start_at     TIMESTAMPTZ NOT NULL,
  end_at       TIMESTAMPTZ NOT NULL,
  capacity     INT,
  reward_coins INT NOT NULL DEFAULT 30,
  reward_xp    INT NOT NULL DEFAULT 20,
  status       TEXT NOT NULL DEFAULT 'draft',
  created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS activities_time_idx ON activities (start_at, status);

CREATE TABLE IF NOT EXISTS activity_signups (
  activity_id   BIGINT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'going' CHECK (status IN ('going','cancelled')),
  checked_in_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, user_id)
);
CREATE INDEX IF NOT EXISTS activity_signups_user_idx ON activity_signups (user_id, status);

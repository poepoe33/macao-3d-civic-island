import crypto from 'node:crypto';
import express from 'express';
import { pool, query } from './db.js';
import { computeTasks, levelInfo, recordEvent, refreshLevel, todayKey, touchStreak, TZ } from './tasks.js';
import { BUILDING_CATALOG, CATALOG_MAP, DEMOLISH_REFUND_RATE, SLOT_COUNT, districtVitality } from './sandbox.js';
import { communityRouter } from './community.js';
import { messagesRouter } from './messages.js';
import { createActivitiesRouter } from './activities.js';

const PORT = Number(process.env.PORT || 3100);
const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SESSION_DAYS = 30;
const COOKIE = 'macao_sid';
const STATE_COOKIE = 'macao_oauth_state';
const NEXT_COOKIE = 'macao_oauth_next';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'paul.ccp@gmail.com').toLowerCase();

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn('[auth] 尚未設定 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET，登入功能將停用');
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

// ---------- 工具 ----------
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('hex');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function setCookie(res, name, value, { maxAge, httpOnly = true } = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (httpOnly) bits.push('HttpOnly');
  if (BASE_URL.startsWith('https://')) bits.push('Secure');
  if (maxAge != null) bits.push(`Max-Age=${maxAge}`);
  res.append('Set-Cookie', bits.join('; '));
}

function clearCookie(res, name) {
  const bits = [`${name}=`, 'Path=/', 'Max-Age=0', 'SameSite=Lax', 'HttpOnly'];
  if (BASE_URL.startsWith('https://')) bits.push('Secure');
  res.append('Set-Cookie', bits.join('; '));
}

// 簡易速率限制（單一進程）
const buckets = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const rec = buckets.get(key);
  if (!rec || now > rec.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  rec.count += 1;
  return rec.count <= limit;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
}, 60_000).unref();

// CSRF：跨站來源阻擋
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origin = req.get('origin');
  if (origin) {
    try {
      const host = new URL(origin).host;
      if (host !== req.get('host')) return res.status(403).json({ error: 'origin_mismatch' });
    } catch {
      return res.status(403).json({ error: 'bad_origin' });
    }
  }
  return next();
});

// 載入登入者
app.use(async (req, res, next) => {
  try {
    const sid = parseCookies(req.headers.cookie)[COOKIE];
    if (!sid) return next();
    const { rows } = await query(
      `SELECT u.*, s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [sha256(sid)]
    );
    if (rows[0]) req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
});

const isAdminUser = (u) => Boolean(u) && (
  u.role === 'admin' || String(u.email || '').toLowerCase() === ADMIN_EMAIL
);

const requireUser = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  if (req.user.banned && !isAdminUser(req.user)) return res.status(403).json({ error: 'banned' });
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'forbidden' });
  next();
};

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function publicUser(u, extra = {}) {
  return {
    id: u.id,
    nickname: u.nickname || u.name || '市民',
    name: u.name,
    email: u.email,
    avatarUrl: u.avatar_url,
    districtId: u.district_id,
    coins: u.coins,
    xp: u.xp,
    streak: u.streak_days,
    onboarded: u.onboarded,
    gender: u.gender || null,
    bio: u.bio || '',
    avatarEmoji: u.avatar_emoji || '🙂',
    figureColor: u.figure_color || '#db6a41',
    figureStyle: u.figure_style || 'casual',
    ...extra,
  };
}

// 城市聲望 ＝ 鄰里點讚 × 2 ＋ 收到的打招呼 ＋ 建設數 × 3（別名固定為 u）
const REPUTATION_SQL = `(
  (SELECT count(*)::int FROM sandbox_likes sl WHERE sl.owner_id = u.id) * 2
  + (SELECT count(*)::int FROM greets g WHERE g.to_user_id = u.id)
  + (SELECT count(*)::int FROM user_buildings b WHERE b.user_id = u.id) * 3
)`;

// 節慶（西曆固定日期）：當日載入自動在旅遊塔施放煙花
const FESTIVALS = [
  { id: 'newyear', date: '01-01', name: '元旦', nameEn: "New Year's Day", emoji: '🎆', message: '新年快樂！全城煙花陪你迎接新一年。' },
  { id: 'labour', date: '05-01', name: '勞動節', nameEn: 'Labour Day', emoji: '🎉', message: '向每一位建設這座城市的勞動者致敬。' },
  { id: 'national', date: '10-01', name: '國慶日', nameEn: 'National Day', emoji: '🇨🇳', message: '祝祖國繁榮昌盛，澳門與你同慶。' },
  { id: 'handover', date: '12-20', name: '澳門回歸紀念日', nameEn: 'Macao SAR Establishment Day', emoji: '🏛', message: '慶祝澳門特別行政區成立，煙花在旅遊塔上空綻放。' },
  { id: 'xmas', date: '12-25', name: '聖誕節', nameEn: 'Christmas Day', emoji: '🎄', message: '聖誕快樂！願這座城市處處有溫暖。' },
];

function festivalForDay(day) {
  const md = day.slice(5);
  return FESTIVALS.find((f) => f.date === md) || null;
}

// ---------- 認證 ----------
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'macao-city' }));

app.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).send('Google 登入尚未設定');
  if (!rateLimit(`auth:${req.ip}`, 20, 60_000)) return res.status(429).send('請求過於頻繁');
  const state = randomToken();
  setCookie(res, STATE_COOKIE, state, { maxAge: 600 });
  const next = String(req.query.next || '');
  if (next.startsWith('/') && !next.startsWith('//')) {
    setCookie(res, NEXT_COOKIE, next, { maxAge: 600 });
  }
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${BASE_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/api/auth/google/callback', wrap(async (req, res) => {
  const { code, state, error } = req.query;
  const cookies = parseCookies(req.headers.cookie);
  const expected = cookies[STATE_COOKIE];
  const nextRaw = cookies[NEXT_COOKIE] || '';
  clearCookie(res, STATE_COOKIE);
  clearCookie(res, NEXT_COOKIE);
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/';
  if (error || !code || !state || !expected || state !== expected) {
    return res.redirect('/?login=failed');
  }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: `${BASE_URL}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    console.error('[auth] token exchange failed', await tokenRes.text());
    return res.redirect('/?login=failed');
  }
  const tokens = await tokenRes.json();
  const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) return res.redirect('/?login=failed');
  const info = await infoRes.json();

  const { rows } = await query(
    `INSERT INTO users (google_sub, email, name, avatar_url)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (google_sub) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, users.email),
       name = COALESCE(EXCLUDED.name, users.name),
       avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url)
     RETURNING id`,
    [info.sub, info.email || null, info.name || null, info.picture || null]
  );
  const userId = rows[0].id;
  const sid = randomToken();
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2, now() + interval '${SESSION_DAYS} days')`,
    [sha256(sid), userId]
  );
  setCookie(res, COOKIE, sid, { maxAge: SESSION_DAYS * 86400 });
  res.redirect(next);
}));

app.post('/api/auth/logout', (req, res) => {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  if (sid) query('DELETE FROM sessions WHERE token_hash=$1', [sha256(sid)]).catch(() => {});
  clearCookie(res, COOKIE);
  res.json({ ok: true });
});

// ---------- 市民檔案 ----------
app.get('/api/me', wrap(async (req, res) => {
  if (!req.user) return res.json({ authenticated: false });
  const u = req.user;
  if (u.banned && !isAdminUser(u)) return res.status(403).json({ authenticated: false, error: 'banned' });
  const streak = await touchStreak(u.id);
  const { day, tasks } = await computeTasks(u.id);
  const level = await refreshLevel(u.id);
  const { rows: countRows } = await query(
    `SELECT
       (SELECT count(*)::int FROM discoveries WHERE user_id=$1) AS discoveries,
       (SELECT count(*)::int FROM proposals WHERE user_id=$1) AS proposals,
       (SELECT count(*)::int FROM proposal_votes WHERE user_id=$1) AS votes,
       (SELECT count(*)::int FROM greets WHERE to_user_id=$1) AS greets_received,
       (SELECT count(*)::int FROM messages WHERE to_user_id=$1 AND read_at IS NULL) AS unread_messages,
       (SELECT coins FROM users WHERE id=$1) AS coins`,
    [u.id]
  );
  const { rows: repRows } = await query(
    `SELECT ${REPUTATION_SQL} AS reputation FROM users u WHERE u.id=$1`, [u.id]
  );
  countRows[0].reputation = repRows[0].reputation;
  countRows[0].unreadMessages = countRows[0].unread_messages;
  const { rows: districtRows } = u.district_id
    ? await query('SELECT id, name, icon, macro_region FROM districts WHERE id=$1', [u.district_id])
    : { rows: [] };
  res.json({
    authenticated: true,
    user: publicUser({ ...u, coins: countRows[0].coins },
      {
        levelInfo: level, counts: countRows[0], district: districtRows[0] || null,
        isAdmin: isAdminUser(u),
      }),
    streak: streak.streak,
    streakBonus: streak.bonus,
    day,
    tasks,
  });
}));

app.post('/api/onboard', requireUser, wrap(async (req, res) => {
  const nickname = String(req.body.nickname || '').trim().slice(0, 20);
  const districtId = String(req.body.districtId || '').trim();
  if (nickname.length < 2) return res.status(400).json({ error: 'nickname_too_short' });
  const { rows } = await query('SELECT id FROM districts WHERE id=$1', [districtId]);
  if (!rows[0]) return res.status(400).json({ error: 'bad_district' });
  await query(
    `UPDATE users SET nickname=$2, district_id=$3, onboarded=TRUE, xp=xp+30, coins=coins+200 WHERE id=$1`,
    [req.user.id, nickname, districtId]
  );
  await query(`INSERT INTO events (user_id,type,ref_id,xp,coins) VALUES ($1,'onboard',$2,30,200)`,
    [req.user.id, districtId]);
  const level = await refreshLevel(req.user.id);
  return res.json({ ok: true, levelInfo: level });
}));

app.post('/api/profile', requireUser, wrap(async (req, res) => {
  const nickname = String(req.body.nickname || '').trim().slice(0, 20);
  const gender = String(req.body.gender || 'other');
  const bio = String(req.body.bio || '').trim().slice(0, 120);
  const avatarEmoji = String(req.body.avatarEmoji || '🙂').slice(0, 8);
  const figureColor = String(req.body.figureColor || '#db6a41');
  const figureStyle = String(req.body.figureStyle || 'casual');
  const districtId = req.body.districtId ? String(req.body.districtId) : null;

  if (nickname.length < 2) return res.status(400).json({ error: 'nickname_too_short' });
  if (!['male', 'female', 'other'].includes(gender)) return res.status(400).json({ error: 'bad_gender' });
  if (!['casual', 'formal', 'sport'].includes(figureStyle)) return res.status(400).json({ error: 'bad_style' });
  if (!/^#[0-9a-fA-F]{6}$/.test(figureColor)) return res.status(400).json({ error: 'bad_color' });
  if (districtId) {
    const { rows } = await query('SELECT id FROM districts WHERE id=$1', [districtId]);
    if (!rows[0]) return res.status(400).json({ error: 'bad_district' });
  }

  const { rows } = await query(
    `UPDATE users SET nickname=$2, gender=$3, bio=$4, avatar_emoji=$5,
            figure_color=$6, figure_style=$7,
            district_id = COALESCE($8, district_id),
            onboarded = TRUE
      WHERE id=$1
      RETURNING *`,
    [req.user.id, nickname, gender, bio, avatarEmoji, figureColor, figureStyle, districtId]
  );
  const level = await refreshLevel(req.user.id);
  const { tasks } = await computeTasks(req.user.id);
  res.json({ ok: true, user: publicUser(rows[0], { levelInfo: level }), tasks });
}));

app.post('/api/discover', requireUser, wrap(async (req, res) => {
  const landmarkId = String(req.body.landmarkId || '');
  const { rows } = await query('SELECT id, district_id FROM landmarks WHERE id=$1', [landmarkId]);
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  const ins = await query(
    `INSERT INTO discoveries (user_id, landmark_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING landmark_id`,
    [req.user.id, landmarkId]
  );
  const isNew = ins.rowCount > 0;
  let reward = { xp: 0, coins: 0 };
  if (isNew) {
    reward = await recordEvent(req.user.id, 'discover', landmarkId);
    await refreshLevel(req.user.id);
    const { rows: countRows } = await query('SELECT count(*)::int AS n FROM discoveries WHERE user_id=$1', [req.user.id]);
    reward.total = countRows[0].n;
  }
  const { tasks } = await computeTasks(req.user.id);
  res.json({ ok: true, isNew, reward, tasks });
}));

app.post('/api/events', requireUser, wrap(async (req, res) => {
  const type = String(req.body.type || '');
  const allowed = new Set(['island', 'tide', 'fireworks', 'lrt', 'lightshow', 'vote', 'proposal']);
  if (!allowed.has(type)) return res.status(400).json({ error: 'bad_type' });
  if (!rateLimit(`evt:${req.user.id}`, 120, 60_000)) return res.status(429).json({ error: 'too_many' });
  const reward = await recordEvent(req.user.id, type, String(req.body.refId || '').slice(0, 64));
  await refreshLevel(req.user.id);
  const { tasks } = await computeTasks(req.user.id);
  res.json({ ok: true, reward, tasks });
}));

// ---------- 城市資料 ----------
app.get('/api/districts', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT d.*, (SELECT count(*)::int FROM landmarks l WHERE l.district_id=d.id) AS landmark_count
       FROM districts d ORDER BY d.code`
  );
  const discoveredMap = new Map();
  if (req.user) {
    const { rows: dRows } = await query(
      `SELECT l.district_id, count(*)::int AS n FROM discoveries ds
         JOIN landmarks l ON l.id = ds.landmark_id
        WHERE ds.user_id=$1 GROUP BY l.district_id`, [req.user.id]
    );
    for (const r of dRows) discoveredMap.set(r.district_id, r.n);
  }
  res.json({
    districts: rows.map((d) => ({
      id: d.id, code: d.code, name: d.name, nameEn: d.name_en, icon: d.icon,
      color: d.color, population: d.population, areaKm2: d.area_km2,
      macroRegion: d.macro_region, summary: d.summary, landmarkCount: d.landmark_count,
      discovered: req.user ? (discoveredMap.get(d.id) || 0) : null,
    })),
  });
}));

app.get('/api/landmarks', wrap(async (req, res) => {
  const districtId = req.query.district ? String(req.query.district) : null;
  const { rows } = await query(
    `SELECT l.id, l.district_id, l.name, l.name_en, l.description, l.facts, l.model, l.sort_order
       FROM landmarks l ${districtId ? 'WHERE l.district_id=$1' : ''}
      ORDER BY l.district_id, l.sort_order`,
    districtId ? [districtId] : []
  );
  let found = new Set();
  if (req.user) {
    const { rows: f } = await query('SELECT landmark_id FROM discoveries WHERE user_id=$1', [req.user.id]);
    found = new Set(f.map((r) => r.landmark_id));
  }
  res.json({
    landmarks: rows.map((l) => ({
      id: l.id, districtId: l.district_id, name: l.name, nameEn: l.name_en,
      description: l.description, facts: l.facts, model: l.model,
      discovered: req.user ? found.has(l.id) : null,
    })),
  });
}));

// ---------- 排行榜 ----------
app.get('/api/leaderboard', wrap(async (req, res) => {
  const board = String(req.query.board || 'weekly');
  let rows;
  if (board === 'discoveries') {
    ({ rows } = await query(
      `SELECT u.id, u.nickname, u.name, u.avatar_url, u.level, d.name AS district_name,
              count(ds.landmark_id)::int AS score
         FROM users u LEFT JOIN districts d ON d.id=u.district_id
         LEFT JOIN discoveries ds ON ds.user_id=u.id
        WHERE u.onboarded
        GROUP BY u.id, d.name ORDER BY score DESC, u.id LIMIT 20`
    ));
  } else if (board === 'coins') {
    ({ rows } = await query(
      `SELECT u.id, u.nickname, u.name, u.avatar_url, u.level, d.name AS district_name,
              u.coins AS score
         FROM users u LEFT JOIN districts d ON d.id=u.district_id
        WHERE u.onboarded ORDER BY u.coins DESC, u.id LIMIT 20`
    ));
  } else if (board === 'reputation') {
    ({ rows } = await query(
      `SELECT u.id, u.nickname, u.name, u.avatar_url, u.level, d.name AS district_name,
              ${REPUTATION_SQL} AS score
         FROM users u LEFT JOIN districts d ON d.id=u.district_id
        WHERE u.onboarded ORDER BY score DESC, u.id LIMIT 20`
    ));
  } else {
    ({ rows } = await query(
      `SELECT u.id, u.nickname, u.name, u.avatar_url, u.level, d.name AS district_name,
              COALESCE(sum(e.xp),0)::int AS score
         FROM users u LEFT JOIN districts d ON d.id=u.district_id
         LEFT JOIN events e ON e.user_id=u.id
           AND e.created_at >= (date_trunc('week', (now() AT TIME ZONE $1)) AT TIME ZONE $1)
        WHERE u.onboarded
        GROUP BY u.id, d.name ORDER BY score DESC, u.id LIMIT 20`, [TZ]
    ));
  }
  res.json({
    board,
    rows: rows.map((r, i) => ({
      rank: i + 1, id: r.id,
      nickname: r.nickname || r.name || '市民',
      avatarUrl: r.avatar_url, level: r.level,
      district: r.district_name, score: r.score,
    })),
  });
}));

// ---------- 提案牆 ----------
app.get('/api/proposals', wrap(async (req, res) => {
  const district = req.query.district ? String(req.query.district) : null;
  const category = req.query.category ? String(req.query.category) : null;
  const sort = req.query.sort === 'new' ? 'new' : 'hot';
  const params = [];
  const where = [];
  if (district) { params.push(district); where.push(`p.district_id = $${params.length}`); }
  if (category) { params.push(category); where.push(`p.category = $${params.length}`); }
  const { rows } = await query(
    `SELECT p.id, p.title, p.body, p.category, p.status, p.created_at, p.district_id,
            d.name AS district_name, d.icon AS district_icon,
            u.nickname, u.name, u.avatar_url, u.level,
            (SELECT count(*)::int FROM proposal_votes v WHERE v.proposal_id=p.id) AS votes,
            ${req.user ? '(SELECT count(*)::int FROM proposal_votes v2 WHERE v2.proposal_id=p.id AND v2.user_id=$' + (params.length + 1) + ') > 0' : 'false'} AS voted
       FROM proposals p
       LEFT JOIN districts d ON d.id=p.district_id
       JOIN users u ON u.id=p.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ${sort === 'new' ? 'p.created_at DESC' : 'votes DESC, p.created_at DESC'}
      LIMIT 50`,
    req.user ? [...params, req.user.id] : params
  );
  res.json({
    proposals: rows.map((r) => ({
      id: r.id, title: r.title, body: r.body, category: r.category, status: r.status,
      createdAt: r.created_at, districtId: r.district_id, district: r.district_name,
      districtIcon: r.district_icon, author: r.nickname || r.name || '市民',
      avatarUrl: r.avatar_url, authorLevel: r.level, votes: r.votes, voted: r.voted,
    })),
  });
}));

app.post('/api/proposals', requireUser, wrap(async (req, res) => {
  const title = String(req.body.title || '').trim();
  const body = String(req.body.body || '').trim();
  const category = String(req.body.category || '');
  const districtId = req.body.districtId ? String(req.body.districtId) : null;
  const CATEGORIES = new Set(['transport', 'climate', 'publicspace', 'culture', 'community', 'green']);
  if (title.length < 4 || title.length > 80) return res.status(400).json({ error: 'bad_title' });
  if (body.length < 10 || body.length > 1500) return res.status(400).json({ error: 'bad_body' });
  if (!CATEGORIES.has(category)) return res.status(400).json({ error: 'bad_category' });
  const { day } = await todayKey();
  const { rows: daily } = await query(
    `SELECT count(*)::int AS n FROM proposals WHERE user_id=$1 AND (created_at AT TIME ZONE $2)::date=$3::date`,
    [req.user.id, TZ, day]
  );
  if (daily[0].n >= 3) return res.status(429).json({ error: 'daily_limit' });
  if (districtId) {
    const { rows: d } = await query('SELECT id FROM districts WHERE id=$1', [districtId]);
    if (!d[0]) return res.status(400).json({ error: 'bad_district' });
  }
  const { rows } = await query(
    `INSERT INTO proposals (user_id, district_id, category, title, body)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
    [req.user.id, districtId, category, title, body]
  );
  await recordEvent(req.user.id, 'proposal', String(rows[0].id));
  await refreshLevel(req.user.id);
  const { tasks } = await computeTasks(req.user.id);
  res.json({ ok: true, id: rows[0].id, tasks });
}));

app.post('/api/proposals/:id/vote', requireUser, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });
  const { rows: p } = await query('SELECT id FROM proposals WHERE id=$1', [id]);
  if (!p[0]) return res.status(404).json({ error: 'not_found' });
  const del = await query('DELETE FROM proposal_votes WHERE proposal_id=$1 AND user_id=$2 RETURNING proposal_id', [id, req.user.id]);
  let voted = false;
  if (del.rowCount === 0) {
    await query('INSERT INTO proposal_votes (proposal_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, req.user.id]);
    voted = true;
    await recordEvent(req.user.id, 'vote', String(id));
    await refreshLevel(req.user.id);
  }
  const { rows: c } = await query('SELECT count(*)::int AS n FROM proposal_votes WHERE proposal_id=$1', [id]);
  const { tasks } = await computeTasks(req.user.id);
  res.json({ ok: true, voted, votes: c[0].n, tasks });
}));

// ---------- 分區建設沙盤 ----------
function sandboxPayload(buildings, level) {
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const b = buildings.find((x) => x.slot === i);
    if (!b) return { slot: i, type: null };
    const meta = CATALOG_MAP.get(b.building_type);
    return {
      slot: i,
      type: b.building_type,
      name: meta ? meta.name : b.building_type,
      icon: meta ? meta.icon : '🏗',
      vitality: b.vitality,
      createdAt: b.created_at,
    };
  });
  return {
    slots,
    catalog: BUILDING_CATALOG.map((b) => ({ ...b, locked: level < b.level })),
    built: buildings.length,
    vitality: buildings.reduce((sum, b) => sum + b.vitality, 0),
  };
}

app.get('/api/sandbox/me', requireUser, wrap(async (req, res) => {
  if (!req.user.district_id) return res.status(400).json({ error: 'no_district' });
  const { rows: districtRows } = await query('SELECT id, name, icon, macro_region FROM districts WHERE id=$1', [req.user.district_id]);
  const { rows: buildings } = await query(
    'SELECT slot, building_type, vitality, created_at FROM user_buildings WHERE user_id=$1 ORDER BY slot',
    [req.user.id]
  );
  const { rows: likes } = await query('SELECT count(*)::int AS n FROM sandbox_likes WHERE owner_id=$1', [req.user.id]);
  const info = levelInfo(req.user.xp);
  res.json({
    district: districtRows[0] || null,
    coins: req.user.coins,
    level: info.level,
    likesReceived: likes[0].n,
    ...sandboxPayload(buildings, info.level),
  });
}));

app.get('/api/sandbox/user/:id', wrap(async (req, res) => {
  const ownerId = Number(req.params.id);
  if (!Number.isFinite(ownerId)) return res.status(400).json({ error: 'bad_id' });
  const { rows: owners } = await query(
    `SELECT u.id, u.nickname, u.name, u.avatar_url, u.level, u.district_id,
            d.name AS district_name, d.icon AS district_icon,
            ${REPUTATION_SQL} AS reputation
       FROM users u LEFT JOIN districts d ON d.id=u.district_id
      WHERE u.id=$1 AND u.onboarded`,
    [ownerId]
  );
  if (!owners[0]) return res.status(404).json({ error: 'not_found' });
  const { rows: buildings } = await query(
    'SELECT slot, building_type, vitality, created_at FROM user_buildings WHERE user_id=$1 ORDER BY slot',
    [ownerId]
  );
  const { rows: likes } = await query('SELECT count(*)::int AS n FROM sandbox_likes WHERE owner_id=$1', [ownerId]);
  let liked = false;
  if (req.user) {
    const { rows: mine } = await query('SELECT 1 FROM sandbox_likes WHERE owner_id=$1 AND liker_id=$2', [ownerId, req.user.id]);
    liked = Boolean(mine[0]);
  }
  const payload = sandboxPayload(buildings, owners[0].level);
  res.json({
    owner: {
      id: owners[0].id, nickname: owners[0].nickname || owners[0].name,
      avatarUrl: owners[0].avatar_url, level: owners[0].level,
      districtId: owners[0].district_id, districtName: owners[0].district_name,
      districtIcon: owners[0].district_icon, reputation: owners[0].reputation,
    },
    likes: likes[0].n,
    liked,
    isOwner: Boolean(req.user && Number(req.user.id) === ownerId),
    ...payload,
  });
}));

app.post('/api/sandbox/build', requireUser, wrap(async (req, res) => {
  if (!req.user.district_id) return res.status(400).json({ error: 'no_district' });
  const slot = Number(req.body.slot);
  const type = String(req.body.type || '');
  const meta = CATALOG_MAP.get(type);
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) return res.status(400).json({ error: 'bad_slot' });
  if (!meta) return res.status(400).json({ error: 'bad_type' });
  const info = levelInfo(req.user.xp);
  if (info.level < meta.level) return res.status(403).json({ error: 'level_locked', needLevel: meta.level });

  const client = await pool.connect();
  let coinsAfter = 0;
  try {
    await client.query('BEGIN');
    const pay = await client.query(
      'UPDATE users SET coins=coins-$2 WHERE id=$1 AND coins >= $2 RETURNING coins',
      [req.user.id, meta.cost]
    );
    if (pay.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'not_enough_coins', cost: meta.cost });
    }
    coinsAfter = pay.rows[0].coins;
    try {
      await client.query(
        `INSERT INTO user_buildings (user_id, district_id, slot, building_type, vitality)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.user.id, req.user.district_id, slot, type, meta.vitality]
      );
    } catch (err) {
      if (err.code === '23505') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'slot_taken' });
      }
      throw err;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const reward = await recordEvent(req.user.id, 'build', type);
  const level = await refreshLevel(req.user.id);
  const { tasks } = await computeTasks(req.user.id);
  res.json({ ok: true, coins: coinsAfter, building: { ...meta }, reward, levelInfo: level, tasks });
}));

app.post('/api/sandbox/demolish', requireUser, wrap(async (req, res) => {
  const slot = Number(req.body.slot);
  if (!Number.isInteger(slot)) return res.status(400).json({ error: 'bad_slot' });
  const del = await query(
    'DELETE FROM user_buildings WHERE user_id=$1 AND slot=$2 RETURNING building_type, vitality',
    [req.user.id, slot]
  );
  if (del.rowCount === 0) return res.status(404).json({ error: 'not_found' });
  const meta = CATALOG_MAP.get(del.rows[0].building_type);
  const refund = Math.floor((meta ? meta.cost : 0) * DEMOLISH_REFUND_RATE);
  const { rows } = await query('UPDATE users SET coins=coins+$2 WHERE id=$1 RETURNING coins', [req.user.id, refund]);
  res.json({ ok: true, refund, coins: rows[0].coins });
}));

app.post('/api/sandbox/like/:id', requireUser, wrap(async (req, res) => {
  const ownerId = Number(req.params.id);
  if (!Number.isFinite(ownerId)) return res.status(400).json({ error: 'bad_id' });
  if (ownerId === Number(req.user.id)) return res.status(400).json({ error: 'self_like' });
  const { rows: owners } = await query('SELECT 1 FROM users WHERE id=$1 AND onboarded', [ownerId]);
  if (!owners[0]) return res.status(404).json({ error: 'not_found' });

  const del = await query('DELETE FROM sandbox_likes WHERE owner_id=$1 AND liker_id=$2 RETURNING owner_id', [ownerId, req.user.id]);
  let liked = false;
  if (del.rowCount === 0) {
    await query('INSERT INTO sandbox_likes (owner_id, liker_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [ownerId, req.user.id]);
    liked = true;
    await recordEvent(req.user.id, 'like', String(ownerId));
    await refreshLevel(req.user.id);
  }
  const { rows: c } = await query('SELECT count(*)::int AS n FROM sandbox_likes WHERE owner_id=$1', [ownerId]);
  const { tasks } = await computeTasks(req.user.id);
  res.json({ ok: true, liked, likes: c[0].n, tasks });
}));

app.get('/api/sandbox/overview', wrap(async (req, res) => {
  const { rows: plots } = await query(
    `SELECT u.id, u.nickname, u.name, u.avatar_url, u.level,
            d.id AS district_id, d.name AS district_name, d.icon AS district_icon,
            count(b.id)::int AS buildings,
            COALESCE(sum(b.vitality),0)::int AS build_vitality,
            (SELECT count(*)::int FROM sandbox_likes sl WHERE sl.owner_id=u.id) AS likes
       FROM users u
       JOIN districts d ON d.id=u.district_id
       JOIN user_buildings b ON b.user_id=u.id
      WHERE u.onboarded
      GROUP BY u.id, d.id
      ORDER BY build_vitality DESC, likes DESC
      LIMIT 8`
  );
  res.json({
    plots: plots.map((p) => ({
      id: p.id, nickname: p.nickname || p.name, avatarUrl: p.avatar_url, level: p.level,
      districtId: p.district_id, districtName: p.district_name, districtIcon: p.district_icon,
      buildings: p.buildings, likes: p.likes, vitality: p.build_vitality,
    })),
    districts: await districtVitality(query),
  });
}));

// ---------- 城市總覽與共創目標 ----------
app.get('/api/city', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM users WHERE onboarded) AS citizens,
       (SELECT count(*)::int FROM discoveries) AS discoveries,
       (SELECT count(*)::int FROM proposals) AS proposals,
       (SELECT count(*)::int FROM proposal_votes) AS votes`
  );
  const { rows: topDistricts } = await query(
    `SELECT d.id, d.name, d.icon, count(ds.landmark_id)::int AS discoveries
       FROM districts d LEFT JOIN landmarks l ON l.district_id=d.id
       LEFT JOIN discoveries ds ON ds.landmark_id=l.id
      GROUP BY d.id ORDER BY discoveries DESC, d.code LIMIT 5`
  );
  const { rows: goalRows } = await query(
    `SELECT count(*)::int AS n FROM discoveries ds
      WHERE ds.discovered_at >= (date_trunc('week', (now() AT TIME ZONE $1)) AT TIME ZONE $1)`, [TZ]
  );
  res.json({
    stats: rows[0],
    topDistricts,
    goal: { key: 'weekly_discoveries', title: '本週全城探索地標', target: 500, progress: Math.min(goalRows[0].n, 500) },
  });
}));

// ---------- 節慶事件 ----------
app.get('/api/festival', wrap(async (req, res) => {
  const { day } = await todayKey();
  res.json({ day, festival: festivalForDay(day) });
}));

// ---------- 管理員 ----------
app.get('/api/admin/stats', requireAdmin, wrap(async (req, res) => {
  const { day } = await todayKey();
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM users) AS users_total,
       (SELECT count(*)::int FROM users WHERE onboarded) AS users_onboarded,
       (SELECT count(*)::int FROM users WHERE banned) AS users_banned,
       (SELECT count(*)::int FROM users
         WHERE (last_active_on AT TIME ZONE $1)::date = $2::date) AS active_today,
       (SELECT count(*)::int FROM discoveries) AS discoveries,
       (SELECT count(*)::int FROM proposals) AS proposals,
       (SELECT count(*)::int FROM proposal_votes) AS votes,
       (SELECT count(*)::int FROM messages) AS messages,
       (SELECT count(*)::int FROM greets WHERE day = $2::date) AS greets_today,
       (SELECT count(*)::int FROM user_buildings) AS buildings,
       (SELECT count(*)::int FROM activities) AS activities_total,
       (SELECT count(*)::int FROM activities WHERE status='published' AND end_at > now()) AS activities_open,
       (SELECT count(*)::int FROM activity_signups WHERE status='going') AS activity_signups,
       (SELECT count(*)::int FROM activities WHERE status='draft') AS activities_draft`,
    [TZ, day]
  );
  res.json({ day, stats: rows[0] });
}));

app.get('/api/admin/users', requireAdmin, wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 40);
  const params = [];
  let where = 'TRUE';
  if (q) {
    params.push(`%${q}%`);
    where = `(u.nickname ILIKE $1 OR u.name ILIKE $1 OR u.email ILIKE $1)`;
  }
  const { rows } = await query(
    `SELECT u.id, u.nickname, u.name, u.email, u.avatar_url, u.avatar_emoji,
            u.level, u.xp, u.coins, u.role, u.banned, u.banned_reason,
            u.onboarded, u.gender, u.streak_days, u.last_active_on, u.created_at,
            d.name AS district_name, d.icon AS district_icon,
            (SELECT count(*)::int FROM user_buildings b WHERE b.user_id = u.id) AS buildings,
            ${REPUTATION_SQL} AS reputation
       FROM users u
       LEFT JOIN districts d ON d.id = u.district_id
      WHERE ${where}
      ORDER BY u.banned DESC, u.last_active_on DESC NULLS LAST, u.id
      LIMIT 100`,
    params
  );
  res.json({
    users: rows.map((u) => ({
      id: u.id,
      nickname: u.nickname || u.name || '（未設定）',
      name: u.name,
      email: u.email,
      avatarUrl: u.avatar_url,
      avatarEmoji: u.avatar_emoji || '🙂',
      level: u.level,
      xp: u.xp,
      coins: u.coins,
      role: u.role,
      banned: u.banned,
      bannedReason: u.banned_reason,
      onboarded: u.onboarded,
      gender: u.gender,
      streak: u.streak_days,
      lastActiveOn: u.last_active_on,
      createdAt: u.created_at,
      districtName: u.district_name,
      districtIcon: u.district_icon,
      buildings: u.buildings,
      reputation: u.reputation,
    })),
  });
}));

app.post('/api/admin/users/:id/ban', requireAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });
  if (id === Number(req.user.id)) return res.status(400).json({ error: 'cannot_ban_self' });
  const banned = Boolean(req.body.banned);
  const reason = String(req.body.reason || '').trim().slice(0, 200);
  const { rows } = await query(
    `UPDATE users SET banned=$2, banned_reason=$3 WHERE id=$1 RETURNING id, banned`,
    [id, banned, banned ? reason || null : null]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  if (banned) {
    await query(
      `DELETE FROM sessions WHERE user_id=$1`, [id]
    );
    await query(`UPDATE activity_signups SET status='cancelled'
                  WHERE user_id=$1 AND checked_in_at IS NULL`, [id]);
  }
  res.json({ ok: true, id: rows[0].id, banned: rows[0].banned });
}));

app.post('/api/admin/users/:id/role', requireAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });
  const role = String(req.body.role || '');
  if (!['citizen', 'admin'].includes(role)) return res.status(400).json({ error: 'bad_role' });
  if (id === Number(req.user.id) && role !== 'admin') {
    return res.status(400).json({ error: 'cannot_demote_self' });
  }
  const { rows } = await query(
    `UPDATE users SET role=$2 WHERE id=$1 RETURNING id, role`, [id, role]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, id: rows[0].id, role: rows[0].role });
}));

app.post('/api/admin/users/:id/grant', requireAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });
  let coins = Math.round(Number(req.body.coins) || 0);
  let xp = Math.round(Number(req.body.xp) || 0);
  coins = Math.max(-10000, Math.min(10000, coins));
  xp = Math.max(-10000, Math.min(10000, xp));
  if (coins === 0 && xp === 0) return res.status(400).json({ error: 'nothing_to_grant' });
  const { rows } = await query(
    `UPDATE users SET coins = GREATEST(0, coins + $2), xp = GREATEST(0, xp + $3)
      WHERE id=$1 RETURNING id, coins, xp`,
    [id, coins, xp]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  await query(`INSERT INTO events (user_id,type,ref_id,xp,coins) VALUES ($1,'admin_grant',$2,$3,$4)`,
    [id, String(req.user.id), xp, coins]);
  await refreshLevel(id);
  res.json({ ok: true, id: rows[0].id, coins: rows[0].coins, xp: rows[0].xp });
}));

// ---------- 3D 場景中的真實市民 ----------
app.get('/api/citizens', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.nickname, u.name, u.level, u.district_id,
            u.gender, u.avatar_emoji, u.figure_color, u.figure_style,
            (SELECT count(*)::int FROM user_buildings b WHERE b.user_id = u.id) AS buildings,
            ${REPUTATION_SQL} AS reputation,
            EXISTS (
              SELECT 1 FROM events e
               WHERE e.user_id = u.id AND e.created_at > now() - interval '30 minutes'
            ) AS online
       FROM users u
      WHERE u.onboarded AND u.district_id IS NOT NULL AND u.banned = FALSE
      ORDER BY online DESC, u.level DESC, u.id
      LIMIT 60`
  );
  res.json({
    citizens: rows.map((c) => ({
      id: c.id,
      nickname: c.nickname || c.name || '市民',
      level: c.level,
      districtId: c.district_id,
      buildings: c.buildings,
      reputation: c.reputation,
      online: c.online,
      gender: c.gender || 'other',
      avatarEmoji: c.avatar_emoji || '🙂',
      figureColor: c.figure_color || '#db6a41',
      figureStyle: c.figure_style || 'casual',
    })),
  });
}));

// ---------- 鄰里打招呼 ----------
const GREET_DAILY_LIMIT = 5;

app.post('/api/greet/:userId', requireUser, wrap(async (req, res) => {
  const target = Number(req.params.userId);
  if (!Number.isFinite(target)) return res.status(400).json({ error: 'bad_id' });
  if (target === Number(req.user.id)) return res.status(400).json({ error: 'self_greet' });
  const { rows: users } = await query('SELECT id, onboarded FROM users WHERE id=$1', [target]);
  if (!users[0] || !users[0].onboarded) return res.status(404).json({ error: 'not_found' });

  const { day } = await todayKey();
  const { rows: todayRows } = await query(
    `SELECT count(*)::int AS n FROM greets
      WHERE from_user_id=$1 AND (created_at AT TIME ZONE $2)::date=$3::date`,
    [req.user.id, TZ, day]
  );
  if (todayRows[0].n >= GREET_DAILY_LIMIT) {
    return res.status(429).json({ error: 'daily_limit', limit: GREET_DAILY_LIMIT });
  }
  const ins = await query(
    `INSERT INTO greets (from_user_id, to_user_id, day) VALUES ($1,$2,$3::date)
     ON CONFLICT DO NOTHING RETURNING id`,
    [req.user.id, target, day]
  );
  if (ins.rowCount === 0) {
    const { tasks } = await computeTasks(req.user.id);
    return res.json({ ok: true, already: true, tasks, remaining: Math.max(0, GREET_DAILY_LIMIT - todayRows[0].n) });
  }

  const reward = await recordEvent(req.user.id, 'greet', String(target));
  await query('UPDATE users SET coins = coins + 2 WHERE id=$1', [target]);
  await query(
    `INSERT INTO events (user_id, type, ref_id, xp, coins) VALUES ($1,'greet_received',$2,0,2)`,
    [target, String(req.user.id)]
  );
  await refreshLevel(req.user.id);
  const { tasks } = await computeTasks(req.user.id);
  res.json({
    ok: true, already: false, reward, tasks,
    remaining: Math.max(0, GREET_DAILY_LIMIT - todayRows[0].n - 1),
  });
}));

// ---------- 好友沙盤巡訪 ----------
app.post('/api/sandbox/visit/:userId', requireUser, wrap(async (req, res) => {
  const host = Number(req.params.userId);
  if (!Number.isFinite(host)) return res.status(400).json({ error: 'bad_id' });
  if (host === Number(req.user.id)) return res.status(400).json({ error: 'self_visit' });
  const { rows: users } = await query('SELECT id, onboarded FROM users WHERE id=$1', [host]);
  if (!users[0] || !users[0].onboarded) return res.status(404).json({ error: 'not_found' });

  const { rows: friendRows } = await query(
    `SELECT 1 FROM friendships
      WHERE status='accepted'
        AND requester_id = LEAST($1::bigint,$2::bigint)
        AND addressee_id = GREATEST($1::bigint,$2::bigint)`,
    [req.user.id, host]
  );
  const isFriend = Boolean(friendRows[0]);

  const { day } = await todayKey();
  const ins = await query(
    `INSERT INTO sandbox_visits (visitor_id, host_id, day) VALUES ($1,$2,$3::date)
     ON CONFLICT DO NOTHING RETURNING id`,
    [req.user.id, host, day]
  );
  const already = ins.rowCount === 0;
  let reward = { xp: 0, coins: 0 };
  if (!already && isFriend) {
    reward = await recordEvent(req.user.id, 'visit', String(host));
    await refreshLevel(req.user.id);
  }
  const { tasks } = await computeTasks(req.user.id);
  res.json({ ok: true, isFriend, already, reward, tasks });
}));

// ---------- 好友與社團 ----------
app.use('/api', messagesRouter);
app.use('/api', createActivitiesRouter({ requireUser, requireAdmin }));
app.use('/api', communityRouter);

app.use((req, res) => res.status(404).json({ error: 'not_found' }));
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[macao-city] listening on 127.0.0.1:${PORT} base=${BASE_URL}`);
});

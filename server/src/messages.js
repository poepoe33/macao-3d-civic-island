import express from 'express';
import { query } from './db.js';

export const messagesRouter = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const requireUser = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  if (req.user.banned) return res.status(403).json({ error: 'banned' });
  next();
};

const MAX_BODY = 500;

// 私訊發送頻率限制：每人每分鐘最多 20 則
const sendLog = new Map();
function allowSend(userId) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const hits = (sendLog.get(userId) || []).filter((t) => t > windowStart);
  if (hits.length >= 20) {
    sendLog.set(userId, hits);
    return false;
  }
  hits.push(now);
  sendLog.set(userId, hits);
  return true;
}

function messageRow(m, me) {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.created_at,
    mine: Number(m.from_user_id) === Number(me),
  };
}

// ---------- 會話列表（含未讀數） ----------
messagesRouter.get('/messages', requireUser, wrap(async (req, res) => {
  const me = req.user.id;
  const { rows } = await query(
    `WITH paired AS (
       SELECT id, from_user_id, to_user_id, body, created_at,
              CASE WHEN from_user_id = $1 THEN to_user_id ELSE from_user_id END AS other_id
         FROM messages
        WHERE from_user_id = $1 OR to_user_id = $1
     ),
     latest AS (
       SELECT DISTINCT ON (other_id) other_id, body, created_at, from_user_id
         FROM paired ORDER BY other_id, created_at DESC
     ),
     unread AS (
       SELECT from_user_id AS other_id, count(*)::int AS n
         FROM messages WHERE to_user_id = $1 AND read_at IS NULL
        GROUP BY from_user_id
     )
     SELECT l.other_id, l.body, l.created_at, l.from_user_id,
            u.nickname, u.name, u.avatar_emoji, u.level,
            COALESCE(un.n, 0) AS unread
       FROM latest l
       JOIN users u ON u.id = l.other_id
       LEFT JOIN unread un ON un.other_id = l.other_id
      ORDER BY l.created_at DESC
      LIMIT 50`,
    [me]
  );
  const unreadTotal = rows.reduce((sum, r) => sum + r.unread, 0);
  res.json({
    unreadTotal,
    conversations: rows.map((r) => ({
      userId: r.other_id,
      nickname: r.nickname || r.name || '市民',
      avatarEmoji: r.avatar_emoji || '🙂',
      level: r.level,
      lastMessage: r.body,
      mine: Number(r.from_user_id) === Number(me),
      unread: r.unread,
      updatedAt: r.created_at,
    })),
  });
}));

// ---------- 與某位市民的對話（讀取時標記已讀） ----------
messagesRouter.get('/messages/:userId', requireUser, wrap(async (req, res) => {
  const other = Number(req.params.userId);
  const me = req.user.id;
  if (!Number.isFinite(other)) return res.status(400).json({ error: 'bad_id' });
  if (other === Number(me)) return res.status(400).json({ error: 'self' });

  const { rows: users } = await query(
    `SELECT id, nickname, name, avatar_emoji, level FROM users WHERE id=$1 AND onboarded`,
    [other]
  );
  if (!users[0]) return res.status(404).json({ error: 'not_found' });

  const { rows } = await query(
    `SELECT id, from_user_id, to_user_id, body, created_at
       FROM messages
      WHERE (from_user_id=$1 AND to_user_id=$2) OR (from_user_id=$2 AND to_user_id=$1)
      ORDER BY created_at ASC
      LIMIT 200`,
    [me, other]
  );
  await query(
    `UPDATE messages SET read_at = now()
      WHERE to_user_id=$1 AND from_user_id=$2 AND read_at IS NULL`,
    [me, other]
  );

  const { rows: friendRows } = await query(
    `SELECT 1 FROM friendships
      WHERE status='accepted'
        AND requester_id = LEAST($1::bigint,$2::bigint)
        AND addressee_id = GREATEST($1::bigint,$2::bigint)`,
    [me, other]
  );

  res.json({
    user: {
      id: users[0].id,
      nickname: users[0].nickname || users[0].name || '市民',
      avatarEmoji: users[0].avatar_emoji || '🙂',
      level: users[0].level,
    },
    isFriend: Boolean(friendRows[0]),
    messages: rows.map((m) => messageRow(m, me)),
  });
}));

// ---------- 發送私訊 ----------
messagesRouter.post('/messages/:userId', requireUser, wrap(async (req, res) => {
  const other = Number(req.params.userId);
  const me = req.user.id;
  if (!Number.isFinite(other)) return res.status(400).json({ error: 'bad_id' });
  if (other === Number(me)) return res.status(400).json({ error: 'self' });

  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'empty' });
  if (body.length > MAX_BODY) return res.status(400).json({ error: 'too_long', max: MAX_BODY });
  if (!allowSend(me)) return res.status(429).json({ error: 'rate_limited' });

  const { rows: users } = await query(
    `SELECT id, banned FROM users WHERE id=$1 AND onboarded`, [other]
  );
  if (!users[0]) return res.status(404).json({ error: 'not_found' });
  if (users[0].banned) return res.status(403).json({ error: 'target_banned' });

  const { rows } = await query(
    `INSERT INTO messages (from_user_id, to_user_id, body) VALUES ($1,$2,$3)
     RETURNING id, from_user_id, to_user_id, body, created_at`,
    [me, other, body]
  );
  res.json({ ok: true, message: messageRow(rows[0], me) });
}));

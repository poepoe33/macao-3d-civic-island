import express from 'express';
import { pool, query } from './db.js';
import { refreshLevel } from './tasks.js';

export const communityRouter = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const requireUser = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  next();
};

const requireOnboarded = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  if (!req.user.onboarded) return res.status(400).json({ error: 'not_onboarded' });
  next();
};

const GUILD_ICONS = ['🏙', '🏛', '🎡', '🚝', '🌉', '🏖', '🎓', '🌳', '⚓', '🏮'];
const GUILD_TARGET_MIN = 400;
const GUILD_TARGET_PER_MEMBER = 120;
const GUILD_REWARD_COINS = 80;
const GUILD_REWARD_XP = 40;

const WEEK_START_SQL = `date_trunc('week', now() AT TIME ZONE 'Asia/Macau') AT TIME ZONE 'Asia/Macau'`;

function memberCard(row) {
  return {
    id: row.id,
    nickname: row.nickname || row.name || '市民',
    avatarUrl: row.avatar_url,
    level: row.level,
    districtId: row.district_id,
    districtName: row.district_name,
    districtIcon: row.district_icon,
    buildings: row.buildings,
    weeklyXp: row.weekly_xp,
    role: row.role,
  };
}

// ---------- 市民搜尋 ----------
communityRouter.get('/users/search', requireOnboarded, wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ users: [] });
  const { rows } = await query(
    `SELECT u.id, u.nickname, u.name, u.avatar_url, u.level,
            d.name AS district_name, d.icon AS district_icon,
            f.status AS friend_status, f.requester_id
       FROM users u
       LEFT JOIN districts d ON d.id = u.district_id
       LEFT JOIN friendships f
         ON f.status IN ('pending','accepted')
        AND f.requester_id = LEAST($1::bigint, u.id)
        AND f.addressee_id = GREATEST($1::bigint, u.id)
      WHERE u.onboarded AND u.id <> $1
        AND (u.nickname ILIKE '%' || $2 || '%' OR u.name ILIKE '%' || $2 || '%')
      ORDER BY (u.nickname = $2) DESC, u.level DESC, u.id
      LIMIT 10`,
    [req.user.id, q]
  );
  res.json({
    users: rows.map((u) => ({
      id: u.id,
      nickname: u.nickname || u.name || '市民',
      avatarUrl: u.avatar_url,
      level: u.level,
      districtName: u.district_name,
      districtIcon: u.district_icon,
      relation: u.friend_status === 'accepted' ? 'friend'
        : u.friend_status === 'pending' ? (Number(u.requester_id) === Number(req.user.id) ? 'sent' : 'incoming')
          : 'none',
    })),
  });
}));

// ---------- 好友 ----------
communityRouter.get('/friends', requireUser, wrap(async (req, res) => {
  const me = req.user.id;
  const { rows: friends } = await query(
    `SELECT u.id, u.nickname, u.name, u.avatar_url, u.level,
            d.name AS district_name, d.icon AS district_icon,
            (SELECT count(*)::int FROM user_buildings b WHERE b.user_id = u.id) AS buildings
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
       LEFT JOIN districts d ON d.id = u.district_id
      WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)
      ORDER BY u.level DESC, u.id`,
    [me]
  );
  const { rows: incoming } = await query(
    `SELECT f.id AS request_id, u.id, u.nickname, u.name, u.avatar_url, u.level,
            d.name AS district_name, d.icon AS district_icon
       FROM friendships f
       JOIN users u ON u.id = f.requester_id
       LEFT JOIN districts d ON d.id = u.district_id
      WHERE f.status = 'pending' AND f.addressee_id = $1
      ORDER BY f.created_at DESC`,
    [me]
  );
  const { rows: outgoing } = await query(
    `SELECT f.id AS request_id, u.id, u.nickname, u.name, u.avatar_url, u.level
       FROM friendships f
       JOIN users u ON u.id = f.addressee_id
      WHERE f.status = 'pending' AND f.requester_id = $1
      ORDER BY f.created_at DESC`,
    [me]
  );
  const card = (u) => ({
    id: u.id,
    nickname: u.nickname || u.name || '市民',
    avatarUrl: u.avatar_url,
    level: u.level,
    districtName: u.district_name || null,
    districtIcon: u.district_icon || null,
    buildings: u.buildings !== undefined ? u.buildings : undefined,
  });
  res.json({
    friends: friends.map(card),
    incoming: incoming.map((u) => ({ ...card(u), requestId: u.request_id })),
    outgoing: outgoing.map((u) => ({ ...card(u), requestId: u.request_id })),
  });
}));

communityRouter.post('/friends/request', requireOnboarded, wrap(async (req, res) => {
  const target = Number(req.body.userId);
  if (!Number.isFinite(target) || target === Number(req.user.id)) return res.status(400).json({ error: 'bad_target' });
  const { rows: users } = await query('SELECT id, onboarded FROM users WHERE id=$1', [target]);
  if (!users[0] || !users[0].onboarded) return res.status(404).json({ error: 'not_found' });

  const lo = Math.min(req.user.id, target);
  const hi = Math.max(req.user.id, target);
  const { rows: existing } = await query(
    'SELECT id, status, requester_id FROM friendships WHERE requester_id=$1 AND addressee_id=$2',
    [lo, hi]
  );
  if (existing[0]) {
    if (existing[0].status === 'accepted') return res.status(409).json({ error: 'already_friends' });
    if (Number(existing[0].requester_id) === Number(req.user.id)) return res.status(409).json({ error: 'already_requested' });
    await query(
      `UPDATE friendships SET status='accepted', responded_at=now() WHERE id=$1`,
      [existing[0].id]
    );
    return res.json({ ok: true, autoAccepted: true });
  }
  await query(
    `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1,$2,'pending')`,
    [req.user.id, target]
  );
  res.json({ ok: true, autoAccepted: false });
}));

communityRouter.post('/friends/respond', requireOnboarded, wrap(async (req, res) => {
  const id = Number(req.body.requestId);
  const accept = Boolean(req.body.accept);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_request' });
  const { rows } = await query(
    `SELECT id FROM friendships WHERE id=$1 AND addressee_id=$2 AND status='pending'`,
    [id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  if (accept) {
    await query(`UPDATE friendships SET status='accepted', responded_at=now() WHERE id=$1`, [id]);
  } else {
    await query('DELETE FROM friendships WHERE id=$1', [id]);
  }
  res.json({ ok: true });
}));

communityRouter.post('/friends/remove', requireOnboarded, wrap(async (req, res) => {
  const target = Number(req.body.userId);
  if (!Number.isFinite(target)) return res.status(400).json({ error: 'bad_target' });
  await query(
    `DELETE FROM friendships
      WHERE status IN ('pending','accepted')
        AND requester_id = LEAST($1::bigint, $2::bigint)
        AND addressee_id = GREATEST($1::bigint, $2::bigint)`,
    [req.user.id, target]
  );
  res.json({ ok: true });
}));

// ---------- 社團 ----------
communityRouter.get('/guilds', requireUser, wrap(async (req, res) => {
  const me = req.user.id;
  const { rows: mine } = await query(
    'SELECT guild_id, role FROM guild_members WHERE user_id=$1',
    [me]
  );
  const { rows } = await query(
    `SELECT g.id, g.name, g.icon, g.description, g.created_at,
            count(m.user_id)::int AS members,
            COALESCE(sum(w.xp), 0)::int AS weekly_xp,
            COALESCE(sum(v.vitality), 0)::int AS vitality
       FROM guilds g
       LEFT JOIN guild_members m ON m.guild_id = g.id
       LEFT JOIN LATERAL (
         SELECT COALESCE(sum(e.xp), 0) AS xp FROM events e
          WHERE e.user_id = m.user_id AND e.created_at >= ${WEEK_START_SQL}
       ) w ON TRUE
       LEFT JOIN LATERAL (
         SELECT COALESCE(sum(b.vitality), 0) AS vitality FROM user_buildings b
          WHERE b.user_id = m.user_id
       ) v ON TRUE
      GROUP BY g.id
      ORDER BY vitality DESC, weekly_xp DESC, g.id
      LIMIT 20`
  );
  res.json({
    myGuildId: mine[0] ? mine[0].guild_id : null,
    myRole: mine[0] ? mine[0].role : null,
    guilds: rows.map((g) => {
      const target = Math.max(GUILD_TARGET_MIN, GUILD_TARGET_PER_MEMBER * g.members);
      return {
        id: g.id,
        name: g.name,
        icon: g.icon,
        description: g.description,
        members: g.members,
        weeklyXp: g.weekly_xp,
        vitality: g.vitality,
        target,
      };
    }),
  });
}));

communityRouter.get('/guilds/:id', requireUser, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });
  const { rows: gRows } = await query(
    'SELECT id, name, icon, description, owner_id FROM guilds WHERE id=$1',
    [id]
  );
  if (!gRows[0]) return res.status(404).json({ error: 'not_found' });
  const { rows: members } = await query(
    `SELECT u.id, u.nickname, u.name, u.avatar_url, u.level, u.district_id,
            d.name AS district_name, d.icon AS district_icon,
            m.role,
            (SELECT count(*)::int FROM user_buildings b WHERE b.user_id = u.id) AS buildings,
            (SELECT COALESCE(sum(e.xp), 0)::int FROM events e
              WHERE e.user_id = u.id AND e.created_at >= ${WEEK_START_SQL}) AS weekly_xp
       FROM guild_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN districts d ON d.id = u.district_id
      WHERE m.guild_id = $1
      ORDER BY (m.role = 'owner') DESC, weekly_xp DESC, u.id`,
    [id]
  );
  const target = Math.max(GUILD_TARGET_MIN, GUILD_TARGET_PER_MEMBER * members.length);
  const weeklyXp = members.reduce((sum, m) => sum + m.weekly_xp, 0);
  const { rows: claims } = await query(
    `SELECT claimed_at FROM guild_claims WHERE guild_id=$1 AND week_start = ${WEEK_START_SQL}::date`,
    [id]
  );
  const myRole = members.find((m) => Number(m.id) === Number(req.user.id)) || null;
  res.json({
    guild: { id: gRows[0].id, name: gRows[0].name, icon: gRows[0].icon, description: gRows[0].description },
    members: members.map(memberCard),
    weeklyXp,
    target,
    claimed: Boolean(claims[0]),
    claimedAt: claims[0] ? claims[0].claimed_at : null,
    myRole: myRole ? myRole.role : null,
    rewardCoins: GUILD_REWARD_COINS,
    rewardXp: GUILD_REWARD_XP,
  });
}));

communityRouter.post('/guilds', requireOnboarded, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 24);
  const icon = String(req.body.icon || '🏙');
  const description = String(req.body.description || '').trim().slice(0, 200);
  if (name.length < 2) return res.status(400).json({ error: 'bad_name' });
  if (req.user.level < 2) return res.status(403).json({ error: 'level_too_low' });

  const { rows: mine } = await query('SELECT guild_id FROM guild_members WHERE user_id=$1', [req.user.id]);
  if (mine[0]) return res.status(409).json({ error: 'already_in_guild' });

  const client = await pool.connect();
  let guildId;
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      'INSERT INTO guilds (name, icon, description, owner_id) VALUES ($1,$2,$3,$4) RETURNING id',
      [name, GUILD_ICONS.includes(icon) ? icon : '🏙', description, req.user.id]
    );
    guildId = ins.rows[0].id;
    await client.query(
      `INSERT INTO guild_members (guild_id, user_id, role) VALUES ($1,$2,'owner')`,
      [guildId, req.user.id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505' || err.code === '23P01') {
      return res.status(409).json({ error: err.constraint === 'guild_members_user_idx' ? 'already_in_guild' : 'name_taken' });
    }
    throw err;
  } finally {
    client.release();
  }
  res.json({ ok: true, id: guildId });
}));

communityRouter.post('/guilds/:id/join', requireOnboarded, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });
  const { rows: g } = await query('SELECT id FROM guilds WHERE id=$1', [id]);
  if (!g[0]) return res.status(404).json({ error: 'not_found' });
  const { rows: mine } = await query('SELECT guild_id FROM guild_members WHERE user_id=$1', [req.user.id]);
  if (mine[0]) {
    return res.status(409).json({ error: Number(mine[0].guild_id) === id ? 'already_member' : 'already_in_guild' });
  }
  try {
    await query(`INSERT INTO guild_members (guild_id, user_id, role) VALUES ($1,$2,'member')`, [id, req.user.id]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'already_in_guild' });
    throw err;
  }
  res.json({ ok: true });
}));

communityRouter.post('/guilds/leave', requireOnboarded, wrap(async (req, res) => {
  const { rows: mine } = await query(
    'SELECT guild_id, role FROM guild_members WHERE user_id=$1',
    [req.user.id]
  );
  if (!mine[0]) return res.status(404).json({ error: 'not_member' });
  const guildId = mine[0].guild_id;
  await query('DELETE FROM guild_members WHERE guild_id=$1 AND user_id=$2', [guildId, req.user.id]);

  const { rows: rest } = await query(
    'SELECT user_id FROM guild_members WHERE guild_id=$1 ORDER BY joined_at, user_id LIMIT 1',
    [guildId]
  );
  if (!rest[0]) {
    await query('DELETE FROM guilds WHERE id=$1', [guildId]);
  } else if (mine[0].role === 'owner') {
    await query(`UPDATE guild_members SET role='owner' WHERE guild_id=$1 AND user_id=$2`, [guildId, rest[0].user_id]);
    await query('UPDATE guilds SET owner_id=$2 WHERE id=$1', [guildId, rest[0].user_id]);
  }
  res.json({ ok: true });
}));

communityRouter.post('/guilds/:id/claim', requireOnboarded, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });

  const { rows: memberRows } = await query(
    `SELECT u.id, u.level FROM guild_members m JOIN users u ON u.id = m.user_id WHERE m.guild_id=$1`,
    [id]
  );
  if (!memberRows.length) return res.status(404).json({ error: 'not_found' });
  if (!memberRows.some((m) => Number(m.id) === Number(req.user.id))) return res.status(403).json({ error: 'not_member' });

  const target = Math.max(GUILD_TARGET_MIN, GUILD_TARGET_PER_MEMBER * memberRows.length);
  const { rows: xpRows } = await query(
    `SELECT COALESCE(sum(e.xp), 0)::int AS xp FROM events e
      JOIN guild_members m ON m.user_id = e.user_id
     WHERE m.guild_id=$1 AND e.created_at >= ${WEEK_START_SQL}`,
    [id]
  );
  if (xpRows[0].xp < target) {
    return res.status(400).json({ error: 'goal_not_reached', weeklyXp: xpRows[0].xp, target });
  }
  try {
    await query(
      `INSERT INTO guild_claims (guild_id, week_start, claimed_by) VALUES ($1, ${WEEK_START_SQL}::date, $2)`,
      [id, req.user.id]
    );
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'already_claimed' });
    throw err;
  }

  const ids = memberRows.map((m) => m.id);
  await query(
    'UPDATE users SET coins = coins + $2, xp = xp + $3 WHERE id = ANY($1::bigint[])',
    [ids, GUILD_REWARD_COINS, GUILD_REWARD_XP]
  );
  await query(
    `INSERT INTO events (user_id, type, ref_id, xp, coins)
     SELECT unnest($1::bigint[]), 'guild_reward', $2, $3, $4`,
    [ids, String(id), GUILD_REWARD_XP, GUILD_REWARD_COINS]
  );
  await Promise.all(ids.map((memberId) => refreshLevel(memberId).catch(() => null)));
  res.json({ ok: true, coins: GUILD_REWARD_COINS, xp: GUILD_REWARD_XP, members: ids.length });
}));

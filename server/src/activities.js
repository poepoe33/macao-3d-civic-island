import express from 'express';
import { pool, query } from './db.js';
import { computeTasks, refreshLevel } from './tasks.js';

export const ACTIVITY_CATEGORIES = [
  { key: 'community', name: '社區共融', icon: '🏘' },
  { key: 'culture', name: '文化藝術', icon: '🎭' },
  { key: 'sports', name: '體育康樂', icon: '🏃' },
  { key: 'environment', name: '環保綠化', icon: '🌿' },
  { key: 'tech', name: '智慧城市', icon: '🤖' },
  { key: 'festival', name: '節慶慶典', icon: '🎉' },
];

export const ACTIVITY_STATUSES = ['draft', 'published', 'cancelled', 'finished'];

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createActivitiesRouter({ requireUser, requireAdmin }) {
  const router = express.Router();

  const onboarded = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (req.user.banned) return res.status(403).json({ error: 'banned' });
    if (!req.user.onboarded) return res.status(400).json({ error: 'not_onboarded' });
    next();
  };

  function parseActivity(body) {
    const title = String(body.title || '').trim().slice(0, 60);
    const description = String(body.description || '').trim().slice(0, 1000);
    const category = ACTIVITY_CATEGORIES.some((c) => c.key === body.category) ? body.category : 'community';
    const districtId = body.districtId ? String(body.districtId) : null;
    const location = String(body.location || '').trim().slice(0, 80);
    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    const capacityRaw = Number(body.capacity);
    const capacity = Number.isFinite(capacityRaw) && capacityRaw > 0 ? Math.min(5000, Math.round(capacityRaw)) : null;
    const rewardCoins = Math.min(500, Math.max(0, Math.round(Number(body.rewardCoins) || 0)));
    const rewardXp = Math.min(500, Math.max(0, Math.round(Number(body.rewardXp) || 0)));
    const status = ACTIVITY_STATUSES.includes(body.status) ? body.status : 'draft';

    if (title.length < 2) return { error: 'title_too_short' };
    if (description.length < 4) return { error: 'description_too_short' };
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return { error: 'bad_time' };
    if (endAt <= startAt) return { error: 'bad_time_range' };

    return {
      value: { title, description, category, districtId, location, startAt, endAt, capacity, rewardCoins, rewardXp, status },
    };
  }

  async function loadActivity(id, userId) {
    const { rows } = await query(
      `SELECT a.*, d.name AS district_name, d.icon AS district_icon,
              (SELECT count(*)::int FROM activity_signups s
                WHERE s.activity_id = a.id AND s.status = 'going') AS going_count,
              (SELECT count(*)::int FROM activity_signups s
                WHERE s.activity_id = a.id AND s.checked_in_at IS NOT NULL) AS checked_count,
              (SELECT count(*)::int FROM activity_signups s
                WHERE s.activity_id = a.id AND s.user_id = $2) AS mine_rows,
              (SELECT s.status FROM activity_signups s
                WHERE s.activity_id = a.id AND s.user_id = $2) AS my_status,
              (SELECT s.checked_in_at FROM activity_signups s
                WHERE s.activity_id = a.id AND s.user_id = $2) AS my_checkin
         FROM activities a
         LEFT JOIN districts d ON d.id = a.district_id
        WHERE a.id = $1`,
      [id, userId || 0]
    );
    return rows[0] || null;
  }

  function card(a, userId) {
    return {
      id: a.id,
      title: a.title,
      category: a.category,
      categoryName: (ACTIVITY_CATEGORIES.find((c) => c.key === a.category) || ACTIVITY_CATEGORIES[0]).name,
      categoryIcon: (ACTIVITY_CATEGORIES.find((c) => c.key === a.category) || ACTIVITY_CATEGORIES[0]).icon,
      description: a.description,
      districtId: a.district_id,
      districtName: a.district_name,
      districtIcon: a.district_icon,
      location: a.location,
      startAt: a.start_at,
      endAt: a.end_at,
      capacity: a.capacity,
      rewardCoins: a.reward_coins,
      rewardXp: a.reward_xp,
      status: a.status,
      goingCount: a.going_count,
      checkedCount: a.checked_count,
      myStatus: a.my_status || null,
      myCheckedIn: Boolean(a.my_checkin),
      createdBy: a.created_by,
      createdAt: a.created_at,
    };
  }

  // ---------- 公開：活動列表 ----------
  router.get('/activities', wrap(async (req, res) => {
    const includeAll = req.query.all === '1';
    const userId = req.user ? req.user.id : 0;
    const category = String(req.query.category || '');
    const params = [userId];
    let where = `a.status = 'published' AND a.end_at > now()`;
    if (includeAll) where = `a.status <> 'draft' AND a.end_at > now() - interval '30 days'`;
    if (category && ACTIVITY_CATEGORIES.some((c) => c.key === category)) {
      params.push(category);
      where += ` AND a.category = $${params.length}`;
    }
    const { rows } = await query(
      `SELECT a.*, d.name AS district_name, d.icon AS district_icon,
              (SELECT count(*)::int FROM activity_signups s
                WHERE s.activity_id = a.id AND s.status = 'going') AS going_count,
              (SELECT count(*)::int FROM activity_signups s
                WHERE s.activity_id = a.id AND s.checked_in_at IS NOT NULL) AS checked_count,
              (SELECT s.status FROM activity_signups s
                WHERE s.activity_id = a.id AND s.user_id = $1) AS my_status,
              (SELECT s.checked_in_at FROM activity_signups s
                WHERE s.activity_id = a.id AND s.user_id = $1) AS my_checkin
         FROM activities a
         LEFT JOIN districts d ON d.id = a.district_id
        WHERE ${where}
        ORDER BY a.start_at ASC
        LIMIT 60`,
      params
    );
    res.json({
      categories: ACTIVITY_CATEGORIES,
      activities: rows.map((a) => card(a, userId)),
    });
  }));

  // ---------- 公開：活動詳情 ----------
  router.get('/activities/:id', wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });
    const userId = req.user ? req.user.id : 0;
    const a = await loadActivity(id, userId);
    if (!a) return res.status(404).json({ error: 'not_found' });
    const isAdmin = Boolean(req.user) && (req.user.role === 'admin'
      || String(req.user.email || '').toLowerCase() === String(process.env.ADMIN_EMAIL || 'paul.ccp@gmail.com').toLowerCase());
    if (a.status === 'draft' && !isAdmin) return res.status(404).json({ error: 'not_found' });

    let signups = null;
    if (isAdmin) {
      const { rows } = await query(
        `SELECT s.user_id, s.status, s.checked_in_at, s.created_at,
                u.nickname, u.name, u.avatar_emoji, u.level
           FROM activity_signups s JOIN users u ON u.id = s.user_id
          WHERE s.activity_id=$1
          ORDER BY s.checked_in_at DESC NULLS LAST, s.created_at`,
        [id]
      );
      signups = rows.map((r) => ({
        userId: r.user_id,
        nickname: r.nickname || r.name || '市民',
        avatarEmoji: r.avatar_emoji || '🙂',
        level: r.level,
        status: r.status,
        checkedInAt: r.checked_in_at,
        joinedAt: r.created_at,
      }));
    }
    const mine = a.mine_rows > 0 ? 'joined' : null;
    res.json({ activity: card(a, userId), mySignup: a.my_status ? { status: a.my_status, checkedIn: Boolean(a.my_checkin) } : null, signups, mine });
  }));

  // ---------- 報名 ----------
  router.post('/activities/:id/signup', onboarded, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });
    const a = await loadActivity(id, req.user.id);
    if (!a || a.status !== 'published') return res.status(404).json({ error: 'not_found' });
    if (new Date(a.end_at) <= new Date()) return res.status(400).json({ error: 'ended' });
    if (a.capacity && a.going_count >= a.capacity) return res.status(409).json({ error: 'full' });

    const existing = await query(
      `SELECT status FROM activity_signups WHERE activity_id=$1 AND user_id=$2`,
      [id, req.user.id]
    );
    if (existing.rows[0] && existing.rows[0].status === 'going') {
      return res.json({ ok: true, already: true });
    }
    await query(
      `INSERT INTO activity_signups (activity_id, user_id, status, checked_in_at)
       VALUES ($1,$2,'going',NULL)
       ON CONFLICT (activity_id, user_id)
       DO UPDATE SET status='going', checked_in_at=NULL, created_at=now()`,
      [id, req.user.id]
    );
    res.json({ ok: true, already: false });
  }));

  // ---------- 取消報名 ----------
  router.post('/activities/:id/cancel', onboarded, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });
    const { rows } = await query(
      `SELECT checked_in_at FROM activity_signups WHERE activity_id=$1 AND user_id=$2`,
      [id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_signed_up' });
    if (rows[0].checked_in_at) return res.status(400).json({ error: 'already_checked_in' });
    await query(
      `UPDATE activity_signups SET status='cancelled' WHERE activity_id=$1 AND user_id=$2`,
      [id, req.user.id]
    );
    res.json({ ok: true });
  }));

  // ---------- 現場簽到（發放獎勵） ----------
  router.post('/activities/:id/checkin', onboarded, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });
    const a = await loadActivity(id, req.user.id);
    if (!a || a.status !== 'published') return res.status(404).json({ error: 'not_found' });

    const now = Date.now();
    const start = new Date(a.start_at).getTime();
    const end = new Date(a.end_at).getTime();
    if (now < start - 30 * 60_000) return res.status(400).json({ error: 'too_early' });
    if (now > end) return res.status(400).json({ error: 'ended' });
    if (!a.my_status || a.my_status !== 'going') return res.status(400).json({ error: 'not_signed_up' });
    if (a.my_checkin) return res.json({ ok: true, already: true, rewardCoins: 0, rewardXp: 0 });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const upd = await client.query(
        `UPDATE activity_signups SET checked_in_at = now()
          WHERE activity_id=$1 AND user_id=$2 AND checked_in_at IS NULL AND status='going'
          RETURNING activity_id`,
        [id, req.user.id]
      );
      if (upd.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.json({ ok: true, already: true, rewardCoins: 0, rewardXp: 0 });
      }
      await client.query(
        `INSERT INTO events (user_id, type, ref_id, xp, coins) VALUES ($1,'activity',$2,$3,$4)`,
        [req.user.id, String(id), a.reward_xp, a.reward_coins]
      );
      await client.query(
        `UPDATE users SET xp = xp + $2, coins = coins + $3 WHERE id=$1`,
        [req.user.id, a.reward_xp, a.reward_coins]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await refreshLevel(req.user.id);
    const { tasks } = await computeTasks(req.user.id);
    res.json({ ok: true, already: false, rewardCoins: a.reward_coins, rewardXp: a.reward_xp, tasks });
  }));

  // ---------- 管理員：活動列表（含草稿） ----------
  router.get('/admin/activities', requireAdmin, wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT a.*, d.name AS district_name, d.icon AS district_icon,
              (SELECT count(*)::int FROM activity_signups s
                WHERE s.activity_id = a.id AND s.status = 'going') AS going_count,
              (SELECT count(*)::int FROM activity_signups s
                WHERE s.activity_id = a.id AND s.checked_in_at IS NOT NULL) AS checked_count,
              u.nickname AS creator_nickname
         FROM activities a
         LEFT JOIN districts d ON d.id = a.district_id
         LEFT JOIN users u ON u.id = a.created_by
        ORDER BY a.start_at DESC
        LIMIT 100`
    );
    res.json({
      categories: ACTIVITY_CATEGORIES,
      statuses: ACTIVITY_STATUSES,
      activities: rows.map((a) => ({ ...card(a, 0), creatorNickname: a.creator_nickname })),
    });
  }));

  // ---------- 管理員：建立活動 ----------
  router.post('/admin/activities', requireAdmin, wrap(async (req, res) => {
    const parsed = parseActivity(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const v = parsed.value;
    if (v.districtId) {
      const { rows } = await query('SELECT id FROM districts WHERE id=$1', [v.districtId]);
      if (!rows[0]) return res.status(400).json({ error: 'bad_district' });
    }
    const { rows } = await query(
      `INSERT INTO activities
         (title, description, category, district_id, location, start_at, end_at,
          capacity, reward_coins, reward_xp, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [v.title, v.description, v.category, v.districtId, v.location, v.startAt, v.endAt,
        v.capacity, v.rewardCoins, v.rewardXp, v.status, req.user.id]
    );
    res.json({ ok: true, activity: card(rows[0], req.user.id) });
  }));

  // ---------- 管理員：更新活動 ----------
  router.post('/admin/activities/:id', requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });
    const existing = await loadActivity(id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const parsed = parseActivity({ ...existing, ...req.body,
      startAt: req.body.startAt || existing.start_at,
      endAt: req.body.endAt || existing.end_at,
      districtId: req.body.districtId !== undefined ? req.body.districtId : existing.district_id,
      rewardCoins: req.body.rewardCoins !== undefined ? req.body.rewardCoins : existing.reward_coins,
      rewardXp: req.body.rewardXp !== undefined ? req.body.rewardXp : existing.reward_xp,
      capacity: req.body.capacity !== undefined ? req.body.capacity : existing.capacity,
      status: req.body.status || existing.status });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const v = parsed.value;
    if (v.districtId) {
      const { rows: ds } = await query('SELECT id FROM districts WHERE id=$1', [v.districtId]);
      if (!ds[0]) return res.status(400).json({ error: 'bad_district' });
    }
    const { rows } = await query(
      `UPDATE activities SET title=$2, description=$3, category=$4, district_id=$5,
              location=$6, start_at=$7, end_at=$8, capacity=$9, reward_coins=$10,
              reward_xp=$11, status=$12
        WHERE id=$1 RETURNING *`,
      [id, v.title, v.description, v.category, v.districtId, v.location, v.startAt, v.endAt,
        v.capacity, v.rewardCoins, v.rewardXp, v.status]
    );
    res.json({ ok: true, activity: card(rows[0], req.user.id) });
  }));

  // ---------- 管理員：變更狀態 ----------
  router.post('/admin/activities/:id/status', requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const status = String(req.body.status || '');
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });
    if (!ACTIVITY_STATUSES.includes(status)) return res.status(400).json({ error: 'bad_status' });
    const { rows } = await query(
      `UPDATE activities SET status=$2 WHERE id=$1 RETURNING id, status`, [id, status]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, id: rows[0].id, status: rows[0].status });
  }));

  // ---------- 管理員：刪除活動 ----------
  router.delete('/admin/activities/:id', requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });
    const { rowCount } = await query('DELETE FROM activities WHERE id=$1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  }));

  return router;
}

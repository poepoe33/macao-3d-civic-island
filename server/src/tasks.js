import { pool, query } from './db.js';

export const TZ = 'Asia/Macau';

// 等級門檻與稱號：完成任務與探索逐步升級
const LEVEL_TABLE = [
  { level: 1, xp: 0, title: '城市觀察員' },
  { level: 2, xp: 60, title: '城市觀察員' },
  { level: 3, xp: 160, title: '規劃見習生' },
  { level: 4, xp: 320, title: '規劃見習生' },
  { level: 5, xp: 540, title: '社區設計師' },
  { level: 6, xp: 820, title: '社區設計師' },
  { level: 7, xp: 1200, title: '澳門城市大使' },
  { level: 8, xp: 1700, title: '澳門城市大使' },
  { level: 9, xp: 2400, title: '澳門共創夥伴' },
  { level: 10, xp: 3300, title: '澳門共創夥伴' },
];

export function levelInfo(xp) {
  let cur = LEVEL_TABLE[0];
  for (const row of LEVEL_TABLE) if (xp >= row.xp) cur = row;
  const idx = LEVEL_TABLE.indexOf(cur);
  const next = LEVEL_TABLE[idx + 1] || null;
  return {
    level: cur.level,
    title: cur.title,
    xp,
    levelStartXp: cur.xp,
    nextLevelXp: next ? next.xp : null,
    progress: next ? Math.min(1, (xp - cur.xp) / (next.xp - cur.xp)) : 1,
  };
}

// 每日任務池：依日期輪換 3 項
const TASK_POOL = [
  { key: 'explore3', title: '探索 3 個地標', type: 'discover', goal: 3, xp: 40, coins: 25 },
  { key: 'vote2', title: '參與 2 次提案投票', type: 'vote', goal: 2, xp: 20, coins: 15 },
  { key: 'tide1', title: '模擬 1 次內港潮位防洪', type: 'tide', goal: 1, xp: 25, coins: 15 },
  { key: 'fireworks1', title: '施放 1 次旅遊塔煙花', type: 'fireworks', goal: 1, xp: 20, coins: 12 },
  { key: 'lrt1', title: '搭乘 1 次輕軌跟車視角', type: 'lrt', goal: 1, xp: 20, coins: 12 },
  { key: 'lightshow1', title: '點亮 1 次大三巴光雕', type: 'lightshow', goal: 1, xp: 20, coins: 12 },
  { key: 'proposal1', title: '提交 1 個城市提案', type: 'proposal', goal: 1, xp: 35, coins: 25 },
  { key: 'island4', title: '瀏覽 4 個不同分區', type: 'island', goal: 4, xp: 25, coins: 15 },
];

export async function todayKey() {
  const { rows } = await query(`SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS day, extract(doy from (now() AT TIME ZONE $1)::date)::int AS doy`, [TZ]);
  return rows[0];
}

export function tasksForDay(doy) {
  const start = (doy * 3) % TASK_POOL.length;
  return [0, 1, 2].map((i) => TASK_POOL[(start + i) % TASK_POOL.length]);
}

// 事件獎勵規則（含每日上限）
const EVENT_RULES = {
  discover: { xp: 12, coins: 8, dailyCap: 50 },
  island: { xp: 3, coins: 1, dailyCap: 12 },
  vote: { xp: 6, coins: 3, dailyCap: 8 },
  proposal: { xp: 30, coins: 20, dailyCap: 3 },
  tide: { xp: 6, coins: 3, dailyCap: 3 },
  fireworks: { xp: 6, coins: 3, dailyCap: 3 },
  lrt: { xp: 6, coins: 3, dailyCap: 3 },
  lightshow: { xp: 6, coins: 3, dailyCap: 3 },
};

/**
 * 依今日事件結算每日任務，回傳任務進度清單。
 * 任務達標時自動發放獎勵（task_completions 主鍵去重）。
 */
export async function computeTasks(userId) {
  const { day, doy } = await todayKey();
  const defs = tasksForDay(doy);

  const { rows: eventRows } = await query(
    `SELECT type, count(*)::int AS n FROM events
      WHERE user_id = $1 AND (created_at AT TIME ZONE $2)::date = $3::date
      GROUP BY type`,
    [userId, TZ, day]
  );
  const counts = Object.fromEntries(eventRows.map((r) => [r.type, r.n]));

  const { rows: doneRows } = await query(
    `SELECT task_key FROM task_completions WHERE user_id = $1 AND day = $2::date`,
    [userId, day]
  );
  const done = new Set(doneRows.map((r) => r.task_key));

  const result = [];
  for (const def of defs) {
    const progress = Math.min(counts[def.type] || 0, def.goal);
    const completed = progress >= def.goal;
    let justCompleted = false;

    if (completed && !done.has(def.key)) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const ins = await client.query(
          `INSERT INTO task_completions (user_id, task_key, day, xp, coins)
           VALUES ($1,$2,$3::date,$4,$5)
           ON CONFLICT DO NOTHING RETURNING task_key`,
          [userId, def.key, day, def.xp, def.coins]
        );
        if (ins.rowCount > 0) {
          await client.query(`INSERT INTO events (user_id, type, ref_id, xp, coins) VALUES ($1,'task',$2,$3,$4)`,
            [userId, def.key, def.xp, def.coins]);
          await client.query(`UPDATE users SET xp = xp + $2, coins = coins + $3 WHERE id = $1`,
            [userId, def.xp, def.coins]);
          justCompleted = true;
        }
        await client.query('COMMIT');
        done.add(def.key);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('[tasks] completion failed', err);
      } finally {
        client.release();
      }
    }

    result.push({ ...def, progress, completed, justCompleted });
  }
  return { day, tasks: result };
}

export async function recordEvent(userId, type, refId) {
  const rule = EVENT_RULES[type];
  if (!rule) return { ok: false, reason: 'unknown_type' };

  const { day } = await todayKey();
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM events
      WHERE user_id=$1 AND type=$2 AND (created_at AT TIME ZONE $3)::date = $4::date`,
    [userId, type, TZ, day]
  );
  if (rows[0].n >= rule.dailyCap) {
    return { ok: true, capped: true, xp: 0, coins: 0 };
  }

  await query(`INSERT INTO events (user_id, type, ref_id, xp, coins) VALUES ($1,$2,$3,$4,$5)`,
    [userId, type, refId || null, rule.xp, rule.coins]);
  await query(`UPDATE users SET xp = xp + $2, coins = coins + $3 WHERE id = $1`,
    [userId, rule.xp, rule.coins]);

  return { ok: true, xp: rule.xp, coins: rule.coins };
}

export async function refreshLevel(userId) {
  const { rows } = await query(`SELECT xp FROM users WHERE id=$1`, [userId]);
  if (!rows[0]) return null;
  const info = levelInfo(rows[0].xp);
  await query(`UPDATE users SET level=$2 WHERE id=$1 AND level<>$2`, [userId, info.level]);
  return info;
}

// 每日首次活動：連續登入計算
export async function touchStreak(userId) {
  const { day } = await todayKey();
  const { rows } = await query(
    `SELECT streak_days, to_char(last_active_on, 'YYYY-MM-DD') AS last_on,
            (last_active_on = ($2::date - 1)) AS is_yesterday
       FROM users WHERE id=$1`,
    [userId, day]
  );
  if (!rows[0]) return { streak: 0, bonus: 0 };
  const rec = rows[0];
  if (rec.last_on === day) return { streak: rec.streak_days, bonus: 0 };

  const streak = rec.is_yesterday ? rec.streak_days + 1 : 1;
  const bonus = Math.min(streak * 2, 20);
  await query(
    `UPDATE users SET streak_days=$2, last_active_on=$3::date, coins=coins+$4 WHERE id=$1`,
    [userId, streak, day, bonus]
  );
  await query(`INSERT INTO events (user_id, type, ref_id, xp, coins) VALUES ($1,'streak',$2,0,$3)`,
    [userId, String(streak), bonus]);
  return { streak, bonus };
}

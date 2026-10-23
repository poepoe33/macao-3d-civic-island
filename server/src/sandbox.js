// 分區建設沙盤：設施目錄、槽位與活力值計算

export const SLOT_COUNT = 12;
export const DEMOLISH_REFUND_RATE = 0.4;

export const BUILDING_CATALOG = [
  { type: 'park', name: '社區公園', icon: '🌳', cost: 120, vitality: 8, level: 1, desc: '綠化休憩空間，提升居民生活質素。' },
  { type: 'busstop', name: '智慧巴士站', icon: '🚌', cost: 90, vitality: 6, level: 1, desc: '實時到站資訊，改善跨區通勤。' },
  { type: 'garden', name: '屋頂花園', icon: '🌺', cost: 140, vitality: 7, level: 1, desc: '降溫兼提供社區農圃。' },
  { type: 'bike', name: '單車徑', icon: '🚲', cost: 150, vitality: 7, level: 2, desc: '低碳出行，連接海濱與社區。' },
  { type: 'market', name: '文創市集', icon: '🎪', cost: 200, vitality: 10, level: 2, desc: '本地手作與小食攤位，帶動人流。' },
  { type: 'solar', name: '太陽能遮陽棚', icon: '☀️', cost: 180, vitality: 8, level: 2, desc: '防晒發電，配合防災與氣候目標。' },
  { type: 'clinic', name: '社區衛生站', icon: '🏥', cost: 220, vitality: 9, level: 3, desc: '基層醫療與長者健康服務。' },
  { type: 'housing', name: '公共房屋', icon: '🏢', cost: 260, vitality: 12, level: 3, desc: '增加居住供應，提升分區活力。' },
  { type: 'library', name: '社區圖書館', icon: '📚', cost: 300, vitality: 12, level: 4, desc: '自修室與親子閱讀空間。' },
  { type: 'pier', name: '海濱步道', icon: '🌊', cost: 240, vitality: 10, level: 5, desc: '親水休憩與防洪展示兼備。' },
];

export const CATALOG_MAP = new Map(BUILDING_CATALOG.map((b) => [b.type, b]));

// 分區活力值排行：建設 + 市民點讚 + 地標探索
export async function districtVitality(query, limit = 8) {
  const { rows } = await query(
    `SELECT d.id, d.name, d.icon,
            COALESCE(b.vitality, 0)::int AS build_vitality,
            COALESCE(l.likes, 0)::int AS likes,
            COALESCE(ds.found, 0)::int AS discoveries,
            (COALESCE(b.vitality, 0) + COALESCE(l.likes, 0) * 2 + COALESCE(ds.found, 0))::int AS vitality
       FROM districts d
       LEFT JOIN (SELECT district_id, sum(vitality)::int AS vitality FROM user_buildings GROUP BY district_id) b ON b.district_id = d.id
       LEFT JOIN (SELECT u.district_id, count(*)::int AS likes FROM sandbox_likes sl JOIN users u ON u.id = sl.owner_id GROUP BY u.district_id) l ON l.district_id = d.id
       LEFT JOIN (SELECT l2.district_id, count(*)::int AS found FROM discoveries dd JOIN landmarks l2 ON l2.id = dd.landmark_id GROUP BY l2.district_id) ds ON ds.district_id = d.id
      WHERE COALESCE(b.vitality, 0) + COALESCE(l.likes, 0) * 2 + COALESCE(ds.found, 0) > 0
      ORDER BY vitality DESC, d.code
      LIMIT $1`,
    [limit]
  );
  return rows;
}

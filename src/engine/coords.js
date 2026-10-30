import * as THREE from "three";

// =========================================================================
// 2. 世界佈局常數與座標換算（23 細分地理方格：R=1.62, SPACING=1.84 零重疊精準拼圖）
// =========================================================================
export const R = 1.62;
export const SPACING = 1.84;
export const SCALE_R = R / 2.02;
export const TOP = 0.65;
export const WATER_Y = -0.18;

export function axialToWorld(q, r) {
  const x = Math.sqrt(3) * SPACING * (q + r / 2);
  const z = 1.5 * SPACING * r;
  return new THREE.Vector3(x, 0, z);
}

// 6 個 pointy-top 相鄰方向 (q, r) 與對應邊索引（引擎對外契約的一部分，main 目前未用到，留給相鄰圖邏輯）
export const HEX_DIRS = [
  { dq: 1, dr: 0, angle: 0 },
  { dq: 0, dr: 1, angle: Math.PI / 3 },
  { dq: -1, dr: 1, angle: (2 * Math.PI) / 3 },
  { dq: -1, dr: 0, angle: Math.PI },
  { dq: 0, dr: -1, angle: (4 * Math.PI) / 3 },
  { dq: 1, dr: -1, angle: (5 * Math.PI) / 3 }
];

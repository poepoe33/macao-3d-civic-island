import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { PALETTE } from "./palette.js";
import { ARCHETYPE_LIB } from "./world-data.js";
import { haltMissingExternalData } from "./halt.js";

// =========================================================================
// 5. 建物實例化「零件庫」(Kit) 與 20 種細項＋澳門地標立體場景模型 Archetypes
// =========================================================================
export let cachedKitGeos = null;
export function createKitGeometries() {
  if (cachedKitGeos) return cachedKitGeos;
  const hipGeo = new THREE.ConeGeometry(0.72, 1, 4);
  hipGeo.rotateY(Math.PI / 4);

  const prismGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 3);
  prismGeo.rotateY(Math.PI / 6);

  cachedKitGeos = {
    box: new THREE.BoxGeometry(1, 1, 1),
    rbox: new RoundedBoxGeometry(1, 1, 1, 2, 0.12),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
    cone: new THREE.ConeGeometry(0.5, 1, 14),
    sphere: new THREE.SphereGeometry(0.5, 14, 12),
    ico: new THREE.IcosahedronGeometry(0.5, 1),
    dome: new THREE.SphereGeometry(0.5, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    torus: new THREE.TorusGeometry(0.36, 0.12, 10, 18),
    prism: prismGeo,
    hip: hipGeo,
    glowbox: new THREE.BoxGeometry(1, 1, 1),
    glowsphere: new THREE.SphereGeometry(0.5, 12, 10)
  };
  return cachedKitGeos;
}

// 在單位空間（底面 ±0.5、高 0–1.6）回傳指定 model 種類的零件清單
// 造型資料查表：src/world/archetypes.json；程式碼只剩「取表 + 換分區主題色」。
// meta.default 對應原先 switch 的 default 分支（globe），未知 model 的行為不變。
export const THEME_TOKEN = ARCHETYPE_LIB.meta.themeToken;
export function getArchetypeParts(modelKind, themeHex = PALETTE.coral) {
  const rec = ARCHETYPE_LIB.models[modelKind] || ARCHETYPE_LIB.models[ARCHETYPE_LIB.meta.default];
  if (!rec) haltMissingExternalData(`零件表缺少 ${ARCHETYPE_LIB.meta.default} 條目`, "src/world/archetypes.json");
  return rec.map((p) => (p.color === THEME_TOKEN ? { ...p, color: themeHex } : { ...p }));
}

// 樹種零件查表：src/world/trees.json；meta.defaultTree 對應原先的 else 分支樣式
export function getIslandTreeParts(treeType) {
  const rec = ARCHETYPE_LIB.trees[treeType] || ARCHETYPE_LIB.trees[ARCHETYPE_LIB.meta.defaultTree];
  if (!rec) haltMissingExternalData(`樹種表缺少 ${ARCHETYPE_LIB.meta.defaultTree} 條目`, "src/world/trees.json");
  return rec.map((p) => ({ ...p }));
}

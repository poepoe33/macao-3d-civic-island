// 引擎層模組（由 src/main.js 拆出）；打包後與 main 同一作用域，見 scripts/build.mjs。
import * as THREE from "three";
import { WATER_Y } from "../coords.js";

// =========================================================================
// 2 & 5. 澳門 12 真實地理分區方格、四條跨海大橋 3D 模型、輕軌列車、煙花與防洪閘門系統
// =========================================================================
export function createHexRingGeometry(innerR, outerR, y = 0) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    const x = Math.cos(a) * outerR;
    const z = Math.sin(a) * outerR;
    if (i === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  }
  shape.closePath();

  const hole = new THREE.Path();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    const x = Math.cos(a) * innerR;
    const z = Math.sin(a) * innerR;
    if (i === 0) hole.moveTo(x, z);
    else hole.lineTo(x, z);
  }
  hole.closePath();
  shape.holes.push(hole);

  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2);
  if (y !== 0) geo.translate(0, y, 0);
  return geo;
}

// 建立海圖經緯度地理方格網 (Cartographic Geographic Grid)
export function buildGeographicMapGrid(scene, cityCenter) {
  const geoGridGroup = new THREE.Group();
  const gridY = WATER_Y + 0.014;

  const minorPts = [];
  const majorPts = [];
  const minX = -12.2;
  const maxX = 8.6;
  const minZ = -13.2;
  const maxZ = 13.6;
  const step = 1.60;

  let colIdx = 0;
  for (let x = minX; x <= maxX + 0.01; x += step) {
    const targetArr = colIdx % 2 === 0 ? majorPts : minorPts;
    targetArr.push(new THREE.Vector3(x, gridY, minZ), new THREE.Vector3(x, gridY, maxZ));
    colIdx++;
  }

  let rowIdx = 0;
  for (let z = minZ; z <= maxZ + 0.01; z += step) {
    const targetArr = rowIdx % 2 === 0 ? majorPts : minorPts;
    targetArr.push(new THREE.Vector3(minX, gridY, z), new THREE.Vector3(maxX, gridY, z));
    rowIdx++;
  }

  const minorGeo = new THREE.BufferGeometry().setFromPoints(minorPts);
  const minorMat = new THREE.LineBasicMaterial({
    color: 0x007562,
    transparent: true,
    opacity: 0.16,
    depthWrite: false
  });
  geoGridGroup.add(new THREE.LineSegments(minorGeo, minorMat));

  const majorGeo = new THREE.BufferGeometry().setFromPoints(majorPts);
  const majorMat = new THREE.LineBasicMaterial({
    color: 0x005a4b,
    transparent: true,
    opacity: 0.32,
    depthWrite: false
  });
  geoGridGroup.add(new THREE.LineSegments(majorGeo, majorMat));

  // 外框經緯度刻度邊框
  const borderPts = [
    new THREE.Vector3(minX, gridY + 0.004, minZ),
    new THREE.Vector3(maxX, gridY + 0.004, minZ),
    new THREE.Vector3(maxX, gridY + 0.004, minZ),
    new THREE.Vector3(maxX, gridY + 0.004, maxZ),
    new THREE.Vector3(maxX, gridY + 0.004, maxZ),
    new THREE.Vector3(minX, gridY + 0.004, maxZ),
    new THREE.Vector3(minX, gridY + 0.004, maxZ),
    new THREE.Vector3(minX, gridY + 0.004, minZ)
  ];
  const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
  const borderMat = new THREE.LineBasicMaterial({
    color: 0xdb6a41,
    transparent: true,
    opacity: 0.42,
    depthWrite: false
  });
  geoGridGroup.add(new THREE.LineSegments(borderGeo, borderMat));

  // 十字準星交點小標記
  const crossPts = [];
  for (let x = minX; x <= maxX + 0.01; x += step * 2) {
    for (let z = minZ; z <= maxZ + 0.01; z += step * 2) {
      crossPts.push(
        new THREE.Vector3(x - 0.14, gridY + 0.005, z),
        new THREE.Vector3(x + 0.14, gridY + 0.005, z),
        new THREE.Vector3(x, gridY + 0.005, z - 0.14),
        new THREE.Vector3(x, gridY + 0.005, z + 0.14)
      );
    }
  }
  const crossGeo = new THREE.BufferGeometry().setFromPoints(crossPts);
  const crossMat = new THREE.LineBasicMaterial({
    color: 0xdb6a41,
    transparent: true,
    opacity: 0.45,
    depthWrite: false
  });
  geoGridGroup.add(new THREE.LineSegments(crossGeo, crossMat));

  scene.add(geoGridGroup);

  // 經緯度與地理分區海圖座標點（供 CSS2D 顯示）
  const coordMarkers = [
    { label: "22°13'N · 青茂・關閘・黑沙環", labelEn: "22°13'N · Qingmao & Border Gate", x: minX + 1.8, z: -11.0 },
    { label: "22°12'N · 筷子基・高士德・松山", labelEn: "22°12'N · Fai Chi Kei & Guia", x: minX + 1.8, z: -8.28 },
    { label: "22°11'N · 大三巴・議事亭・新口岸", labelEn: "22°11'N · St. Paul's & Senado", x: minX + 1.8, z: -5.52 },
    { label: "22°10'N · 媽閣旅遊塔・南灣亞馬喇", labelEn: "22°10'N · Barra & Nam Van", x: minX + 1.8, z: -2.76 },
    { label: "22°09'N · 氹仔四區（海洋・中心・官也・北安）", labelEn: "22°09'N · Taipa 4 Sub-Zones", x: minX + 2.1, z: 2.76 },
    { label: "22°08'N · 橫琴澳大・路氹東西區", labelEn: "22°08'N · Hengqin UM & Cotai", x: minX + 1.8, z: 5.52 },
    { label: "22°06'N · 石排灣・路環・黑沙九澳", labelEn: "22°06'N · Coloane & Hac Sa", x: minX + 1.8, z: 11.04 },
    { label: "113°32'E", labelEn: "113°32'E", x: -7.5, z: maxZ - 0.45 },
    { label: "113°33'E", labelEn: "113°33'E", x: -3.2, z: maxZ - 0.45 },
    { label: "113°34'E", labelEn: "113°34'E", x: 1.2, z: maxZ - 0.45 },
    { label: "113°35'E · 新城A區・人工島", labelEn: "113°35'E · Zone A & HZMB Port", x: 5.8, z: -6.4 }
  ];

  return { geoGridGroup, coordMarkers };
}

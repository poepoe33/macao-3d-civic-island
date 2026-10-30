// 引擎層模組（由 src/main.js 拆出）；打包後與 main 同一作用域，見 scripts/build.mjs。
import * as THREE from "three";
import { DATA } from "../world-data.js";
import { PALETTE } from "../palette.js";
import { R, SPACING, SCALE_R, TOP, WATER_Y, axialToWorld } from "../coords.js";
import { mulberry32 } from "../rng.js";
import { createKitGeometries, getArchetypeParts, getIslandTreeParts } from "../kit.js";
import { createGroundTexture, createRimPatternTexture, createLightPoolTexture } from "../textures.js";
import { createHexRingGeometry, buildGeographicMapGrid } from "./grid.js";

export function buildArchipelagoAndKit(scene, wallWaterMat, cityCenter) {
  const rng = mulberry32(DATA.seed + 303);
  const groundTextures = {
    calcada: createGroundTexture("calcada", 5),
    brick: createGroundTexture("brick", 11),
    speckle: createGroundTexture("speckle", 22),
    stripe: createGroundTexture("stripe", 33)
  };
  const lightPoolTex = createLightPoolTexture();

  const { geoGridGroup, coordMarkers } = buildGeographicMapGrid(scene, cityCenter || new THREE.Vector3());

  const islandMap = new Map();
  const bridgeMap = new Map();
  const itemMap = new Map();
  const islandMeshes = [];
  const nightAdditiveMeshes = [];
  const kitEntries = [];

  // Dijkstra 路網節點與邊
  const graphNodes = new Map();
  const graphAdj = new Map();

  function addGraphNode(id, pos, islandId) {
    graphNodes.set(id, { id, pos: pos.clone(), islandId });
    if (!graphAdj.has(id)) graphAdj.set(id, []);
  }

  function addGraphEdge(a, b, weightScale = 1.0) {
    const na = graphNodes.get(a);
    const nb = graphNodes.get(b);
    if (!na || !nb) return;
    const w = na.pos.distanceTo(nb.pos) * weightScale;
    graphAdj.get(a).push({ to: b, weight: w });
    graphAdj.get(b).push({ to: a, weight: w });
  }

  const tmpMat4 = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpEuler = new THREE.Euler();
  const tmpScale = new THREE.Vector3();

  function pushKitPart(kind, wx, wy, wz, sx, sy, sz, colorHex, rx = 0, ry = 0, rz = 0, meta = {}) {
    const jitter = 1 + (rng() * 2 - 1) * 0.0072;
    tmpPos.set(wx, wy, wz);
    tmpEuler.set(rx, ry, rz, "YXZ");
    tmpQuat.setFromEuler(tmpEuler);
    tmpScale.set(sx * jitter, sy * jitter, sz * jitter);
    tmpMat4.compose(tmpPos, tmpQuat, tmpScale);

    kitEntries.push({
      kind,
      matrix: tmpMat4.clone(),
      baseColor: new THREE.Color(colorHex),
      islandId: meta.islandId || null,
      itemId: meta.itemId || null,
      bridgeId: meta.bridgeId || null,
      isSmallProp: !!meta.isSmallProp,
      isRuins: !!meta.isRuins
    });
  }

  function placeArchetypeModel(modelKind, worldCenter, scale, rotY, themeHex, meta) {
    const parts = getArchetypeParts(modelKind, themeHex);
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);

    let maxY = 0;
    for (const p of parts) {
      const lx = p.px * scale;
      const lz = p.pz * scale;
      const rx = lx * cosY + lz * sinY;
      const rz = -lx * sinY + lz * cosY;
      const wy = worldCenter.y + p.py * scale;
      const topY = wy + (p.sy * scale) * 0.5;
      if (topY > maxY) maxY = topY;

      pushKitPart(
        p.kind,
        worldCenter.x + rx,
        wy,
        worldCenter.z + rz,
        p.sx * scale,
        p.sy * scale,
        p.sz * scale,
        p.color,
        p.rx || 0,
        (p.ry || 0) + rotY,
        p.rz || 0,
        { ...meta, isRuins: modelKind === "ruins" }
      );
    }
    return maxY;
  }

  // 共用幾何與材質（依 R = 1.62 細分地理方格等比例縮放，確保零重疊）
  const walkRingGeo = createHexRingGeometry(1.52 * SCALE_R, 1.80 * SCALE_R, TOP + 0.006);
  const walkRingMat = new THREE.MeshStandardMaterial({
    color: 0xe6d2bc,
    roughness: 0.9,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  const curbRingGeo = createHexRingGeometry(R - 0.10, R - 0.02, TOP + 0.008);
  const curbRingMat = new THREE.MeshStandardMaterial({
    color: 0xe4d6c3,
    roughness: 0.86,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  const shallowRingGeo = createHexRingGeometry(R - 0.02, R + 0.38, WATER_Y + 0.005);
  const shallowRingMat = new THREE.MeshBasicMaterial({
    color: 0xb8e2e6,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  const foamRingGeo = createHexRingGeometry(R + 0.01, R + 0.12, WATER_Y + 0.012);
  const foamRingMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });

  const sideWallHeight = TOP - WATER_Y;
  const sideWallGeo = new THREE.CylinderGeometry(R - 0.02, R + 0.06, sideWallHeight, 6, 1, true);
  sideWallGeo.rotateY(Math.PI / 6);

  const rimBandGeo = new THREE.CylinderGeometry(R - 0.015, R - 0.015, 0.16, 6, 1, true);
  rimBandGeo.rotateY(Math.PI / 6);

  const lightPoolGeo = new THREE.PlaneGeometry(0.95, 0.95);
  lightPoolGeo.rotateX(-Math.PI / 2);

  // 建立 12 座澳門地理分區島
  DATA.islands.forEach((isl, idx) => {
    const center = axialToWorld(isl.q, isl.r);
    isl.worldPos = center.clone();
    islandMap.set(isl.id, isl);

    const topGeo = new THREE.CircleGeometry(R - 0.05, 6);
    topGeo.rotateZ(Math.PI / 6);
    topGeo.rotateX(-Math.PI / 2);
    const pos = topGeo.attributes.position;
    const uv = topGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const wx = center.x + pos.getX(i);
      const wz = center.z + pos.getZ(i);
      uv.setXY(i, wx / 2.2, wz / 2.2);
    }
    uv.needsUpdate = true;

    const topMat = new THREE.MeshStandardMaterial({
      roughness: 0.92,
      metalness: 0,
      map: groundTextures[isl.groundType] || groundTextures.brick
    });
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.position.set(center.x, TOP, center.z);
    topMesh.receiveShadow = true;
    topMesh.userData = { islandId: isl.id };
    scene.add(topMesh);
    islandMeshes.push(topMesh);

    const walkMesh = new THREE.Mesh(walkRingGeo, walkRingMat);
    walkMesh.position.set(center.x, 0, center.z);
    walkMesh.receiveShadow = true;
    walkMesh.userData = { islandId: isl.id };
    scene.add(walkMesh);
    islandMeshes.push(walkMesh);

    const curbMesh = new THREE.Mesh(curbRingGeo, curbRingMat);
    curbMesh.position.set(center.x, 0, center.z);
    curbMesh.receiveShadow = true;
    curbMesh.userData = { islandId: isl.id };
    scene.add(curbMesh);

    const wallMesh = new THREE.Mesh(sideWallGeo, wallWaterMat);
    wallMesh.position.set(center.x, WATER_Y + sideWallHeight * 0.5, center.z);
    wallMesh.userData = { islandId: isl.id };
    scene.add(wallMesh);
    islandMeshes.push(wallMesh);

    const rimTex = createRimPatternTexture(isl.color, idx);
    const rimMat = new THREE.MeshStandardMaterial({
      map: rimTex,
      roughness: 0.82,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const rimMesh = new THREE.Mesh(rimBandGeo, rimMat);
    rimMesh.position.set(center.x, TOP - 0.08, center.z);
    rimMesh.userData = { islandId: isl.id };
    scene.add(rimMesh);

    const shMesh = new THREE.Mesh(shallowRingGeo, shallowRingMat);
    shMesh.position.set(center.x, 0, center.z);
    scene.add(shMesh);

    const fmMesh = new THREE.Mesh(foamRingGeo, foamRingMat);
    fmMesh.position.set(center.x, 0, center.z);
    scene.add(fmMesh);

    // 建立每島 12 個行人路網節點（依 SCALE_R 等比縮放）
    const walkR = 1.66 * SCALE_R;
    const verts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      verts.push(new THREE.Vector3(center.x + Math.cos(a) * walkR, TOP, center.z + Math.sin(a) * walkR));
    }
    for (let i = 0; i < 6; i++) {
      const vId = `${isl.id}_v${i}`;
      const mId = `${isl.id}_m${i}`;
      const nextV = verts[(i + 1) % 6];
      const mid = verts[i].clone().add(nextV).multiplyScalar(0.5);
      addGraphNode(vId, verts[i], isl.id);
      addGraphNode(mId, mid, isl.id);
    }
    for (let i = 0; i < 6; i++) {
      const vId = `${isl.id}_v${i}`;
      const mId = `${isl.id}_m${i}`;
      const nextVId = `${isl.id}_v${(i + 1) % 6}`;
      addGraphEdge(vId, mId);
      addGraphEdge(mId, nextVId);
    }

    // 六角形頂點路燈 + 夜晚光池 + 島緣串燈
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      const lx = center.x + Math.cos(a) * (1.82 * SCALE_R);
      const lz = center.z + Math.sin(a) * (1.82 * SCALE_R);
      pushKitPart("cylinder", lx, TOP + 0.16, lz, 0.036, 0.32, 0.036, PALETTE.ink, 0, 0, 0, { islandId: isl.id, isSmallProp: true });
      pushKitPart("glowsphere", lx, TOP + 0.35, lz, 0.095, 0.095, 0.095, PALETTE.glow, 0, 0, 0, { islandId: isl.id });

      const poolMat = new THREE.MeshBasicMaterial({
        map: lightPoolTex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const poolMesh = new THREE.Mesh(lightPoolGeo, poolMat);
      poolMesh.scale.set(0.82, 1, 0.82);
      poolMesh.position.set(lx, TOP + 0.012, lz);
      scene.add(poolMesh);
      nightAdditiveMeshes.push({ mesh: poolMesh, maxOpacity: 0.72 });

      const nextA = ((i + 1) * Math.PI) / 3 + Math.PI / 6;
      const mx = center.x + (Math.cos(a) + Math.cos(nextA)) * 0.5 * (1.84 * SCALE_R);
      const mz = center.z + (Math.sin(a) + Math.sin(nextA)) * 0.5 * (1.84 * SCALE_R);
      pushKitPart("glowsphere", mx, TOP - 0.02, mz, 0.052, 0.052, 0.052, PALETTE.glow, 0, 0, 0, { islandId: isl.id, isSmallProp: true });

      const px = center.x + (Math.cos(a) * 0.65 + Math.cos(nextA) * 0.35) * (1.78 * SCALE_R);
      const pz = center.z + (Math.sin(a) * 0.65 + Math.sin(nextA) * 0.35) * (1.78 * SCALE_R);
      pushKitPart("rbox", px, TOP + 0.035, pz, 0.13, 0.07, 0.08, PALETTE.wood, 0, a, 0, { islandId: isl.id, isSmallProp: true });
      pushKitPart("ico", px, TOP + 0.095, pz, 0.11, 0.10, 0.11, PALETTE.plant1, 0, 0, 0, { islandId: isl.id, isSmallProp: true });
      pushKitPart("sphere", px, TOP + 0.145, pz, 0.05, 0.05, 0.05, i % 2 === 0 ? PALETTE.coral : PALETTE.yellow, 0, 0, 0, { islandId: isl.id, isSmallProp: true });
    }

    // 外圈 5 棵大樹
    const treeAngles = [0.35, 1.45, 2.55, 3.85, 5.15];
    treeAngles.forEach((ta, tIdx) => {
      const trRad = (1.42 + (tIdx % 2) * 0.10) * SCALE_R;
      const tx = center.x + Math.cos(ta) * trRad;
      const tz = center.z + Math.sin(ta) * trRad;
      const treeParts = getIslandTreeParts(isl.treeType);
      const sc = (0.46 + (rng() * 0.10)) * 0.86;
      treeParts.forEach((tp) => {
        pushKitPart(
          tp.kind,
          tx + tp.px * sc,
          TOP + tp.py * sc,
          tz + tp.pz * sc,
          tp.sx * sc,
          tp.sy * sc,
          tp.sz * sc,
          tp.color,
          tp.rx || 0,
          tp.ry || 0,
          tp.rz || 0,
          { islandId: isl.id }
        );
      });
    });

    // 島內長椅小物件
    const benchOffsets = [[-0.78 * SCALE_R, -0.45 * SCALE_R], [0.78 * SCALE_R, -0.45 * SCALE_R]];
    benchOffsets.forEach(([bx, bz]) => {
      pushKitPart("rbox", center.x + bx, TOP + 0.045, center.z + bz, 0.18, 0.055, 0.08, PALETTE.wood, 0, 0.4, 0, { islandId: isl.id, isSmallProp: true });
    });

    // 主建物放在 (0, -0.58 * SCALE_R)
    const mainWorldPos = new THREE.Vector3(center.x, TOP, center.z - 0.58 * SCALE_R);
    placeArchetypeModel(isl.mainModel || "townhall", mainWorldPos, 0.72, 0, isl.color, {
      islandId: isl.id,
      itemId: null
    });

    const spillMat = new THREE.MeshBasicMaterial({
      map: lightPoolTex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const spillMesh = new THREE.Mesh(lightPoolGeo, spillMat);
    spillMesh.scale.set(1.02, 1, 0.75);
    spillMesh.position.set(center.x, TOP + 0.011, center.z - 0.15);
    scene.add(spillMesh);
    nightAdditiveMeshes.push({ mesh: spillMesh, maxOpacity: 0.58 });

    // 其餘細項（依 SCALE_R 精緻配置於六角島內）
    const items = isl.items || [];
    const count = items.length;
    const cellSize = THREE.MathUtils.clamp((0.62 - Math.max(0, count - 3) * 0.04) * 0.84, 0.39, 0.52);

    const candidateSlots = [
      [-0.58 * SCALE_R, 0.22 * SCALE_R],
      [0.58 * SCALE_R, 0.22 * SCALE_R],
      [0.0, 0.72 * SCALE_R],
      [-0.64 * SCALE_R, 0.82 * SCALE_R],
      [0.64 * SCALE_R, 0.82 * SCALE_R],
      [-0.92 * SCALE_R, -0.15 * SCALE_R],
      [0.92 * SCALE_R, -0.15 * SCALE_R]
    ];

    items.forEach((item, iIdx) => {
      const slot = candidateSlots[iIdx % candidateSlots.length];
      const itemWorldPos = new THREE.Vector3(center.x + slot[0], TOP, center.z + slot[1]);
      const topY = placeArchetypeModel(item.model, itemWorldPos, cellSize, (iIdx % 2 === 0 ? 0.12 : -0.12), isl.color, {
        islandId: isl.id,
        itemId: item.id
      });

      item.islandId = isl.id;
      item.islandCode = isl.code;
      item.islandName = isl.name;
      item.islandNameEn = isl.nameEn;
      item.indexInIsland = iIdx + 1;
      item.worldPos = itemWorldPos.clone();
      item.topY = topY;
      itemMap.set(item.id, item);
    });
  });

  // 輔助函式：尋找某島嶼上最接近目標點的步道節點 ID
  function findClosestIslandNodeId(islandId, targetPt) {
    let bestId = `${islandId}_m0`;
    let bestD = Infinity;
    for (let i = 0; i < 6; i++) {
      for (const prefix of ["m", "v"]) {
        const nid = `${islandId}_${prefix}${i}`;
        const node = graphNodes.get(nid);
        if (node) {
          const d = node.pos.distanceTo(targetPt);
          if (d < bestD) {
            bestD = d;
            bestId = nid;
          }
        }
      }
    }
    return bestId;
  }

  // 1. 同一陸塊（澳門半島 11 區內部、氹仔–路氹–路環 9 區內部）相鄰分區陸路連通
  const builtLandPairs = new Set();
  DATA.islands.forEach((islA) => {
    DATA.islands.forEach((islB) => {
      if (islA.id >= islB.id) return;
      if (islA.landmass && islB.landmass && islA.landmass !== islB.landmass) return;
      const centerDist = islA.worldPos.distanceTo(islB.worldPos);
      // R=1.62, SPACING=1.84 時相鄰六角格中心距離為 3.187，設定 <= 3.35 精準連通同陸塊相鄰格
      if (centerDist > 3.35) return;

      const pairKey = `${islA.id}--${islB.id}`;
      if (builtLandPairs.has(pairKey)) return;
      builtLandPairs.add(pairKey);

      const nodeAId = findClosestIslandNodeId(islA.id, islB.worldPos);
      const nodeBId = findClosestIslandNodeId(islB.id, islA.worldPos);
      addGraphEdge(nodeAId, nodeBId);

      const posA = graphNodes.get(nodeAId).pos;
      const posB = graphNodes.get(nodeBId).pos;
      const bridgeVec = posB.clone().sub(posA);
      const angleY = Math.atan2(bridgeVec.x, bridgeVec.z);

      const planks = 7;
      for (let p = 0; p < planks; p++) {
        const t = (p + 0.5) / planks;
        const px = THREE.MathUtils.lerp(posA.x, posB.x, t);
        const pz = THREE.MathUtils.lerp(posA.z, posB.z, t);
        const archH = Math.sin(t * Math.PI) * 0.065;
        const py = TOP + archH;

        pushKitPart("rbox", px, py, pz, 0.36, 0.04, 0.11, PALETTE.wood, 0, angleY, 0, {});
        if (p === 1 || p === 3 || p === 5) {
          const perpX = Math.cos(angleY) * 0.17;
          const perpZ = -Math.sin(angleY) * 0.17;
          pushKitPart("cylinder", px + perpX, py + 0.055, pz + perpZ, 0.026, 0.11, 0.026, PALETTE.eaves, 0, 0, 0, { isSmallProp: true });
          pushKitPart("cylinder", px - perpX, py + 0.055, pz - perpZ, 0.026, 0.11, 0.026, PALETTE.eaves, 0, 0, 0, { isSmallProp: true });
        }
      }
    });
  });

  // =====================================================================
  // 2. 建構澳門四條跨海大橋 + 兩條跨水道連接橋 (西灣大橋、嘉樂庇總督大橋、友誼大橋、澳門大橋)
  // =====================================================================
  const stayCablePoints = [];
  const bridgeVehicles = [];

  (DATA.bridgesMeta || []).forEach((bm, bIdx) => {
    const fromIsl = islandMap.get(bm.from);
    const toIsl = islandMap.get(bm.to);
    if (!fromIsl || !toIsl) return;

    const startPt = new THREE.Vector3(
      fromIsl.worldPos.x + (bm.fromOffset ? bm.fromOffset[0] : 0),
      TOP + 0.02,
      fromIsl.worldPos.z + (bm.fromOffset ? bm.fromOffset[1] : 0)
    );
    const endPt = new THREE.Vector3(
      toIsl.worldPos.x + (bm.toOffset ? bm.toOffset[0] : 0),
      TOP + 0.02,
      toIsl.worldPos.z + (bm.toOffset ? bm.toOffset[1] : 0)
    );

    const spanVec = endPt.clone().sub(startPt);
    const spanLen = spanVec.length();
    const angleY = Math.atan2(spanVec.x, spanVec.z);
    const perpX = Math.cos(angleY);
    const perpZ = -Math.sin(angleY);

    const archH = bm.archHeight || 0.44;
    const ctrl1 = startPt.clone().lerp(endPt, 0.28);
    ctrl1.y = TOP + archH * 0.78;
    const midPt = startPt.clone().lerp(endPt, 0.50);
    midPt.y = TOP + archH;
    const ctrl2 = startPt.clone().lerp(endPt, 0.72);
    ctrl2.y = TOP + archH * 0.78;

    // 友誼大橋與澳門大橋略帶真實海灣微弧曲線
    if (bm.style === "amizade") {
      ctrl1.x += 0.22;
      midPt.x += 0.28;
      ctrl2.x += 0.18;
    } else if (bm.style === "macau") {
      ctrl1.x += 0.16;
      midPt.x += 0.22;
      ctrl2.x += 0.14;
    }

    const bridgeCurve = new THREE.CatmullRomCurve3([startPt, ctrl1, midPt, ctrl2, endPt]);
    bm.curve = bridgeCurve;
    bm.midWorldPos = midPt.clone();
    bridgeMap.set(bm.id, bm);

    // 將跨海大橋納入 Dijkstra 路網（切分 6 個橋面節點），讓小人與協作線直接走上四條跨海大橋！
    const startNodeId = findClosestIslandNodeId(fromIsl.id, startPt);
    const endNodeId = findClosestIslandNodeId(toIsl.id, endPt);
    let prevNId = startNodeId;
    const bridgeNodeSteps = 6;
    for (let s = 1; s <= bridgeNodeSteps; s++) {
      const u = s / (bridgeNodeSteps + 1);
      const pt = bridgeCurve.getPoint(u);
      const bnId = `${bm.id}_node_${s}`;
      addGraphNode(bnId, pt, null);
      addGraphEdge(prevNId, bnId, 0.85);
      prevNId = bnId;
    }
    addGraphEdge(prevNId, endNodeId, 0.85);

    // 依橋樑類型決定寬度與橋面節數
    const deckWidth =
      bm.style === "macau" ? 0.50 :
      bm.style === "saivan" ? 0.44 :
      bm.style === "amizade" ? 0.38 :
      bm.style === "carvalho" ? 0.30 : 0.34;

    const segments = Math.max(14, Math.floor(spanLen * 5.2));
    const segLen = (spanLen / segments) * 1.08;
    const metaTag = { bridgeId: bm.id };

    for (let i = 0; i < segments; i++) {
      const u = (i + 0.5) / segments;
      const pt = bridgeCurve.getPoint(u);
      const tan = bridgeCurve.getTangent(u);
      const segYaw = Math.atan2(tan.x, tan.z);
      const segPitch = -Math.asin(THREE.MathUtils.clamp(tan.y, -0.5, 0.5));
      const pX = Math.cos(segYaw);
      const pZ = -Math.sin(segYaw);

      // 主橋面車道甲板
      const deckColor = bm.style === "carvalho" ? "#f4ece1" : "#e5ddd3";
      pushKitPart("rbox", pt.x, pt.y, pt.z, deckWidth, 0.048, segLen, deckColor, segPitch, segYaw, 0, metaTag);

      // 橋面雙向中線與兩側防撞護欄
      const railOffset = deckWidth * 0.46;
      const railColor =
        bm.style === "macau" ? PALETTE.coral :
        bm.style === "saivan" ? PALETTE.teal :
        bm.style === "amizade" ? PALETTE.macaoGreen : PALETTE.cream;

      pushKitPart("box", pt.x + pX * railOffset, pt.y + 0.036, pt.z + pZ * railOffset, 0.028, 0.036, segLen, railColor, segPitch, segYaw, 0, metaTag);
      pushKitPart("box", pt.x - pX * railOffset, pt.y + 0.036, pt.z - pZ * railOffset, 0.028, 0.036, segLen, railColor, segPitch, segYaw, 0, metaTag);

      // 西灣大橋專屬：下層全天候箱樑與輕軌媽閣跨海段透明視窗
      if (bm.style === "saivan") {
        pushKitPart("rbox", pt.x, pt.y - 0.068, pt.z, deckWidth * 0.88, 0.075, segLen, "#d8cfc4", segPitch, segYaw, 0, metaTag);
        if (i % 2 === 0) {
          pushKitPart("glowbox", pt.x, pt.y - 0.068, pt.z, deckWidth * 0.90, 0.032, segLen * 0.55, PALETTE.glow, segPitch, segYaw, 0, metaTag);
        }
      }

      // 嘉樂庇總督大橋專屬：中央駝峰式通航鋼桁拱架 (u = 0.34 ~ 0.66)
      if (bm.style === "carvalho" && u >= 0.34 && u <= 0.66) {
        const archLocal = Math.sin(((u - 0.34) / 0.32) * Math.PI);
        const trussH = 0.14 + archLocal * 0.22;
        pushKitPart("box", pt.x + pX * railOffset, pt.y + trussH * 0.5 + 0.02, pt.z + pZ * railOffset, 0.025, trussH, 0.025, PALETTE.cream, 0, segYaw, 0, metaTag);
        pushKitPart("box", pt.x - pX * railOffset, pt.y + trussH * 0.5 + 0.02, pt.z - pZ * railOffset, 0.025, trussH, 0.025, PALETTE.cream, 0, segYaw, 0, metaTag);
        pushKitPart("box", pt.x, pt.y + trussH + 0.02, pt.z, deckWidth, 0.024, segLen * 0.95, PALETTE.coral, segPitch, segYaw, 0, metaTag);
      }

      // 澳門大橋專屬：八車道外側電單車專用坑道護欄與鋼桁樑拱弦
      if (bm.style === "macau" && u >= 0.18 && u <= 0.82) {
        const trussWave = Math.abs(Math.sin(((u - 0.18) / 0.64) * Math.PI * 3));
        const tH = 0.10 + trussWave * 0.16;
        pushKitPart("box", pt.x + pX * (railOffset * 0.72), pt.y + 0.032, pt.z + pZ * (railOffset * 0.72), 0.018, 0.028, segLen, PALETTE.yellow, segPitch, segYaw, 0, metaTag);
        pushKitPart("box", pt.x - pX * (railOffset * 0.72), pt.y + 0.032, pt.z - pZ * (railOffset * 0.72), 0.018, 0.028, segLen, PALETTE.yellow, segPitch, segYaw, 0, metaTag);
        if (i % 2 === 0) {
          pushKitPart("box", pt.x + pX * railOffset, pt.y + tH * 0.5, pt.z + pZ * railOffset, 0.024, tH, 0.024, PALETTE.coral, 0, segYaw, 0, metaTag);
          pushKitPart("box", pt.x - pX * railOffset, pt.y + tH * 0.5, pt.z - pZ * railOffset, 0.024, tH, 0.024, PALETTE.coral, 0, segYaw, 0, metaTag);
        }
      }

      // 夜間橋面路燈光點
      if (i % 3 === 1) {
        pushKitPart("glowsphere", pt.x + pX * railOffset, pt.y + 0.09, pt.z + pZ * railOffset, 0.048, 0.048, 0.048, PALETTE.glow, 0, 0, 0, metaTag);
        pushKitPart("glowsphere", pt.x - pX * railOffset, pt.y + 0.09, pt.z - pZ * railOffset, 0.048, 0.048, 0.048, PALETTE.glow, 0, 0, 0, metaTag);
      }

      // 水中橋墩 (Piers in Sea Channel)
      if (i > 1 && i < segments - 2 && i % 3 === 0) {
        const pierH = Math.max(0.2, pt.y - WATER_Y);
        const pierY = WATER_Y + pierH * 0.5;
        pushKitPart("rbox", pt.x, WATER_Y + 0.04, pt.z, deckWidth * 1.18, 0.08, 0.22, PALETTE.stone, 0, segYaw, 0, metaTag);
        pushKitPart("cylinder", pt.x + pX * (deckWidth * 0.28), pierY, pt.z + pZ * (deckWidth * 0.28), 0.065, pierH, 0.065, "#d8cec2", 0, 0, 0, metaTag);
        pushKitPart("cylinder", pt.x - pX * (deckWidth * 0.28), pierY, pt.z - pZ * (deckWidth * 0.28), 0.065, pierH, 0.065, "#d8cec2", 0, 0, 0, metaTag);
      }
    }

    // 建立各座跨海大橋標誌性索塔與斜拉鋼索 (Pylons & Stay Cables)
    const towerUs =
      bm.style === "saivan" ? [0.32, 0.68] :
      bm.style === "amizade" ? [0.30, 0.70] :
      bm.style === "macau" ? [0.24, 0.50, 0.76] : [];

    towerUs.forEach((tu) => {
      const tPt = bridgeCurve.getPoint(tu);
      const tTan = bridgeCurve.getTangent(tu);
      const tYaw = Math.atan2(tTan.x, tTan.z);
      const tpX = Math.cos(tYaw);
      const tpZ = -Math.sin(tYaw);

      const towerH =
        bm.style === "amizade" ? 1.38 :
        bm.style === "macau" ? 1.32 : 1.24;
      const totalPylonH = (tPt.y - WATER_Y) + towerH;
      const pylonCenterY = WATER_Y + totalPylonH * 0.5;
      const legOffset = deckWidth * 0.54;

      // 防撞承台島座
      pushKitPart("cylinder", tPt.x, WATER_Y + 0.06, tPt.z, deckWidth * 1.45, 0.12, deckWidth * 1.45, "#d6c7b5", 0, tYaw, 0, metaTag);

      if (bm.style === "amizade") {
        // 友誼大橋：中央雙菱形索塔 + 塔冠紅橫樑
        pushKitPart("rbox", tPt.x + tpX * legOffset, pylonCenterY, tPt.z + tpZ * legOffset, 0.075, totalPylonH, 0.095, PALETTE.guiaWhite, 0, tYaw, 0, metaTag);
        pushKitPart("rbox", tPt.x - tpX * legOffset, pylonCenterY, tPt.z - tpZ * legOffset, 0.075, totalPylonH, 0.095, PALETTE.guiaWhite, 0, tYaw, 0, metaTag);
        pushKitPart("rbox", tPt.x, tPt.y + towerH * 0.78, tPt.z, legOffset * 2.15, 0.065, 0.08, PALETTE.macaoGreen, 0, tYaw, 0, metaTag);
        pushKitPart("rbox", tPt.x, tPt.y + towerH * 0.96, tPt.z, legOffset * 1.85, 0.055, 0.08, PALETTE.coral, 0, tYaw, 0, metaTag);
      } else if (bm.style === "macau") {
        // 澳門大橋：三塔雙索面 A/H 型高塔 + 珊瑚紅橫樑
        pushKitPart("rbox", tPt.x + tpX * legOffset, pylonCenterY, tPt.z + tpZ * legOffset, 0.085, totalPylonH, 0.11, PALETTE.guiaWhite, 0, tYaw, 0, metaTag);
        pushKitPart("rbox", tPt.x - tpX * legOffset, pylonCenterY, tPt.z - tpZ * legOffset, 0.085, totalPylonH, 0.11, PALETTE.guiaWhite, 0, tYaw, 0, metaTag);
        pushKitPart("rbox", tPt.x, tPt.y + towerH * 0.52, tPt.z, legOffset * 2.15, 0.065, 0.09, PALETTE.coral, 0, tYaw, 0, metaTag);
        pushKitPart("rbox", tPt.x, tPt.y + towerH * 0.92, tPt.z, legOffset * 2.05, 0.075, 0.09, PALETTE.coral, 0, tYaw, 0, metaTag);
      } else {
        // 西灣大橋：雙層箱樑 H 型雙柱斜拉索塔
        pushKitPart("rbox", tPt.x + tpX * legOffset, pylonCenterY, tPt.z + tpZ * legOffset, 0.085, totalPylonH, 0.11, PALETTE.guiaWhite, 0, tYaw, 0, metaTag);
        pushKitPart("rbox", tPt.x - tpX * legOffset, pylonCenterY, tPt.z - tpZ * legOffset, 0.085, totalPylonH, 0.11, PALETTE.guiaWhite, 0, tYaw, 0, metaTag);
        pushKitPart("rbox", tPt.x, tPt.y + towerH * 0.62, tPt.z, legOffset * 2.15, 0.065, 0.09, PALETTE.teal, 0, tYaw, 0, metaTag);
        pushKitPart("rbox", tPt.x, tPt.y + towerH * 0.94, tPt.z, legOffset * 2.05, 0.055, 0.09, PALETTE.yellow, 0, tYaw, 0, metaTag);
      }

      // 塔頂航空警示燈
      pushKitPart("glowsphere", tPt.x + tpX * legOffset, tPt.y + towerH + 0.06, tPt.z + tpZ * legOffset, 0.075, 0.075, 0.075, PALETTE.glow, 0, 0, 0, metaTag);
      pushKitPart("glowsphere", tPt.x - tpX * legOffset, tPt.y + towerH + 0.06, tPt.z - tpZ * legOffset, 0.075, 0.075, 0.075, PALETTE.glow, 0, 0, 0, metaTag);

      // 扇形斜拉鋼索 (Stay Cables)
      const cableOffsets = [-0.16, -0.11, -0.06, 0.06, 0.11, 0.16];
      cableOffsets.forEach((du, cIdx) => {
        const cu = THREE.MathUtils.clamp(tu + du, 0.04, 0.96);
        const anchorPt = bridgeCurve.getPoint(cu);
        const topH = tPt.y + towerH * (0.68 + (cIdx % 3) * 0.11);

        for (const side of [-1, 1]) {
          stayCablePoints.push(
            new THREE.Vector3(tPt.x + tpX * legOffset * side, topH, tPt.z + tpZ * legOffset * side),
            new THREE.Vector3(anchorPt.x + tpX * (deckWidth * 0.44) * side, anchorPt.y + 0.03, anchorPt.z + tpZ * (deckWidth * 0.44) * side)
          );
        }
      });
    });

    // 為四條跨海大橋配置動態行駛的雙向微型巴士與車輛
    const vehicleCount = bm.isCrossSeaFour ? 4 : 2;
    for (let v = 0; v < vehicleCount; v++) {
      bridgeVehicles.push({
        bridgeId: bm.id,
        curve: bridgeCurve,
        u: (v / vehicleCount),
        dir: v % 2 === 0 ? 1 : -1,
        speed: 0.11 + (bIdx % 3) * 0.02 + v * 0.015,
        laneOffset: (v % 2 === 0 ? 1 : -1) * (deckWidth * 0.22),
        isBus: v % 2 === 0
      });
    }
  });

  // 加入所有跨海大橋斜拉鋼索線段
  if (stayCablePoints.length > 0) {
    const cableGeo = new THREE.BufferGeometry().setFromPoints(stayCablePoints);
    const cableMat = new THREE.LineBasicMaterial({
      color: 0xfff8f0,
      transparent: true,
      opacity: 0.72
    });
    const cableLines = new THREE.LineSegments(cableGeo, cableMat);
    scene.add(cableLines);
  }

  // 將 kitEntries 依幾何種類建立 InstancedMesh
  const kitGeos = createKitGeometries();
  const solidMat = new THREE.MeshStandardMaterial({
    roughness: 0.78,
    metalness: 0
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffe8c2,
    emissive: 0xffc777,
    emissiveIntensity: 0.0,
    roughness: 0.4,
    metalness: 0
  });

  const groupedByKind = new Map();
  kitEntries.forEach((entry) => {
    if (!groupedByKind.has(entry.kind)) groupedByKind.set(entry.kind, []);
    groupedByKind.get(entry.kind).push(entry);
  });

  const kitInstancedMeshes = [];
  groupedByKind.forEach((entries, kind) => {
    const geo = kitGeos[kind];
    if (!geo || entries.length === 0) return;
    const isGlow = kind === "glowbox" || kind === "glowsphere";
    const mesh = new THREE.InstancedMesh(geo, isGlow ? glowMat : solidMat, entries.length);
    mesh.castShadow = !isGlow;
    mesh.receiveShadow = true;
    mesh.userData = { isKitMesh: true, kind, entries };

    entries.forEach((ent, idx) => {
      mesh.setMatrixAt(idx, ent.matrix);
      mesh.setColorAt(idx, ent.baseColor);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    kitInstancedMeshes.push(mesh);
  });

  // 建立跨海大橋動態微型車隊 InstancedMesh
  const bridgeCarMesh = new THREE.InstancedMesh(
    kitGeos.rbox,
    new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 }),
    bridgeVehicles.length
  );
  bridgeCarMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bridgeCarMesh.castShadow = true;
  bridgeVehicles.forEach((bv, idx) => {
    bridgeCarMesh.setColorAt(
      idx,
      new THREE.Color(bv.isBus ? PALETTE.macaoGreen : (idx % 3 === 0 ? PALETTE.coral : PALETTE.yellow))
    );
  });
  if (bridgeCarMesh.instanceColor) bridgeCarMesh.instanceColor.needsUpdate = true;
  scene.add(bridgeCarMesh);

  // =====================================================================
  // 互動 1：澳門輕軌系統 (Macau LRT) 3D 動態雙節列車（氹仔線：媽閣—氹仔碼頭）
  // =====================================================================
  const saivanBridge = bridgeMap.get("bridge-saivan");

  const lrtPoints = [];
  const pushIslPt = (id, yOff = 0.14) => {
    const isl = islandMap.get(id);
    if (isl) lrtPoints.push(new THREE.Vector3(isl.worldPos.x, TOP + yOff, isl.worldPos.z + 0.15));
  };

  // 依真實澳門輕軌氹仔線（媽閣—氹仔碼頭）排點：
  // 媽閣站(10) → 西灣大橋下層跨海 → 海洋站(14) → 運動場(15) → 排角(16) → 路氹西／蓮花(19) → 路氹東／科大(20) → 機場／氹仔碼頭(17)
  pushIslPt("safety");
  if (saivanBridge && saivanBridge.curve) {
    lrtPoints.push(saivanBridge.curve.getPoint(0.5).clone().add(new THREE.Vector3(0, -0.04, 0)));
  }
  pushIslPt("taipaocean");
  pushIslPt("sports");
  pushIslPt("culture");
  pushIslPt("tourism");
  pushIslPt("cotaieast");
  pushIslPt("pacon");

  const lrtCurve = new THREE.CatmullRomCurve3(lrtPoints, false, "catmullrom", 0.25);

  function buildLrtTrain() {
    const g = new THREE.Group();
    const carMat = new THREE.MeshStandardMaterial({ color: 0xfff8f4, roughness: 0.55 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x007562, roughness: 0.5 });
    const winMat = new THREE.MeshStandardMaterial({
      color: 0xa8d8d6,
      emissive: 0xffc777,
      emissiveIntensity: 0.4,
      roughness: 0.3
    });

    for (let c = -1; c <= 1; c += 2) {
      const car = new THREE.Mesh(kitGeos.rbox, carMat);
      car.scale.set(0.18, 0.13, 0.34);
      car.position.set(0, 0.07, c * 0.20);
      car.castShadow = true;
      car.userData = { isLrtTrain: true };
      g.add(car);

      const stripe = new THREE.Mesh(kitGeos.box, stripeMat);
      stripe.scale.set(0.19, 0.035, 0.35);
      stripe.position.set(0, 0.05, c * 0.20);
      stripe.userData = { isLrtTrain: true };
      g.add(stripe);

      const win = new THREE.Mesh(kitGeos.box, winMat);
      win.scale.set(0.192, 0.04, 0.28);
      win.position.set(0, 0.09, c * 0.20);
      win.userData = { isLrtTrain: true };
      g.add(win);
    }
    return g;
  }

  const lrtTrainGroup = buildLrtTrain();
  lrtCurve.getPointAt(0, lrtTrainGroup.position);
  scene.add(lrtTrainGroup);

  // 澳門輕軌三條營運路線：氹仔線（媽閣—氹仔碼頭）、橫琴線（蓮花—橫琴）、石排灣線（蓮花—石排灣）
  const lrtLines = [{ curve: lrtCurve, group: lrtTrainGroup, speed: 0.022, phase: 0 }];
  const lotusBridge = bridgeMap.get("bridge-lotus");
  const addLrtBranch = (points, speed, phase) => {
    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.2);
    const group = buildLrtTrain();
    curve.getPointAt(0, group.position);
    scene.add(group);
    lrtLines.push({ curve, group, speed, phase });
  };
  const tourismIsl = islandMap.get("tourism");
  const youthIsl = islandMap.get("youth");
  const environmentIsl = islandMap.get("environment");
  if (tourismIsl && youthIsl) {
    const pts = [new THREE.Vector3(tourismIsl.worldPos.x, TOP + 0.14, tourismIsl.worldPos.z + 0.15)];
    if (lotusBridge && lotusBridge.curve) {
      pts.push(lotusBridge.curve.getPoint(0.5).clone().add(new THREE.Vector3(0, 0.06, 0)));
    }
    pts.push(new THREE.Vector3(youthIsl.worldPos.x, TOP + 0.14, youthIsl.worldPos.z + 0.15));
    addLrtBranch(pts, 0.05, 0.55);
  }
  if (tourismIsl && environmentIsl) {
    addLrtBranch([
      new THREE.Vector3(tourismIsl.worldPos.x, TOP + 0.14, tourismIsl.worldPos.z + 0.15),
      new THREE.Vector3(environmentIsl.worldPos.x, TOP + 0.14, environmentIsl.worldPos.z + 0.15)
    ], 0.045, 1.35);
  }

  // =====================================================================
  // 互動 2：澳門旅遊塔國際煙花匯演 3D 粒子系統
  // =====================================================================
  const safetyIsl = islandMap.get("safety");
  const fireworkOrigin = safetyIsl
    ? new THREE.Vector3(safetyIsl.worldPos.x - 0.8, TOP + 2.8, safetyIsl.worldPos.z + 0.8)
    : new THREE.Vector3(-2, 3.2, 1);

  const fwCount = 90;
  const fwGeo = new THREE.SphereGeometry(0.055, 6, 6);
  const fwMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const fwInstMesh = new THREE.InstancedMesh(fwGeo, fwMat, fwCount);
  fwInstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fwInstMesh.visible = false;
  scene.add(fwInstMesh);

  const fwParticles = [];
  for (let i = 0; i < fwCount; i++) {
    fwParticles.push({
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      color: new THREE.Color()
    });
  }

  let fwTimer = 0;
  let fwActive = false;
  let fwBurstCenter = fireworkOrigin.clone();
  let fwCurrentColor = new THREE.Color(0xff9f6a);
  const fwPalette = [0xff6b4a, 0xfcea8b, 0x58e6d9, 0xff85c0, 0x95de64];

  function triggerFireworkBurst() {
    fwActive = true;
    fwTimer = 0;
    fwInstMesh.visible = true;
    const hex = fwPalette[Math.floor(Math.random() * fwPalette.length)];
    fwCurrentColor.setHex(hex);
    fwBurstCenter.copy(fireworkOrigin).add(
      new THREE.Vector3((Math.random() - 0.5) * 2.2, (Math.random() - 0.3) * 0.8, (Math.random() - 0.5) * 1.6)
    );
    for (let i = 0; i < fwCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const spd = 1.2 + Math.random() * 2.2;
      fwParticles[i].pos.copy(fwBurstCenter);
      fwParticles[i].vel.set(
        Math.sin(phi) * Math.cos(theta) * spd,
        Math.cos(phi) * spd + 0.6,
        Math.sin(phi) * Math.sin(theta) * spd
      );
      fwParticles[i].color.copy(fwCurrentColor).offsetHSL((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.15);
      fwInstMesh.setColorAt(i, fwParticles[i].color);
    }
    if (fwInstMesh.instanceColor) fwInstMesh.instanceColor.needsUpdate = true;
  }

  // =====================================================================
  // 互動 3：內港風暴潮防洪閘門與潮汐模擬視覺
  // =====================================================================
  const floodgateGroup = new THREE.Group();
  const gateMat = new THREE.MeshStandardMaterial({
    color: 0xdb6a41,
    emissive: 0xff9f40,
    emissiveIntensity: 0.35,
    roughness: 0.5
  });
  ["safety", "eldercare", "faichikei", "ilahverde"].forEach((fgId) => {
    const fgIsl = islandMap.get(fgId);
    if (!fgIsl) return;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      const nextA = ((i + 1) * Math.PI) / 3 + Math.PI / 6;
      const mx = fgIsl.worldPos.x + (Math.cos(a) + Math.cos(nextA)) * 0.5 * (R - 0.06);
      const mz = fgIsl.worldPos.z + (Math.sin(a) + Math.sin(nextA)) * 0.5 * (R - 0.06);
      const gate = new THREE.Mesh(kitGeos.rbox, gateMat);
      gate.scale.set(1.22, 0.32, 0.055);
      gate.position.set(mx, TOP - 0.20, mz);
      gate.rotation.y = -((a + nextA) * 0.5) + Math.PI / 2;
      floodgateGroup.add(gate);
    }
  });
  floodgateGroup.visible = false;
  scene.add(floodgateGroup);

  // 高亮與大三巴光雕投影更新（支援選取跨海大橋高亮）
  const coralColor = new THREE.Color(PALETTE.coral);
  const yellowColor = new THREE.Color(PALETTE.yellow);
  const lightshowColor = new THREE.Color();
  const workColor = new THREE.Color();

  function updateKitHighlights(selectedIslandId, selectedItemId, activeDayItemSet, lightshowActive = false, elapsedTime = 0, selectedBridgeId = null) {
    kitInstancedMeshes.forEach((mesh) => {
      const entries = mesh.userData.entries;
      let changed = false;
      for (let i = 0; i < entries.length; i++) {
        const ent = entries[i];
        workColor.copy(ent.baseColor);
        if (lightshowActive && ent.isRuins) {
          const hue = (elapsedTime * 0.18 + i * 0.07) % 1.0;
          lightshowColor.setHSL(hue, 0.85, 0.62);
          workColor.lerp(lightshowColor, 0.55);
        }
        if (ent.itemId && activeDayItemSet && activeDayItemSet.has(ent.itemId)) {
          workColor.lerp(yellowColor, 0.22);
        }
        if (
          (selectedBridgeId && ent.bridgeId === selectedBridgeId) ||
          (selectedItemId && ent.itemId === selectedItemId) ||
          (!selectedItemId && selectedIslandId && ent.islandId === selectedIslandId)
        ) {
          workColor.lerp(coralColor, 0.28);
        }
        mesh.setColorAt(i, workColor);
        changed = true;
      }
      if (changed && mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    });
  }

  // 距離 LOD：小物件在鏡頭距離 >= 26 時隱藏
  let smallPropsHidden = false;
  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  function updateSmallPropsLOD(cameraDist) {
    const shouldHide = cameraDist >= 26;
    if (shouldHide === smallPropsHidden) return;
    smallPropsHidden = shouldHide;
    kitInstancedMeshes.forEach((mesh) => {
      const entries = mesh.userData.entries;
      let touched = false;
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].isSmallProp) {
          mesh.setMatrixAt(i, shouldHide ? zeroMatrix : entries[i].matrix);
          touched = true;
        }
      }
      if (touched) mesh.instanceMatrix.needsUpdate = true;
    });
  }

  // 更新輕軌列車、跨海大橋車隊、煙花與防洪閘門動態
  const lrtPos = new THREE.Vector3();
  const lrtTan = new THREE.Vector3();
  const fwDummy = new THREE.Object3D();
  const bvPos = new THREE.Vector3();
  const bvTan = new THREE.Vector3();

  function updateInteractiveLandmarks(dt, elapsedTime, waterMat, tideLevelM) {
    // 1. 澳門輕軌三線列車往返行駛（氹仔線／橫琴線／石排灣線）
    for (let i = 0; i < lrtLines.length; i++) {
      const line = lrtLines[i];
      const lrtCycle = (elapsedTime * line.speed + line.phase) % 2;
      const lrtForward = lrtCycle <= 1;
      const lrtU = lrtForward ? lrtCycle : 2 - lrtCycle;
      line.curve.getPointAt(lrtU, lrtPos);
      line.curve.getTangentAt(lrtU, lrtTan);
      if (!lrtForward) lrtTan.negate();
      line.group.position.copy(lrtPos);
      line.group.rotation.y = Math.atan2(lrtTan.x, lrtTan.z);
    }

    // 2. 四條跨海大橋上的雙向穿梭巴士與車流
    for (let i = 0; i < bridgeVehicles.length; i++) {
      const bv = bridgeVehicles[i];
      bv.u = (bv.u + bv.dir * bv.speed * dt + 1.0) % 1.0;
      bv.curve.getPointAt(bv.u, bvPos);
      bv.curve.getTangentAt(bv.u, bvTan);
      if (bv.dir < 0) bvTan.negate();
      const yaw = Math.atan2(bvTan.x, bvTan.z);
      const pitch = -Math.asin(THREE.MathUtils.clamp(bvTan.y, -0.45, 0.45));
      const pX = Math.cos(yaw) * bv.laneOffset;
      const pZ = -Math.sin(yaw) * bv.laneOffset;

      fwDummy.position.set(bvPos.x + pX, bvPos.y + 0.045, bvPos.z + pZ);
      fwDummy.rotation.set(pitch, yaw, 0, "YXZ");
      fwDummy.scale.set(bv.isBus ? 0.085 : 0.068, bv.isBus ? 0.065 : 0.048, bv.isBus ? 0.19 : 0.13);
      fwDummy.updateMatrix();
      bridgeCarMesh.setMatrixAt(i, fwDummy.matrix);
    }
    bridgeCarMesh.instanceMatrix.needsUpdate = true;

    // 3. 煙花粒子物理與水面反射更新
    if (fwActive) {
      fwTimer += dt;
      if (fwTimer > 2.4) {
        fwActive = false;
        fwInstMesh.visible = false;
        waterMat.uniforms.uFireworkGlow.value = 0.0;
      } else {
        const life = 1.0 - fwTimer / 2.4;
        const sc = Math.max(0.01, life * 1.25);
        for (let i = 0; i < fwCount; i++) {
          const p = fwParticles[i];
          p.pos.addScaledVector(p.vel, dt);
          p.vel.y -= 2.2 * dt;
          p.vel.multiplyScalar(0.985);
          fwDummy.position.copy(p.pos);
          fwDummy.rotation.set(0, 0, 0);
          fwDummy.scale.set(sc, sc, sc);
          fwDummy.updateMatrix();
          fwInstMesh.setMatrixAt(i, fwDummy.matrix);
        }
        fwInstMesh.instanceMatrix.needsUpdate = true;
        waterMat.uniforms.uFireworkPos.value.copy(fwBurstCenter);
        waterMat.uniforms.uFireworkColor.value.copy(fwCurrentColor);
        waterMat.uniforms.uFireworkGlow.value = life * 1.5;
      }
    }

    // 4. 內港防洪閘門高度隨潮位調整
    if (tideLevelM > 0.05) {
      floodgateGroup.visible = true;
      const gateLift = Math.min(0.32, (tideLevelM / 2.5) * 0.32);
      floodgateGroup.position.y = gateLift;
    } else {
      floodgateGroup.visible = false;
    }
  }

  // Dijkstra 最短路徑搜尋（支援跨海大橋節點）
  function findShortestPath(startNodeId, endNodeId) {
    const dist = new Map();
    const prev = new Map();
    const unvisited = new Set();

    graphNodes.forEach((_, nid) => {
      dist.set(nid, Infinity);
      unvisited.add(nid);
    });
    dist.set(startNodeId, 0);

    while (unvisited.size > 0) {
      let u = null;
      let bestD = Infinity;
      unvisited.forEach((nid) => {
        const d = dist.get(nid);
        if (d < bestD) {
          bestD = d;
          u = nid;
        }
      });
      if (u === null || u === endNodeId || bestD === Infinity) break;
      unvisited.delete(u);

      const neighbors = graphAdj.get(u) || [];
      for (const edge of neighbors) {
        if (!unvisited.has(edge.to)) continue;
        const alt = bestD + edge.weight;
        if (alt < dist.get(edge.to)) {
          dist.set(edge.to, alt);
          prev.set(edge.to, u);
        }
      }
    }

    const path = [];
    let curr = endNodeId;
    while (curr) {
      path.unshift(graphNodes.get(curr).pos.clone());
      curr = prev.get(curr);
    }
    return path.length > 1 ? path : [graphNodes.get(startNodeId).pos.clone(), graphNodes.get(endNodeId).pos.clone()];
  }

  function findIslandRoute(fromIslandId, toIslandId) {
    const startId = `${fromIslandId}_v0`;
    const endId = `${toIslandId}_v3`;
    if (!graphNodes.has(startId) || !graphNodes.has(endId)) return [];
    return findShortestPath(startId, endId);
  }

  return {
    geoGridGroup,
    coordMarkers,
    islandMap,
    bridgeMap,
    itemMap,
    islandMeshes,
    kitInstancedMeshes,
    glowMat,
    nightAdditiveMeshes,
    lrtTrainGroup,
    lrtPos,
    lrtTan,
    triggerFireworkBurst,
    updateInteractiveLandmarks,
    updateKitHighlights,
    updateSmallPropsLOD,
    findIslandRoute
  };
}

// 引擎層模組（由 src/main.js 拆出）；打包後與 main 同一作用域，見 scripts/build.mjs。
import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";
import { DATA } from "../world-data.js";
import { WATER_Y } from "../coords.js";
import { mulberry32 } from "../rng.js";

// =========================================================================
// 遠景地形、背景樹、遠山剪影、雲朵、海上燈塔與帆船、六角島與路網建構
// =========================================================================
export function buildDistantEnvironment(scene, cityCenter, isMobile) {
  const rng = mulberry32(DATA.seed + 101);
  const simplex = new SimplexNoise({ random: mulberry32(DATA.seed + 202) });

  function fbm(x, z) {
    let val = 0;
    let amp = 0.5;
    let freq = 0.032;
    for (let i = 0; i < 4; i++) {
      val += amp * simplex.noise(x * freq, z * freq);
      freq *= 2.05;
      amp *= 0.48;
    }
    return val;
  }

  function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function getTerrainHeight(wx, wz) {
    const dx = wx - cityCenter.x;
    const dz = wz - cityCenter.z;
    const dist = Math.hypot(dx, dz);
    const ring = smoothstep(23.0, 48.0, dist) * (1.0 - smoothstep(56.0, 82.0, dist) * 0.35);
    // 鏡頭那一側 (+z) 壓低，避免擋到城市
    const camSideAtten = dz > 8.0 ? Math.max(0.18, 1.0 - smoothstep(8.0, 36.0, dz) * 0.78) : 1.0;
    const rawNoise = (fbm(wx, wz) + 0.65) * 0.65;
    let h = ring * camSideAtten * (3.2 + rawNoise * 5.6);
    // 梯田量化
    const terrace = Math.round(h * 1.65) / 1.65;
    h = h * 0.55 + terrace * 0.45;
    if (dist < 21.5) {
      h = -0.55;
    } else {
      h -= 0.45 * (1.0 - smoothstep(21.5, 26.5, dist));
    }
    return h;
  }

  // 1. 盆地地形：170² PlaneGeometry（細分 160）
  const terrainGeo = new THREE.PlaneGeometry(170, 170, 160, 160);
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);

  const cRiver = new THREE.Color(0x8fb3ad);
  const cSand = new THREE.Color(0xd9c9a3);
  const cField = new THREE.Color(0xaec493);
  const cGrass = new THREE.Color(0xa3b986);
  const cForest = new THREE.Color(0x6f8a62);
  const cRock = new THREE.Color(0xb2a38d);
  const tmpCol = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i) + cityCenter.x;
    const vz = posAttr.getZ(i) + cityCenter.z;
    const vy = getTerrainHeight(vx, vz);
    posAttr.setX(i, vx);
    posAttr.setY(i, vy);
    posAttr.setZ(i, vz);

    if (vy < -0.15) tmpCol.copy(cRiver);
    else if (vy < 0.45) tmpCol.copy(cSand).lerp(cField, (vy + 0.15) / 0.6);
    else if (vy < 1.65) tmpCol.copy(cField).lerp(cGrass, (vy - 0.45) / 1.2);
    else if (vy < 3.4) tmpCol.copy(cGrass).lerp(cForest, (vy - 1.65) / 1.75);
    else tmpCol.copy(cForest).lerp(cRock, Math.min(1, (vy - 3.4) / 2.6));

    colors[i * 3] = tmpCol.r;
    colors[i * 3 + 1] = tmpCol.g;
    colors[i * 3 + 2] = tmpCol.b;
  }
  terrainGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.92,
    metalness: 0
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  // 2. 背景樹：InstancedMesh 數千棵（針葉 = 3 個 cone merge；闊葉 = 4 顆抖動 ico merge）
  const c1 = new THREE.ConeGeometry(0.45, 0.7, 7); c1.translate(0, 0.45, 0);
  const c2 = new THREE.ConeGeometry(0.36, 0.6, 7); c2.translate(0, 0.8, 0);
  const c3 = new THREE.ConeGeometry(0.25, 0.5, 7); c3.translate(0, 1.1, 0);
  const coniferGeo = BufferGeometryUtils.mergeGeometries([c1, c2, c3]);

  const b1 = new THREE.IcosahedronGeometry(0.38, 0); b1.translate(0, 0.55, 0);
  const b2 = new THREE.IcosahedronGeometry(0.30, 0); b2.translate(0.16, 0.68, 0.08);
  const b3 = new THREE.IcosahedronGeometry(0.28, 0); b3.translate(-0.15, 0.62, -0.10);
  const b4 = new THREE.IcosahedronGeometry(0.26, 0); b4.translate(0.04, 0.82, -0.06);
  const broadleafGeo = BufferGeometryUtils.mergeGeometries([b1, b2, b3, b4]);

  const treeMat = new THREE.MeshStandardMaterial({
    roughness: 0.88,
    metalness: 0,
    flatShading: true
  });

  const totalTrees = isMobile ? 900 : 2100;
  const coniferMesh = new THREE.InstancedMesh(coniferGeo, treeMat, Math.floor(totalTrees / 2));
  const broadleafMesh = new THREE.InstancedMesh(broadleafGeo, treeMat, Math.floor(totalTrees / 2));
  coniferMesh.castShadow = false;
  coniferMesh.receiveShadow = false;
  broadleafMesh.castShadow = false;
  broadleafMesh.receiveShadow = false;

  const dummy = new THREE.Object3D();
  const treePalette = [new THREE.Color(0x6f8a62), new THREE.Color(0x8db86f), new THREE.Color(0x728f5f), new THREE.Color(0x9cc27a)];
  let ci = 0, bi = 0;

  for (let i = 0; i < totalTrees * 2 && (ci < coniferMesh.count || bi < broadleafMesh.count); i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 16.5 + rng() * 35.5;
    const tx = cityCenter.x + Math.cos(ang) * rad;
    const tz = cityCenter.z + Math.sin(ang) * rad;
    const ty = getTerrainHeight(tx, tz);
    if (ty < 0.05) continue;

    const sc = 0.65 + rng() * 0.75;
    dummy.position.set(tx, ty - 0.05, tz);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.scale.set(sc, sc * (0.9 + rng() * 0.25), sc);
    dummy.updateMatrix();

    const col = treePalette[Math.floor(rng() * treePalette.length)];
    if (rng() > 0.48 && ci < coniferMesh.count) {
      coniferMesh.setMatrixAt(ci, dummy.matrix);
      coniferMesh.setColorAt(ci, col);
      ci++;
    } else if (bi < broadleafMesh.count) {
      broadleafMesh.setMatrixAt(bi, dummy.matrix);
      broadleafMesh.setColorAt(bi, col);
      bi++;
    }
  }
  coniferMesh.count = ci;
  broadleafMesh.count = bi;
  coniferMesh.instanceMatrix.needsUpdate = true;
  broadleafMesh.instanceMatrix.needsUpdate = true;
  if (coniferMesh.instanceColor) coniferMesh.instanceColor.needsUpdate = true;
  if (broadleafMesh.instanceColor) broadleafMesh.instanceColor.needsUpdate = true;
  scene.add(coniferMesh);
  scene.add(broadleafMesh);

  // 3. 三圈遠山剪影帶（MeshBasic，顏色往 horizon 混）
  const silhouetteMats = [];
  const ringConfigs = [
    { radius: 64, height: 11, tint: 0x8ea29a, blend: 0.55 },
    { radius: 82, height: 16, tint: 0x9aaab0, blend: 0.72 },
    { radius: 102, height: 22, tint: 0xaab6c0, blend: 0.85 }
  ];

  ringConfigs.forEach((rc, rIdx) => {
    const segs = 96;
    const cyl = new THREE.CylinderGeometry(rc.radius, rc.radius, rc.height, segs, 1, true);
    const p = cyl.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > 0) {
        const x = p.getX(i);
        const z = p.getZ(i);
        const a = Math.atan2(z, x);
        const wave = Math.sin(a * 5 + rIdx * 1.7) * 0.35 + Math.cos(a * 9 - rIdx) * 0.2 + 0.55;
        // 壓低正前方鏡頭方向
        const frontAtten = z > 0 ? Math.max(0.25, 1.0 - (z / rc.radius) * 0.65) : 1.0;
        p.setY(i, rc.height * wave * frontAtten);
      } else {
        p.setY(i, -2.0);
      }
    }
    cyl.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      color: rc.tint,
      side: THREE.DoubleSide,
      fog: false
    });
    mat.userData = { baseColor: new THREE.Color(rc.tint), blend: rc.blend };
    silhouetteMats.push(mat);
    const mesh = new THREE.Mesh(cyl, mat);
    mesh.position.set(cityCenter.x, WATER_Y, cityCenter.z);
    scene.add(mesh);
  });

  // 4. 12 團雲：多顆球組成，沿 +x 慢慢漂，超出範圍後繞回
  const clouds = [];
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xfffbf7,
    roughness: 0.9,
    metalness: 0
  });
  const puffGeo = new THREE.SphereGeometry(1, 12, 10);

  for (let i = 0; i < 12; i++) {
    const group = new THREE.Group();
    const puffs = 4 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p++) {
      const m = new THREE.Mesh(puffGeo, cloudMat);
      const sx = 1.1 + rng() * 0.9;
      const sy = 0.65 + rng() * 0.45;
      const sz = 0.9 + rng() * 0.6;
      m.scale.set(sx, sy, sz);
      m.position.set((p - puffs * 0.5) * 1.1, (rng() - 0.5) * 0.35, (rng() - 0.5) * 0.6);
      group.add(m);
    }
    const cx = (rng() - 0.5) * 86 + cityCenter.x;
    const cz = (rng() - 0.5) * 70 + cityCenter.z - 8;
    const cy = 11.5 + rng() * 5.5;
    group.position.set(cx, cy, cz);
    const speed = 0.35 + rng() * 0.35;
    scene.add(group);
    clouds.push({ group, speed });
  }

  // 5. 海上點綴：小島、燈塔、帆船
  const seaPropsGroup = new THREE.Group();
  const seaSolidMat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
  const lighthouseGlowMat = new THREE.MeshStandardMaterial({
    color: 0xffe8b8,
    emissive: 0xffc777,
    emissiveIntensity: 0.5
  });

  // 燈塔礁島
  const lhPos = new THREE.Vector3(cityCenter.x + 13.8, WATER_Y, cityCenter.z + 4.8);
  const reefMesh = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.7, 7), new THREE.MeshStandardMaterial({ color: 0xc5b5a7, roughness: 0.9 }));
  reefMesh.position.copy(lhPos).add(new THREE.Vector3(0, 0.25, 0));
  seaPropsGroup.add(reefMesh);

  const towerMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.4, 12), new THREE.MeshStandardMaterial({ color: 0xfff8f4, roughness: 0.78 }));
  towerMesh.position.copy(lhPos).add(new THREE.Vector3(0, 1.15, 0));
  towerMesh.castShadow = true;
  seaPropsGroup.add(towerMesh);

  const stripeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.30, 0.42, 12), new THREE.MeshStandardMaterial({ color: 0xdb6a41, roughness: 0.78 }));
  stripeMesh.position.copy(lhPos).add(new THREE.Vector3(0, 1.12, 0));
  seaPropsGroup.add(stripeMesh);

  const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(0.20, 12, 10), lighthouseGlowMat);
  beaconMesh.position.copy(lhPos).add(new THREE.Vector3(0, 1.92, 0));
  seaPropsGroup.add(beaconMesh);

  const capMesh = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.32, 12), new THREE.MeshStandardMaterial({ color: 0xdb6a41, roughness: 0.78 }));
  capMesh.position.copy(lhPos).add(new THREE.Vector3(0, 2.16, 0));
  seaPropsGroup.add(capMesh);

  // 幾座海上迷你小礁島
  const isletCoords = [
    [-13.5, 4.2],
    [-11.2, -9.8],
    [14.2, -8.5]
  ];
  isletCoords.forEach(([ix, iz]) => {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 1), new THREE.MeshStandardMaterial({ color: 0xd9c9a3, roughness: 0.9, flatShading: true }));
    rock.scale.set(1.2, 0.42, 1.0);
    rock.position.set(cityCenter.x + ix, WATER_Y + 0.12, cityCenter.z + iz);
    seaPropsGroup.add(rock);

    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color: 0x8db86f, roughness: 0.85, flatShading: true }));
    bush.position.set(cityCenter.x + ix, WATER_Y + 0.42, cityCenter.z + iz);
    seaPropsGroup.add(bush);
  });

  // 5 艘帆船
  const sailboats = [];
  const boatCoords = [
    [10.2, 6.8],
    [-9.8, 7.2],
    [12.4, -3.5],
    [-11.6, -3.2],
    [3.5, 9.6]
  ];
  boatCoords.forEach(([bx, bz], idx) => {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.14, 0.24, 2, 0.04), new THREE.MeshStandardMaterial({ color: idx % 2 === 0 ? 0xdb6a41 : 0x3e7c8c, roughness: 0.78 }));
    hull.position.y = 0.06;
    boat.add(hull);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 8), new THREE.MeshStandardMaterial({ color: 0xb48560 }));
    mast.position.y = 0.36;
    boat.add(mast);

    const sailGeo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      0, 0.14, 0,
      0, 0.64, 0,
      0.34, 0.18, 0.04
    ]);
    sailGeo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({ color: 0xfff8f4, side: THREE.DoubleSide, roughness: 0.8 }));
    boat.add(sail);

    boat.position.set(cityCenter.x + bx, WATER_Y + 0.02, cityCenter.z + bz);
    boat.rotation.y = idx * 1.1;
    seaPropsGroup.add(boat);
    sailboats.push({ boat, baseX: cityCenter.x + bx, baseZ: cityCenter.z + bz, phase: idx * 1.7 });
  });

  scene.add(seaPropsGroup);

  return {
    silhouetteMats,
    clouds,
    sailboats,
    lighthouseGlowMat
  };
}

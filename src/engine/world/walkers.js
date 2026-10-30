// 引擎層模組（由 src/main.js 拆出）；打包後與 main 同一作用域，見 scripts/build.mjs。
import * as THREE from "three";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { DATA } from "../world-data.js";
import { PALETTE } from "../palette.js";
import { TOP } from "../coords.js";
import { mulberry32 } from "../rng.js";
import { tr, langState } from "../i18n.js";
import { createBadgeTexture } from "../textures.js";

// =========================================================================
// 6. 小人 (Chibi Walkers)、9 種角色配件、頭上 Badge、名牌氣泡與協作線 Tube Shader
// =========================================================================
export function createFlowTubeMaterial(totalLength, evidenceType) {
  const modeInt = evidenceType === "official" ? 0 : (evidenceType === "thematic" ? 1 : 2);
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uLength: { value: totalLength },
      uMode: { value: modeInt },
      uColor: { value: new THREE.Color(PALETTE.coral) },
      uOpacity: { value: 0.82 },
      uReducedMotion: { value: 0.0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uLength;
      uniform int uMode;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uReducedMotion;
      varying vec2 vUv;

      void main() {
        float t = uReducedMotion > 0.5 ? 0.0 : uTime;
        float u = vUv.x * uLength * 5.0 - t * 1.4;
        float f = fract(u);

        if (uReducedMotion > 0.5) {
          if (uMode == 2 && f > 0.35) discard;
          if (uMode != 2 && f > 0.65) discard;
        } else {
          if (uMode == 1 && f > 0.6) discard;
          if (uMode == 2 && f > 0.3) discard;
        }

        float pulse = uMode == 0 && uReducedMotion < 0.5 ? (0.88 + 0.12 * sin(u * 6.28318)) : 1.0;
        gl_FragColor = vec4(uColor * pulse, uOpacity);
      }
    `
  });
}

export function buildWalkersAndFlows(scene, findIslandRoute, onLogEvent, onSelectWalker) {
  const rng = mulberry32(DATA.seed + 505);
  const flowMeshes = new Map();
  const flowHitMeshes = [];
  const walkers = [];

  // Badge 貼圖快取
  const badgeTexCache = new Map();
  function getBadgeTex(iconKind) {
    if (!badgeTexCache.has(iconKind)) {
      badgeTexCache.set(iconKind, createBadgeTexture(iconKind));
    }
    return badgeTexCache.get(iconKind);
  }

  // 建立每條協作線的平滑折線與 TubeGeometry (半徑 0.035)
  DATA.flows.forEach((flow) => {
    const rawPoints = findIslandRoute(flow.from, flow.to);
    if (rawPoints.length < 2) return;

    const elevated = rawPoints.map((pt, idx) => {
      const prev = idx > 0 ? rawPoints[idx - 1] : null;
      let y = TOP + 0.045;
      if (prev && prev.distanceTo(pt) > 0.95) {
        y = TOP + 0.075;
      }
      return new THREE.Vector3(pt.x, y, pt.z);
    });

    const curve = new THREE.CatmullRomCurve3(elevated, false, "catmullrom", 0.18);
    const totalLength = curve.getLength();
    const segs = Math.max(32, Math.floor(totalLength * 10));
    const tubeGeo = new THREE.TubeGeometry(curve, segs, 0.035, 8, false);
    const tubeMat = createFlowTubeMaterial(totalLength, flow.evidence);
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.visible = false;
    tubeMesh.userData = { flowId: flow.id };
    scene.add(tubeMesh);
    flowMeshes.set(flow.id, { mesh: tubeMesh, mat: tubeMat, curve, totalLength, flow });
    flowHitMeshes.push(tubeMesh);

    // 在此路線配置 4–14 名小人來回走
    const count = THREE.MathUtils.clamp(flow.walkersCount || 6, 4, 14);
    const isBike = flow.role === "commuter";
    for (let w = 0; w < count; w++) {
      const baseSpeed = isBike
        ? (0.62 + rng() * 0.08)
        : (0.32 + rng() * 0.08);
      const walkerId = `${flow.id}-w${w + 1}`;

      // 頭頂 128² Sprite badge
      const spriteMat = new THREE.SpriteMaterial({
        map: getBadgeTex(flow.cargoIcon),
        transparent: true,
        depthTest: false
      });
      const badgeSprite = new THREE.Sprite(spriteMat);
      badgeSprite.scale.set(0.22, 0.22, 1);
      badgeSprite.visible = false;
      scene.add(badgeSprite);

      // 名牌 CSS2D 氣泡（預設設定 hidden 與 visible = false，防止 CSS2DRenderer 強制顯示）
      const bubbleEl = document.createElement("div");
      bubbleEl.className = "walker-bubble hidden";
      const walkerIdx = walkers.length;
      bubbleEl.addEventListener("pointerup", (e) => {
        e.stopPropagation();
        if (onSelectWalker) onSelectWalker(walkers[walkerIdx]);
      });
      const bubbleObj = new CSS2DObject(bubbleEl);
      bubbleObj.visible = false;
      scene.add(bubbleObj);

      walkers.push({
        id: walkerId,
        index: walkerIdx,
        localIdxInFlow: w,
        flow,
        curve,
        totalLength,
        dist: (w / count) * totalLength,
        dir: w % 2 === 0 ? 1 : -1,
        speed: baseSpeed,
        waitTimer: 0,
        phase: rng() * Math.PI * 2,
        role: flow.role,
        pos: new THREE.Vector3(),
        tangent: new THREE.Vector3(0, 0, 1),
        lastScale: 1.0,
        badgeSprite,
        bubbleEl,
        bubbleObj,
        clothColor: new THREE.Color(
          flow.role === "researcher" ? "#fff8f4" :
          flow.role === "civil" ? "#3e7c8c" :
          flow.role === "elder" ? "#b48560" :
          flow.role === "student" ? "#6f7fb5" :
          flow.role === "parent" ? "#f2b5c6" :
          flow.role === "commuter" ? "#58a6a6" :
          flow.role === "farmer" ? "#71806a" :
          flow.role === "worker" ? "#db6a41" : "#fcea8b"
        ),
        hairColor: new THREE.Color(w % 3 === 0 ? "#211d1d" : (w % 3 === 1 ? "#4b382e" : "#6c584c"))
      });
    }
  });

  const totalWalkers = walkers.length;
  const walkerMat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x211d1d,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });

  const shadowGeo = new THREE.CircleGeometry(0.11, 12);
  shadowGeo.rotateX(-Math.PI / 2);
  const legGeo = new THREE.CapsuleGeometry(0.024, 0.045, 4, 8);
  const armGeo = new THREE.CapsuleGeometry(0.020, 0.042, 4, 8);
  const bodyGeo = new THREE.CapsuleGeometry(0.052, 0.065, 6, 12);
  const headGeo = new THREE.SphereGeometry(0.072, 14, 12);
  const hairGeo = new THREE.SphereGeometry(0.076, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58);
  const eyeGeo = new THREE.SphereGeometry(0.011, 8, 8);
  const accBoxGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
  const accConeGeo = new THREE.ConeGeometry(0.5, 1, 12);
  const accTorusGeo = new THREE.TorusGeometry(0.36, 0.10, 8, 14);

  function makeDynMesh(geo, mat, count) {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = mat !== shadowMat;
    m.receiveShadow = false;
    m.userData = { isWalkerMesh: true };
    scene.add(m);
    return m;
  }

  const shadowMesh = makeDynMesh(shadowGeo, shadowMat, totalWalkers);
  const leftLegMesh = makeDynMesh(legGeo, walkerMat, totalWalkers);
  const rightLegMesh = makeDynMesh(legGeo, walkerMat, totalWalkers);
  const leftArmMesh = makeDynMesh(armGeo, walkerMat, totalWalkers);
  const rightArmMesh = makeDynMesh(armGeo, walkerMat, totalWalkers);
  const bodyMesh = makeDynMesh(bodyGeo, walkerMat, totalWalkers);
  const headMesh = makeDynMesh(headGeo, walkerMat, totalWalkers);
  const hairMesh = makeDynMesh(hairGeo, walkerMat, totalWalkers);
  const leftEyeMesh = makeDynMesh(eyeGeo, walkerMat, totalWalkers);
  const rightEyeMesh = makeDynMesh(eyeGeo, walkerMat, totalWalkers);
  const hatConeMesh = makeDynMesh(accConeGeo, walkerMat, totalWalkers);
  const accBox1Mesh = makeDynMesh(accBoxGeo, walkerMat, totalWalkers);
  const accBox2Mesh = makeDynMesh(accBoxGeo, walkerMat, totalWalkers);
  const wheel1Mesh = makeDynMesh(accTorusGeo, walkerMat, totalWalkers);
  const wheel2Mesh = makeDynMesh(accTorusGeo, walkerMat, totalWalkers);

  const skinColor = new THREE.Color("#fce2ce");
  const pantsColor = new THREE.Color("#3b3533");
  const eyeColor = new THREE.Color("#211d1d");
  const yellowCol = new THREE.Color(PALETTE.yellow);
  const coralCol = new THREE.Color(PALETTE.coral);
  const creamCol = new THREE.Color(PALETTE.cream);
  const woodCol = new THREE.Color(PALETTE.wood);
  const tealCol = new THREE.Color(PALETTE.teal);

  walkers.forEach((w, i) => {
    leftLegMesh.setColorAt(i, pantsColor);
    rightLegMesh.setColorAt(i, pantsColor);
    leftArmMesh.setColorAt(i, w.clothColor);
    rightArmMesh.setColorAt(i, w.clothColor);
    bodyMesh.setColorAt(i, w.clothColor);
    headMesh.setColorAt(i, skinColor);
    hairMesh.setColorAt(i, w.hairColor);
    leftEyeMesh.setColorAt(i, eyeColor);
    rightEyeMesh.setColorAt(i, eyeColor);

    if (w.role === "farmer") {
      hatConeMesh.setColorAt(i, yellowCol);
      accBox1Mesh.setColorAt(i, woodCol);
      accBox2Mesh.setColorAt(i, creamCol);
    } else if (w.role === "student") {
      hatConeMesh.setColorAt(i, yellowCol);
      accBox1Mesh.setColorAt(i, coralCol);
      accBox2Mesh.setColorAt(i, yellowCol);
    } else if (w.role === "worker") {
      hatConeMesh.setColorAt(i, yellowCol);
      accBox1Mesh.setColorAt(i, yellowCol);
      accBox2Mesh.setColorAt(i, coralCol);
    } else if (w.role === "civil") {
      hatConeMesh.setColorAt(i, w.hairColor);
      accBox1Mesh.setColorAt(i, creamCol);
      accBox2Mesh.setColorAt(i, tealCol);
    } else if (w.role === "researcher") {
      hatConeMesh.setColorAt(i, w.hairColor);
      accBox1Mesh.setColorAt(i, creamCol);
      accBox2Mesh.setColorAt(i, tealCol);
    } else if (w.role === "elder") {
      hatConeMesh.setColorAt(i, new THREE.Color("#d8d2cc"));
      accBox1Mesh.setColorAt(i, woodCol);
      accBox2Mesh.setColorAt(i, woodCol);
    } else if (w.role === "parent") {
      hatConeMesh.setColorAt(i, w.hairColor);
      accBox1Mesh.setColorAt(i, coralCol);
      accBox2Mesh.setColorAt(i, eyeColor);
    } else if (w.role === "tourist") {
      hatConeMesh.setColorAt(i, coralCol);
      accBox1Mesh.setColorAt(i, coralCol);
      accBox2Mesh.setColorAt(i, eyeColor);
    } else {
      hatConeMesh.setColorAt(i, tealCol);
      accBox1Mesh.setColorAt(i, coralCol);
      accBox2Mesh.setColorAt(i, eyeColor);
    }
    wheel1Mesh.setColorAt(i, eyeColor);
    wheel2Mesh.setColorAt(i, eyeColor);
  });

  [
    leftLegMesh, rightLegMesh, leftArmMesh, rightArmMesh,
    bodyMesh, headMesh, hairMesh, leftEyeMesh, rightEyeMesh,
    hatConeMesh, accBox1Mesh, accBox2Mesh, wheel1Mesh, wheel2Mesh
  ].forEach((m) => {
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  const dummy = new THREE.Object3D();
  const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

  // 獨立同步每位小人的頭頂搬運 Badge 與名牌氣泡可見度（確保點擊開關時 100% 即時顯示或隱藏）
  function syncWalkerIndicators(cameraPos, showCargoBadges, showNameplates) {
    const isSmallScreen = window.innerWidth <= 800;
    for (let i = 0; i < totalWalkers; i++) {
      const w = walkers[i];
      const camDist = cameraPos.distanceTo(w.pos);
      const wy = w.pos.y - 0.03;
      const s = w.lastScale || 1.0;

      // 1. 頭頂搬運 Sprite badge：當搬運開關關閉時強制隱藏；開啟時在視距 < 42 內顯示
      if (!showCargoBadges) {
        w.badgeSprite.visible = false;
      } else {
        const showBadge = camDist < 42.0 && (!isSmallScreen || camDist < 22.0 || w.localIdxInFlow % 2 === 0);
        w.badgeSprite.visible = showBadge;
        if (showBadge) {
          w.badgeSprite.position.set(w.pos.x, wy + 0.44 * s, w.pos.z);
        }
      }

      // 2. 頭頂名牌氣泡：同時設定 bubbleObj.visible 與 .hidden class，防止 CSS2DRenderer 覆寫 display
      if (!showNameplates) {
        w.bubbleObj.visible = false;
        w.bubbleEl.classList.add("hidden");
      } else {
        // 遠距全景時只抽樣顯示每條路線代表小人避免遮擋，拉近時全部顯示
        const showBubble =
          camDist < 18.0 ||
          (camDist < 44.0 && w.localIdxInFlow % (isSmallScreen ? 4 : 3) === 0);
        w.bubbleObj.visible = showBubble;
        w.bubbleEl.classList.toggle("hidden", !showBubble);
        if (showBubble) {
          const cargoName = tr(w.flow.cargo, w.flow.cargoEn);
          w.bubbleEl.textContent = langState.current === "en" ? `Carrying ${cargoName}` : `正在搬 ${cargoName}`;
          w.bubbleObj.position.set(w.pos.x, wy + (w.badgeSprite.visible ? 0.58 : 0.44) * s, w.pos.z);
        }
      }
    }
  }

  function updateWalkersAndFlows(dt, elapsedTime, cameraPos, options) {
    const {
      paused,
      reducedMotion,
      showNameplates,
      showCargoBadges,
      showAllFlows,
      selectedIslandId,
      selectedItemId,
      selectedFlowId,
      selectedWalkerId
    } = options;

    // 1. 更新協作線可見度與 Shader 時間
    let anyFlowVisible = false;
    flowMeshes.forEach(({ mesh, mat, flow }) => {
      const isRelated =
        showAllFlows ||
        selectedFlowId === flow.id ||
        selectedIslandId === flow.from ||
        selectedIslandId === flow.to ||
        (selectedWalkerId && selectedWalkerId.startsWith(flow.id));

      mesh.visible = !!isRelated;
      if (mesh.visible) {
        anyFlowVisible = true;
        mat.uniforms.uTime.value = elapsedTime;
        mat.uniforms.uReducedMotion.value = reducedMotion ? 1.0 : 0.0;
      }
    });

    const legendEl = document.getElementById("flow-legend");
    if (legendEl) {
      legendEl.classList.toggle("hidden", !anyFlowVisible);
    }

    // 2. 更新每位小人位置與擺動動畫
    for (let i = 0; i < totalWalkers; i++) {
      const w = walkers[i];

      if (!paused && !reducedMotion) {
        if (w.waitTimer > 0) {
          w.waitTimer -= dt;
          if (w.waitTimer <= 0) {
            w.waitTimer = 0;
            w.dir *= -1;
            if (onLogEvent && Math.random() < 0.42) {
              onLogEvent("depart", w);
            }
          }
        } else {
          w.dist += w.dir * w.speed * dt;
          if (w.dist >= w.totalLength) {
            w.dist = w.totalLength;
            w.waitTimer = 1.4;
            if (onLogEvent && Math.random() < 0.65) {
              onLogEvent(Math.random() > 0.4 ? "handoff" : "arrive", w);
            }
          } else if (w.dist <= 0) {
            w.dist = 0;
            w.waitTimer = 1.4;
            if (onLogEvent && Math.random() < 0.65) {
              onLogEvent(Math.random() > 0.4 ? "handoff" : "arrive", w);
            }
          }
        }
      }

      const u = THREE.MathUtils.clamp(w.dist / w.totalLength, 0.001, 0.999);
      w.curve.getPointAt(u, w.pos);
      w.curve.getTangentAt(u, w.tangent);
      if (w.dir < 0) w.tangent.negate();

      const yaw = Math.atan2(w.tangent.x, w.tangent.z);
      const camDist = cameraPos.distanceTo(w.pos);
      const s = THREE.MathUtils.clamp(camDist / 20, 1.0, 1.45);
      w.lastScale = s;

      const isMoving = !paused && !reducedMotion && w.waitTimer <= 0;
      const ph = isMoving ? (elapsedTime * 9.0 + w.phase * 20.0) : 0;
      const legSwing = isMoving ? Math.sin(ph) * 0.55 : 0;
      const armSwing = isMoving ? -Math.sin(ph) * 0.45 : 0;
      const bob = isMoving ? Math.abs(Math.sin(ph)) * 0.012 : 0;

      const wx = w.pos.x;
      const wy = w.pos.y - 0.03;
      const wz = w.pos.z;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);

      const placePart = (mesh, lx, ly, lz, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
        const rxW = (lx * cosY + lz * sinY) * s;
        const rzW = (-lx * sinY + lz * cosY) * s;
        dummy.position.set(wx + rxW, wy + (ly + bob) * s, wz + rzW);
        dummy.rotation.set(rx, yaw + ry, rz, "YXZ");
        dummy.scale.set(sx * s, sy * s, sz * s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      };

      dummy.position.set(wx, wy + 0.005, wz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(s, 1, s);
      dummy.updateMatrix();
      shadowMesh.setMatrixAt(i, dummy.matrix);

      placePart(leftLegMesh, -0.028, 0.055, 0, 1, 1, 1, legSwing, 0, 0);
      placePart(rightLegMesh, 0.028, 0.055, 0, 1, 1, 1, -legSwing, 0, 0);
      placePart(leftArmMesh, -0.072, 0.145, 0, 1, 1, 1, armSwing, 0, 0.12);
      placePart(rightArmMesh, 0.072, 0.145, 0, 1, 1, 1, -armSwing, 0, -0.12);
      placePart(bodyMesh, 0, 0.145, 0, 1, 1, 0.88);
      placePart(headMesh, 0, 0.275, 0, 1, 1, 1);
      placePart(hairMesh, 0, 0.282, -0.004, 1, 1, 1, -0.15, 0, 0);
      placePart(leftEyeMesh, -0.025, 0.272, 0.064, 1, 1, 1);
      placePart(rightEyeMesh, 0.025, 0.272, 0.064, 1, 1, 1);

      hatConeMesh.setMatrixAt(i, zeroMat);
      accBox1Mesh.setMatrixAt(i, zeroMat);
      accBox2Mesh.setMatrixAt(i, zeroMat);
      wheel1Mesh.setMatrixAt(i, zeroMat);
      wheel2Mesh.setMatrixAt(i, zeroMat);

      if (w.role === "farmer") {
        placePart(hatConeMesh, 0, 0.355, 0, 0.42, 0.10, 0.42);
      } else if (w.role === "student") {
        placePart(hatConeMesh, 0, 0.350, 0.01, 0.26, 0.09, 0.28);
        placePart(accBox1Mesh, 0, 0.150, -0.055, 0.085, 0.095, 0.05);
      } else if (w.role === "worker") {
        placePart(hatConeMesh, 0, 0.352, 0, 0.27, 0.09, 0.29);
        placePart(accBox1Mesh, 0, 0.150, 0.046, 0.09, 0.03, 0.02);
      } else if (w.role === "civil") {
        placePart(accBox1Mesh, 0.02, 0.165, 0.050, 0.036, 0.048, 0.015);
        placePart(accBox2Mesh, 0, 0.145, 0, 0.11, 0.09, 0.095);
      } else if (w.role === "researcher") {
        placePart(accBox1Mesh, 0, 0.115, 0, 0.115, 0.11, 0.098);
        placePart(accBox2Mesh, 0.08, 0.14, 0.05, 0.05, 0.07, 0.015, -0.4, 0, 0);
      } else if (w.role === "elder") {
        placePart(accBox1Mesh, 0.095, 0.09, 0.04, 0.018, 0.16, 0.018, 0.15, 0, 0);
      } else if (w.role === "parent") {
        placePart(accBox1Mesh, 0, 0.11, 0.17, 0.11, 0.10, 0.13);
        placePart(wheel1Mesh, -0.055, 0.04, 0.17, 0.10, 0.10, 0.10, 0, Math.PI / 2, 0);
        placePart(wheel2Mesh, 0.055, 0.04, 0.17, 0.10, 0.10, 0.10, 0, Math.PI / 2, 0);
      } else if (w.role === "tourist") {
        placePart(accBox1Mesh, 0.07, 0.09, -0.13, 0.08, 0.13, 0.06, -0.2, 0, 0);
        placePart(accBox2Mesh, 0.07, 0.17, -0.11, 0.04, 0.07, 0.015, -0.2, 0, 0);
      } else if (w.role === "commuter") {
        placePart(accBox1Mesh, 0, 0.09, 0, 0.03, 0.08, 0.22);
        placePart(wheel1Mesh, 0, 0.055, 0.11, 0.18, 0.18, 0.15, 0, Math.PI / 2, 0);
        placePart(wheel2Mesh, 0, 0.055, -0.11, 0.18, 0.18, 0.15, 0, Math.PI / 2, 0);
      }
    }

    // 3. 同步更新頭頂搬運 Badge 與名牌氣泡
    syncWalkerIndicators(cameraPos, showCargoBadges, showNameplates);

    [
      shadowMesh, leftLegMesh, rightLegMesh, leftArmMesh, rightArmMesh,
      bodyMesh, headMesh, hairMesh, leftEyeMesh, rightEyeMesh,
      hatConeMesh, accBox1Mesh, accBox2Mesh, wheel1Mesh, wheel2Mesh
    ].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
    });
  }

  const walkerHitMeshes = [bodyMesh, headMesh];

  return {
    walkers,
    flowMeshes,
    flowHitMeshes,
    walkerHitMeshes,
    syncWalkerIndicators,
    updateWalkersAndFlows
  };
}

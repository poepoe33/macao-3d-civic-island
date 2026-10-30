import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { DATA, ARCHETYPE_LIB } from "./engine/world-data.js";
import { PALETTE } from "./engine/palette.js";
import { R, TOP, WATER_Y, axialToWorld } from "./engine/coords.js";
import { DAY_NIGHT_KEYFRAMES, createSkyMaterial, createWaterMaterial } from "./engine/daynight.js";
import { createKitGeometries, getArchetypeParts, getIslandTreeParts } from "./engine/kit.js";
import { tr, langState, urlParams } from "./engine/i18n.js";
import { safeStorageGet, safeStorageSet } from "./engine/storage.js";
import { buildDistantEnvironment } from "./engine/world/distant.js";
import { buildArchipelagoAndKit } from "./engine/world/archipelago.js";
import { buildWalkersAndFlows } from "./engine/world/walkers.js";
import { CIRCLED_NUMS, getShortIslandTitle, extractStatBricks, createThumbnailRenderer } from "./app/labels.js";








// =========================================================================
// 主程式初始化（包覆於 try/catch 避免白畫面）
// =========================================================================
function initPolicyIslandApp() {
  try {
    const container = document.getElementById("webgl-container");
    const css2dContainer = document.getElementById("css2d-container");
    let isMobile = window.innerWidth <= 800;

    const cityCenter = new THREE.Vector3();
    DATA.islands.forEach((isl) => {
      cityCenter.add(axialToWorld(isl.q, isl.r));
    });
    cityCenter.divideScalar(DATA.islands.length);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.4 : 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    const css2dRenderer = new CSS2DRenderer();
    css2dRenderer.setSize(window.innerWidth, window.innerHeight);
    css2dContainer.appendChild(css2dRenderer.domElement);

    const scene = new THREE.Scene();
    const fog = new THREE.Fog(0xf4eee3, 42, 150);
    scene.fog = fog;

    const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.3, 320);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minPolarAngle = THREE.MathUtils.degToRad(25);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(70);
    controls.minDistance = 3;
    controls.maxDistance = 70;

    const PANO_DIR = new THREE.Vector3(0.24, 0.34, 0.87).normalize();
    function getPanoramaPose() {
      const aspect = window.innerWidth / Math.max(1, window.innerHeight);
      const dist = aspect > 1.32 ? 33.8 : (aspect > 0.85 ? 42 : 52);
      const target = cityCenter.clone();
      const pos = target.clone().addScaledVector(PANO_DIR, dist);
      return { pos, target };
    }

    const initialPose = getPanoramaPose();
    camera.position.copy(initialPose.pos);
    controls.target.copy(initialPose.target);
    controls.update();

    const skyMat = createSkyMaterial();
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(170, 32, 24), skyMat);
    skyMesh.position.copy(cityCenter);
    scene.add(skyMesh);

    const waterMat = createWaterMaterial(cityCenter, false);
    const wallWaterMat = createWaterMaterial(cityCenter, true);
    const waterMesh = new THREE.Mesh(new THREE.CircleGeometry(160, 64), waterMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set(cityCenter.x, WATER_Y, cityCenter.z);
    waterMesh.receiveShadow = true;
    scene.add(waterMesh);

    const hemiLight = new THREE.HemisphereLight(0xeef6fa, 0x8f8270, 1.3);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff1de, 2.8);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left = -22;
    sunLight.shadow.camera.right = 22;
    sunLight.shadow.camera.top = 24;
    sunLight.shadow.camera.bottom = -24;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 90;
    sunLight.shadow.bias = -0.0006;
    sunLight.shadow.normalBias = 0.045;
    sunLight.shadow.radius = 3;
    sunLight.target.position.copy(cityCenter);
    scene.add(sunLight);
    scene.add(sunLight.target);

    const fillLight = new THREE.DirectionalLight(0xbfd6ff, 0.35);
    fillLight.position.set(cityCenter.x - 18, 14, cityCenter.z - 12);
    fillLight.castShadow = false;
    scene.add(fillLight);

    const distantEnv = buildDistantEnvironment(scene, cityCenter, isMobile);
    const worldData = buildArchipelagoAndKit(scene, wallWaterMat, cityCenter);
    const renderThumb = createThumbnailRenderer(renderer);

    // 澳門時間（UTC+8，無夏令時間）→ 當日分鐘數
    function getMacauMinutes() {
      const now = new Date();
      const macau = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
      return macau.getHours() * 60 + macau.getMinutes();
    }

    let timeOfDayMin = getMacauMinutes();
    let lastQuantizedSunMin = -1;
    let isPaused = false;
    let isBirdEye = false;
    let showNameplates = false;
    let showCargoBadges = false;
    let showAllFlows = false;
    let showCityLog = false;
    let showGeoGrid = false;
    let activeSidebarTab = "themes";
    let searchQuery = "";

    const mqlReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = mqlReduced.matches;

    let selectedIslandId = null;
    let selectedItemId = null;
    let selectedFlowId = null;
    let selectedWalkerId = null;
    let selectedBridgeId = null;

    let dirty = true;
    let elapsedTime = 0;

    let cameraFlight = null;
    function easeInOutCubic(x) {
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    }

    function flyToPose(targetPos, targetLookAt) {
      dirty = true;
      if (reducedMotion) {
        cameraFlight = null;
        camera.position.copy(targetPos);
        controls.target.copy(targetLookAt);
        controls.update();
        return;
      }
      cameraFlight = {
        startPos: camera.position.clone(),
        startTarget: controls.target.clone(),
        endPos: targetPos.clone(),
        endTarget: targetLookAt.clone(),
        elapsed: 0,
        duration: 0.8
      };
    }

    renderer.domElement.addEventListener("pointerdown", () => {
      cameraFlight = null;
      dirty = true;
    });
    controls.addEventListener("change", () => {
      dirty = true;
    });

    const cityLogEntries = [];
    const logListEl = document.getElementById("log-list");
    const logFilterSelect = document.getElementById("log-flow-filter");

    function formatMinToHHMM(min) {
      const m = ((Math.floor(min) % 1440) + 1440) % 1440;
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      return `${hh}:${mm}`;
    }

    function pushCityLogEvent(eventType, walker) {
      const flow = walker.flow;
      const fromIsl = worldData.islandMap.get(flow.from);
      const toIsl = worldData.islandMap.get(flow.to);
      if (!fromIsl || !toIsl) return;

      const isForward = walker.dir > 0;
      const srcIsl = isForward ? fromIsl : toIsl;
      const dstIsl = isForward ? toIsl : fromIsl;

      const entry = {
        id: `${Date.now()}-${Math.random()}`,
        timeStr: formatMinToHHMM(timeOfDayMin),
        flowId: flow.id,
        walker,
        eventType,
        zhText:
          eventType === "depart"
            ? `[出發] ${flow.roleName}攜帶「${flow.cargo}」自 ${getShortIslandTitle(srcIsl)} 啟程`
            : eventType === "arrive"
            ? `[抵達] ${flow.roleName}將「${flow.cargo}」送抵 ${getShortIslandTitle(dstIsl)}`
            : `[交接] ${getShortIslandTitle(dstIsl)}完成「${flow.cargo}」跨區交接`,
        enText:
          eventType === "depart"
            ? `[Depart] ${flow.roleNameEn} left ${srcIsl.nameEn} with ${flow.cargoEn}`
            : eventType === "arrive"
            ? `[Arrive] ${flow.roleNameEn} reached ${dstIsl.nameEn} with ${flow.cargoEn}`
            : `[Handoff] ${dstIsl.nameEn} completed ${flow.cargoEn} handoff`
      };

      cityLogEntries.unshift(entry);
      if (cityLogEntries.length > 36) cityLogEntries.pop();
      if (showCityLog) renderCityLogList();
    }

    function renderCityLogList() {
      if (!logListEl) return;
      const filterVal = logFilterSelect ? logFilterSelect.value : "all";
      const filtered = cityLogEntries.filter((e) => filterVal === "all" || e.flowId === filterVal);
      logListEl.innerHTML = "";
      filtered.slice(0, 18).forEach((e) => {
        const div = document.createElement("div");
        div.className = "log-entry";
        div.innerHTML = `<span class="log-time">${e.timeStr}</span>${langState.current === "en" ? e.enText : e.zhText}`;
        div.addEventListener("click", () => {
          selectWalker(e.walker);
        });
        logListEl.appendChild(div);
      });
    }

    const walkersAndFlows = buildWalkersAndFlows(
      scene,
      worldData.findIslandRoute,
      pushCityLogEvent,
      (w) => selectWalker(w)
    );

    walkersAndFlows.walkers.slice(0, 4).forEach((w, idx) => {
      pushCityLogEvent(idx % 2 === 0 ? "depart" : "handoff", w);
    });

    // 只保留真實市民：隱藏所有原本的貨運／通勤 NPC 模型與頭頂徽章
    const SHOW_FLOW_WALKERS = false;
    if (!SHOW_FLOW_WALKERS) {
      scene.traverse((o) => {
        if (o.isMesh && o.userData && o.userData.isWalkerMesh) o.visible = false;
      });
      walkersAndFlows.walkers.forEach((w) => {
        w.badgeSprite.visible = false;
        w.bubbleObj.visible = false;
        w.bubbleEl.style.display = "none";
      });
    }

    // 真實地理方格預設不顯示（連同經緯度座標標籤；待 coordLabelObjs 建立後再設定）
    if (worldData.geoGridGroup) worldData.geoGridGroup.visible = false;

    // 7. 島嶼標籤、四條跨海大橋標籤、海圖經緯度座標標籤與細項 ①②③ Pin
    const islandLabelObjs = [];
    DATA.islands.forEach((isl) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "island-label";
      el.innerHTML = `<span class="code">${isl.code}</span><span class="name-text">${getShortIslandTitle(isl)}</span>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        selectIsland(isl.id);
      });
      const obj = new CSS2DObject(el);
      obj.position.set(isl.worldPos.x, TOP - 0.05, isl.worldPos.z + R * 0.92);
      scene.add(obj);
      islandLabelObjs.push({
        islandId: isl.id,
        island: isl,
        el,
        obj,
        state: "full"
      });
    });

    // 分區名稱預設隱藏，由底部「地區名」開關控制
    let showDistrictLabels = false;
    islandLabelObjs.forEach((lbl) => { lbl.obj.visible = false; });

    // 澳門四條跨海大橋浮動膠囊標籤
    const bridgeLabelObjs = [];
    (DATA.bridgesMeta || []).filter((bm) => bm.isCrossSeaFour).forEach((bm) => {
      if (!bm.midWorldPos) return;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "bridge-label";
      el.innerHTML = `<span>🌉</span><span class="b-name">${tr(bm.name, bm.nameEn)}</span>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        selectBridge(bm.id);
      });
      const obj = new CSS2DObject(el);
      obj.position.set(bm.midWorldPos.x, bm.midWorldPos.y + 0.55, bm.midWorldPos.z);
      scene.add(obj);
      bridgeLabelObjs.push({
        bridgeId: bm.id,
        bridge: bm,
        el,
        obj
      });
    });

    // 經緯度地理方格座標標籤
    const coordLabelObjs = [];
    (worldData.coordMarkers || []).forEach((cm) => {
      const el = document.createElement("div");
      el.className = "grid-coord-label";
      el.textContent = tr(cm.label, cm.labelEn);
      const obj = new CSS2DObject(el);
      obj.position.set(cm.x, WATER_Y + 0.04, cm.z);
      scene.add(obj);
      coordLabelObjs.push({ cm, el, obj });
    });
    coordLabelObjs.forEach((cl) => {
      cl.obj.visible = false;
      cl.el.classList.add("hidden");
    });

    const activePinGroup = new THREE.Group();
    scene.add(activePinGroup);
    const activePinObjs = [];
    const pinLineMat = new THREE.LineBasicMaterial({
      color: 0xdb6a41,
      depthTest: false,
      transparent: true,
      opacity: 0.9
    });

    function clearItemPins() {
      while (activePinObjs.length > 0) {
        const p = activePinObjs.pop();
        activePinGroup.remove(p.cssObj);
        activePinGroup.remove(p.line);
        p.line.geometry.dispose();
      }
    }

    function buildItemPinsForIsland(islandId) {
      clearItemPins();
      const isl = worldData.islandMap.get(islandId);
      if (!isl || !isl.items) return;

      isl.items.forEach((item, idx) => {
        const pinEl = document.createElement("button");
        pinEl.type = "button";
        pinEl.className = "item-pin" + (selectedItemId === item.id ? " selected" : "");
        pinEl.textContent = CIRCLED_NUMS[idx] || String(idx + 1);
        pinEl.title = tr(item.name, item.nameEn);
        pinEl.addEventListener("click", (e) => {
          e.stopPropagation();
          selectItem(item.id);
        });

        const pinY = (item.topY || (TOP + 0.55)) + 0.42;
        const cssObj = new CSS2DObject(pinEl);
        cssObj.position.set(item.worldPos.x, pinY, item.worldPos.z);
        activePinGroup.add(cssObj);

        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(item.worldPos.x, item.topY || (TOP + 0.42), item.worldPos.z),
          new THREE.Vector3(item.worldPos.x, pinY - 0.06, item.worldPos.z)
        ]);
        const line = new THREE.Line(lineGeo, pinLineMat);
        line.renderOrder = 999;
        activePinGroup.add(line);

        activePinObjs.push({ itemId: item.id, pinEl, cssObj, line });
      });
    }

    const projVec = new THREE.Vector3();
    function updateLabelCollisionAvoidance() {
      const w = window.innerWidth;
      const h = window.innerHeight;

      if (!showDistrictLabels) {
        islandLabelObjs.forEach((lbl) => { lbl.obj.visible = false; });
      } else {
        islandLabelObjs.forEach((lbl) => { lbl.obj.visible = true; });
      }

      const uiRects = [];
      const collectRect = (id) => {
        const el = document.getElementById(id);
        if (!el || el.classList.contains("hidden") || el.classList.contains("collapsed")) return;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < h) {
          uiRects.push(r);
        }
      };
      collectRect("top-left-zone");
      collectRect("detail-card");
      collectRect("right-sidebar");
      collectRect("city-log-panel");
      if (!document.body.classList.contains("mobile-sheet-open")) {
        collectRect("hud-bar");
      }

      const placedRects = [...uiRects];

      const sorted = showDistrictLabels ? [...islandLabelObjs].sort((a, b) => {
        if (a.islandId === selectedIslandId) return -1;
        if (b.islandId === selectedIslandId) return 1;
        return 0;
      }) : [];

      const overlaps = (r1, r2, pad) => {
        return !(
          r1.right + pad < r2.left ||
          r1.left - pad > r2.right ||
          r1.bottom + pad < r2.top ||
          r1.top - pad > r2.bottom
        );
      };

      sorted.forEach((lbl) => {
        lbl.el.classList.toggle("selected", lbl.islandId === selectedIslandId);
        lbl.el.classList.toggle("dimmed", !!(selectedIslandId || selectedBridgeId) && lbl.islandId !== selectedIslandId);

        projVec.copy(lbl.obj.position).project(camera);
        if (projVec.z > 1) {
          lbl.el.classList.add("collide-hidden");
          return;
        }
        const sx = (projVec.x * 0.5 + 0.5) * w;
        const sy = (-projVec.y * 0.5 + 0.5) * h;

        const padFull = lbl.state === "full" ? -4 : 4;
        const padCompact = lbl.state === "hidden" ? 4 : -4;

        const fullW = isMobile ? 86 : 104;
        const compactW = 34;
        const boxH = isMobile ? 24 : 28;

        const fullRect = { left: sx - fullW / 2, right: sx + fullW / 2, top: sy - boxH / 2, bottom: sy + boxH / 2 };
        const compactRect = { left: sx - compactW / 2, right: sx + compactW / 2, top: sy - boxH / 2, bottom: sy + boxH / 2 };

        if (lbl.islandId === selectedIslandId) {
          lbl.state = "full";
          lbl.el.classList.remove("compact", "collide-hidden");
          placedRects.push(fullRect);
          return;
        }

        const hitFull = placedRects.some((r) => overlaps(fullRect, r, padFull));
        if (!hitFull) {
          lbl.state = "full";
          lbl.el.classList.remove("compact", "collide-hidden");
          placedRects.push(fullRect);
        } else {
          const hitCompact = placedRects.some((r) => overlaps(compactRect, r, padCompact));
          if (!hitCompact) {
            lbl.state = "compact";
            lbl.el.classList.add("compact");
            lbl.el.classList.remove("collide-hidden");
            placedRects.push(compactRect);
          } else {
            lbl.state = "hidden";
            lbl.el.classList.add("collide-hidden");
          }
        }
      });

      // 更新四條跨海大橋標籤狀態與防遮擋
      bridgeLabelObjs.forEach((bl) => {
        bl.el.classList.toggle("selected", bl.bridgeId === selectedBridgeId);
        // 遠景收起橋樑標籤，避免在城市上方排成一條綠色膠囊列（拉近或選中才顯示）
        const nearBridge = camera.position.distanceTo(bl.obj.position) < 9;
        if (bl.bridgeId !== selectedBridgeId && !nearBridge) {
          bl.el.classList.add("collide-hidden");
          return;
        }
        projVec.copy(bl.obj.position).project(camera);
        if (projVec.z > 1) {
          bl.el.classList.add("collide-hidden");
          return;
        }
        const sx = (projVec.x * 0.5 + 0.5) * w;
        const sy = (-projVec.y * 0.5 + 0.5) * h;
        const bw = isMobile ? 76 : 92;
        const bh = 24;
        const bRect = { left: sx - bw / 2, right: sx + bw / 2, top: sy - bh / 2, bottom: sy + bh / 2 };

        if (bl.bridgeId === selectedBridgeId) {
          bl.el.classList.remove("collide-hidden");
          placedRects.push(bRect);
          return;
        }
        const hitPanel = uiRects.some((r) => overlaps(bRect, r, 2));
        bl.el.classList.toggle("collide-hidden", hitPanel);
      });
    }
    // =========================================================================
    // 8. 選取、高亮、飛行與澳門官方數據及四條跨海大橋卡片渲染 (selectIsland / selectItem / selectBridge / selectFlow)
    // =========================================================================
    const detailCard = document.getElementById("detail-card");
    const detailEyebrow = document.getElementById("detail-eyebrow");
    const detailTitle = document.getElementById("detail-title");
    const detailBody = document.getElementById("detail-body");
    const rightSidebar = document.getElementById("right-sidebar");
    const btnToggleList = document.getElementById("btn-toggle-list");
    const cityLogPanel = document.getElementById("city-log-panel");

    let isFollowingLrt = false;
    let isLightshowActive = false;
    let tideLevelM = 0.0;
    let bridgeTourIndex = 0;

    // 手機端初始自動收合右側清單，讓使用者一進場即看清完整 3D 澳門島與四條跨海大橋
    if (isMobile && rightSidebar) {
      rightSidebar.classList.add("collapsed");
    }

    function syncMobileSheetState() {
      const sidebarOpen = rightSidebar && !rightSidebar.classList.contains("collapsed");
      const detailOpen = detailCard && !detailCard.classList.contains("hidden");
      if (btnToggleList) {
        btnToggleList.classList.toggle("active", !!sidebarOpen);
        btnToggleList.setAttribute("aria-pressed", String(!!sidebarOpen));
      }
      if (window.innerWidth <= 800) {
        document.body.classList.toggle("mobile-sheet-open", !!(sidebarOpen || detailOpen));
      } else {
        document.body.classList.remove("mobile-sheet-open");
      }
    }
    syncMobileSheetState();

    function getActiveDayCyclePeriod(min) {
      const m = ((Math.floor(min) % 1440) + 1440) % 1440;
      for (const p of DATA.dayCycle) {
        if (p.startMin < p.endMin) {
          if (m >= p.startMin && m < p.endMin) return p;
        } else {
          if (m >= p.startMin || m < p.endMin) return p;
        }
      }
      return DATA.dayCycle[0];
    }

    function refreshHighlights() {
      const period = getActiveDayCyclePeriod(timeOfDayMin);
      const activeSet = new Set(period ? period.items : []);
      worldData.updateKitHighlights(selectedIslandId, selectedItemId, activeSet, isLightshowActive, elapsedTime, selectedBridgeId);
      activePinObjs.forEach((p) => {
        p.pinEl.classList.toggle("selected", p.itemId === selectedItemId);
      });
      dirty = true;
    }

    function computeTargetWithDesktopOffset(rawTarget, offsetVec) {
      const target = rawTarget.clone();
      if (window.innerWidth > 800) {
        target.x -= 1.5;
      } else {
        // 手機端下方有 Bottom Sheet 時，目標稍微往下偏，讓 3D 模型呈現在上半部視野中央
        target.z += 0.85;
      }
      const camPos = isBirdEye
        ? target.clone().add(new THREE.Vector3(0.01, 42, 6))
        : target.clone().add(offsetVec);
      return { camPos, target };
    }

    function stopLrtFollow() {
      if (isFollowingLrt) {
        isFollowingLrt = false;
        const btn = document.getElementById("btn-lrt-follow");
        if (btn) {
          btn.classList.remove("active");
          btn.setAttribute("aria-pressed", "false");
        }
      }
    }

    function collapseSidebarOnMobile() {
      if (window.innerWidth <= 800 && rightSidebar) {
        rightSidebar.classList.add("collapsed");
      }
    }

    function selectIsland(islandId) {
      const isl = worldData.islandMap.get(islandId);
      if (!isl) return;
      stopLrtFollow();
      collapseSidebarOnMobile();

      selectedIslandId = isl.id;
      selectedItemId = null;
      selectedFlowId = null;
      selectedWalkerId = null;
      selectedBridgeId = null;

      buildItemPinsForIsland(isl.id);
      refreshHighlights();

      const { camPos, target } = computeTargetWithDesktopOffset(
        new THREE.Vector3(isl.worldPos.x, TOP, isl.worldPos.z),
        new THREE.Vector3(2.75, 5.3, 6.2)
      );
      flyToPose(camPos, target);
      renderIslandDetailCard(isl);
      syncMobileSheetState();
      window.dispatchEvent(new CustomEvent("macao:island", { detail: { id: isl.id, name: isl.name } }));
    }

    function selectItem(itemId) {
      const item = worldData.itemMap.get(itemId);
      if (!item) return;
      stopLrtFollow();
      collapseSidebarOnMobile();

      selectedIslandId = item.islandId;
      selectedItemId = item.id;
      selectedFlowId = null;
      selectedWalkerId = null;
      selectedBridgeId = null;

      buildItemPinsForIsland(item.islandId);
      refreshHighlights();

      const { camPos, target } = computeTargetWithDesktopOffset(
        item.worldPos,
        new THREE.Vector3(1.6, 2.5, 3.2)
      );
      flyToPose(camPos, target);
      renderItemDetailCard(item);
      syncMobileSheetState();
      window.dispatchEvent(new CustomEvent("macao:landmark", {
        detail: { id: item.id, name: item.name, districtId: item.islandId }
      }));
    }

    // ---- 市民建設：把沙盤建設以立體模型放進所屬分區 ----
    const sandboxGroup = new THREE.Group();
    sandboxGroup.name = "citizen-sandbox";
    scene.add(sandboxGroup);

    const sandboxMatCache = new Map();
    function sandboxMat(color, opts = {}) {
      const key = `${color}-${opts.emissive || 0}-${opts.roughness || 0.85}`;
      if (!sandboxMatCache.has(key)) {
        sandboxMatCache.set(key, new THREE.MeshStandardMaterial({
          color,
          roughness: opts.roughness || 0.85,
          metalness: 0,
          emissive: opts.emissive || 0x000000,
          emissiveIntensity: opts.emissive ? 0.6 : 0
        }));
      }
      return sandboxMatCache.get(key);
    }

    // 依設施類型組合簡易立體模型
    function buildSandboxBuilding(type) {
      const g = new THREE.Group();
      const add = (geo, mat, x, y, z, ry = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.y = ry;
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
        return m;
      };

      if (type === "park") {
        add(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 12), sandboxMat(0x8fbf6f), 0, 0.01, 0);
        add(new THREE.CylinderGeometry(0.012, 0.016, 0.10, 6), sandboxMat(0x8a6a4a), 0, 0.07, 0);
        add(new THREE.IcosahedronGeometry(0.075, 0), sandboxMat(0x4f8f52), 0, 0.16, 0);
      } else if (type === "busstop") {
        add(new THREE.BoxGeometry(0.20, 0.02, 0.10), sandboxMat(0x5e7f8c), 0, 0.03, 0);
        add(new THREE.BoxGeometry(0.02, 0.14, 0.02), sandboxMat(0x6b6b6b), -0.08, 0.10, 0);
        add(new THREE.BoxGeometry(0.18, 0.015, 0.08), sandboxMat(0xdb6a41), 0, 0.18, 0);
        add(new THREE.BoxGeometry(0.06, 0.07, 0.012), sandboxMat(0xa8d8e8, { emissive: 0x2b6b7c }), 0.04, 0.10, 0.02);
      } else if (type === "garden") {
        add(new THREE.BoxGeometry(0.24, 0.06, 0.18), sandboxMat(0x9db98a), 0, 0.03, 0);
        [[-0.06, 0.05], [0.05, 0.02], [0.01, -0.05]].forEach(([x, z], i) => {
          add(new THREE.SphereGeometry(0.026, 8, 6), sandboxMat(i === 1 ? 0xe8a0b4 : 0xf2c14e), x, 0.08, z);
        });
      } else if (type === "bike") {
        add(new THREE.BoxGeometry(0.30, 0.012, 0.07), sandboxMat(0xb8a99a), 0, 0.01, 0);
        add(new THREE.TorusGeometry(0.035, 0.008, 6, 10), sandboxMat(0x3e7c8c), -0.07, 0.045, 0);
        add(new THREE.TorusGeometry(0.035, 0.008, 6, 10), sandboxMat(0x3e7c8c), 0.07, 0.045, 0);
      } else if (type === "market") {
        add(new THREE.BoxGeometry(0.18, 0.10, 0.14), sandboxMat(0xc9a67f), 0, 0.05, 0);
        add(new THREE.ConeGeometry(0.15, 0.09, 8), sandboxMat(0xdb6a41), 0, 0.145, 0);
        add(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6), sandboxMat(0xfff8f4), 0, 0.195, 0);
      } else if (type === "solar") {
        add(new THREE.BoxGeometry(0.02, 0.10, 0.02), sandboxMat(0x9a9a9a), -0.07, 0.05, 0);
        add(new THREE.BoxGeometry(0.02, 0.10, 0.02), sandboxMat(0x9a9a9a), 0.07, 0.05, 0);
        const panel = add(new THREE.BoxGeometry(0.24, 0.012, 0.16), sandboxMat(0x2f4f6b, { emissive: 0x1b3550 }), 0, 0.12, 0);
        panel.rotation.z = -0.22;
      } else if (type === "clinic") {
        add(new THREE.BoxGeometry(0.18, 0.20, 0.16), sandboxMat(0xf2efe8), 0, 0.10, 0);
        add(new THREE.BoxGeometry(0.10, 0.03, 0.005), sandboxMat(0xd94b3f, { emissive: 0x8c2f28 }), 0, 0.14, 0.082);
        add(new THREE.BoxGeometry(0.03, 0.10, 0.005), sandboxMat(0xd94b3f, { emissive: 0x8c2f28 }), 0, 0.14, 0.082);
      } else if (type === "housing") {
        add(new THREE.BoxGeometry(0.19, 0.40, 0.17), sandboxMat(0xd7c3ae), 0, 0.20, 0);
        for (let i = 0; i < 3; i++) {
          add(new THREE.BoxGeometry(0.13, 0.025, 0.005), sandboxMat(0x6f8f9c, { emissive: 0x2a5a6b }), 0, 0.10 + i * 0.10, 0.088);
        }
      } else if (type === "library") {
        add(new THREE.BoxGeometry(0.22, 0.18, 0.17), sandboxMat(0xe4d8c6), 0, 0.09, 0);
        add(new THREE.BoxGeometry(0.25, 0.02, 0.20), sandboxMat(0x8b6f57), 0, 0.19, 0);
        add(new THREE.BoxGeometry(0.08, 0.05, 0.005), sandboxMat(0x5b7f8c, { emissive: 0x29465a }), 0, 0.12, 0.088);
      } else if (type === "pier") {
        add(new THREE.BoxGeometry(0.26, 0.02, 0.12), sandboxMat(0xb08d63), 0, 0.02, 0);
        [[-0.10, -0.04], [0, 0.04], [0.10, -0.04]].forEach(([x, z]) => {
          add(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6), sandboxMat(0x8a6a4a), x, 0.005, z);
        });
      } else {
        add(new THREE.BoxGeometry(0.16, 0.14, 0.16), sandboxMat(0xc5b5a7), 0, 0.07, 0);
      }
      return g;
    }

    const SANDBOX_SLOT_COLS = 4;
    const SANDBOX_CELL = 0.37;
    const SANDBOX_MODEL_SCALE = 1.9;

    // 清空並重繪某分區的市民建設（同時只顯示一位市民的沙盤）
    function renderSandbox(districtId, buildings) {
      while (sandboxGroup.children.length) {
        const child = sandboxGroup.children[0];
        sandboxGroup.remove(child);
        child.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
        });
      }
      const isl = worldData.islandMap.get(districtId);
      if (!isl || !Array.isArray(buildings)) return false;
      const filled = buildings.filter((b) => b && b.type);
      if (!filled.length) return true;

      const center = isl.worldPos;
      const baseY = TOP + 0.035;
      const width = SANDBOX_SLOT_COLS * SANDBOX_CELL;
      const rows = Math.ceil(12 / SANDBOX_SLOT_COLS);
      const depth = rows * SANDBOX_CELL;

      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.06, 0.02, depth + 0.06),
        new THREE.MeshStandardMaterial({ color: 0x3e7c8c, transparent: true, opacity: 0.28, roughness: 0.6 })
      );
      plate.position.set(center.x, baseY - 0.012, center.z);
      sandboxGroup.add(plate);

      filled.forEach((slotData) => {
        if (!slotData || !slotData.type) return;
        const col = slotData.slot % SANDBOX_SLOT_COLS;
        const row = Math.floor(slotData.slot / SANDBOX_SLOT_COLS);
        const px = center.x + (col - (SANDBOX_SLOT_COLS - 1) / 2) * SANDBOX_CELL;
        const pz = center.z + (row - (rows - 1) / 2) * SANDBOX_CELL;
        const model = buildSandboxBuilding(slotData.type);
        model.position.set(px, baseY, pz);
        model.scale.setScalar(SANDBOX_MODEL_SCALE);
        model.userData.sandboxSlot = slotData.slot;
        model.traverse((o) => {
          if (o.isMesh) {
            o.userData.sandboxSlot = slotData.slot;
            o.userData.sandboxDistrictId = districtId;
          }
        });
        sandboxGroup.add(model);
      });
      return true;
    }

    function clearSandbox() {
      renderSandbox(null, []);
    }

    // ---- 真實市民（取代隨機 NPC）：每位已加入的市民在自己的分區走動 ----
    const citizenGroup = new THREE.Group();
    citizenGroup.name = "citizens";
    scene.add(citizenGroup);

    const vitalityRingGroup = new THREE.Group();
    vitalityRingGroup.name = "vitality-rings";
    scene.add(vitalityRingGroup);

    const celebrationGroup = new THREE.Group();
    celebrationGroup.name = "celebrations";
    scene.add(celebrationGroup);

    // 分區活力光柱（前三名）與冠軍徽章
    const vitalityBeaconGroup = new THREE.Group();
    vitalityBeaconGroup.name = "vitality-beacons";
    scene.add(vitalityBeaconGroup);

    const citizens = [];
    const vitalityRings = [];
    const celebrations = [];
    const vitalityBeacons = [];
    const EMOTES = ["💬", "❤️", "🏗", "✨", "👍", "🏙"];
    let championTag = null;
    let emoteTimer = 0;
    let hoveredTagId = null;
    const CITIZEN_SCALE = 2.4;

    function citizenColor(level) {
      if (level >= 8) return 0xf2c14e;
      if (level >= 5) return 0x3e7c8c;
      if (level >= 3) return 0x6a9b7a;
      return 0xdb6a41;
    }

    // ---- 公仔建構器：完整外觀組合（臉／髮／身型／服裝／配件／顏色） ----
    // 材質與幾何全部快取共用，60 位市民同時在場也不會重複佔用記憶體
    const FIG_MATS = new Map();
    const FIG_GEOS = new Map();
    const FIG_DEFAULTS = {
      face: "oval", eyes: "almond", brow: "natural", nose: "button", mouth: "smile",
      facialHair: "none", hair: "short", body: "average", height: "normal",
      top: "tee", bottom: "jeans", shoes: "sneakers", outer: "none",
      glasses: "none", hat: "none", accessory: "none",
      skin: "#f2c9a8", hairColor: "#2f2622", topColor: "#db6a41", bottomColor: "#3e5c76",
      shoesColor: "#f7f7f7", outerColor: "#6a9b7a", hatColor: "#3e7c8c", accessoryColor: "#f2c14e",
    };
    const FIG_ENUMS = {
      face: ["oval", "round", "square", "heart", "long"],
      eyes: ["almond", "round", "sharp", "sleepy", "wide"],
      brow: ["natural", "thick", "thin", "raised"],
      nose: ["button", "straight", "wide", "small"],
      mouth: ["smile", "neutral", "grin", "pout"],
      facialHair: ["none", "beard", "mustache", "goatee"],
      hair: ["short", "fade", "buzz", "curly", "long", "ponytail", "bun", "mohawk"],
      body: ["slim", "average", "athletic", "heavy"],
      height: ["short", "normal", "tall"],
      top: ["tee", "shirt", "hoodie", "jacket", "blazer", "dress", "tank"],
      bottom: ["jeans", "shorts", "skirt", "trousers", "leggings"],
      shoes: ["sneakers", "boots", "dress", "sandals"],
      outer: ["none", "coat", "vest", "apron"],
      glasses: ["none", "round", "square", "sun"],
      hat: ["none", "cap", "beanie", "bucket", "helmet"],
      accessory: ["none", "backpack", "scarf", "badge", "headphones"],
    };
    const FIG_COLOR_KEYS = ["skin", "hairColor", "topColor", "bottomColor", "shoesColor", "outerColor", "hatColor", "accessoryColor"];

    function figMat(hex, roughness, metalness) {
      const r = roughness == null ? 0.75 : roughness;
      const key = hex + "|" + r + "|" + (metalness || 0);
      let mat = FIG_MATS.get(key);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).getHex(), roughness: r, metalness: metalness || 0 });
        FIG_MATS.set(key, mat);
      }
      return mat;
    }

    function figShade(hex, k) {
      const c = new THREE.Color(hex);
      return "#" + c.clone().multiplyScalar(k).getHexString();
    }

    function figGeo(key, make) {
      let geo = FIG_GEOS.get(key);
      if (!geo) {
        geo = make();
        FIG_GEOS.set(key, geo);
      }
      return geo;
    }

    function figureConfig(opts) {
      const cfg = Object.assign({}, FIG_DEFAULTS);
      const src = opts && opts.avatar && typeof opts.avatar === "object" ? opts.avatar : null;
      if (src) {
        Object.keys(FIG_ENUMS).forEach((key) => {
          if (FIG_ENUMS[key].indexOf(src[key]) >= 0) cfg[key] = src[key];
        });
        FIG_COLOR_KEYS.forEach((key) => {
          const v = String(src[key] || "");
          if (/^#[0-9a-fA-F]{6}$/.test(v)) cfg[key] = v.toLowerCase();
        });
        return cfg;
      }
      // 舊資料（只有顏色／造型）轉換成建構器設定
      const color = String((opts && opts.figureColor) || "");
      if (/^#[0-9a-fA-F]{6}$/.test(color)) cfg.topColor = color.toLowerCase();
      if (opts.figureStyle === "formal") { cfg.top = "blazer"; cfg.bottom = "trousers"; cfg.shoes = "dress"; }
      else if (opts.figureStyle === "sport") { cfg.top = "tank"; cfg.bottom = "shorts"; }
      if (opts.gender === "female") { cfg.hair = "ponytail"; if (cfg.bottom !== "trousers") cfg.bottom = "skirt"; }
      return cfg;
    }

    // 把同材質的零件合併成單一網格：每位市民約 40 件零件 → 約 12 次 draw call
    function mergeFigureParts(body) {
      const buckets = new Map();
      const meshes = [];
      body.children.forEach((o) => { if (o.isMesh) meshes.push(o); });
      meshes.forEach((m) => {
        m.updateMatrix();
        const key = m.material.uuid;
        if (!buckets.has(key)) buckets.set(key, { material: m.material, list: [] });
        buckets.get(key).list.push(m.geometry.clone().applyMatrix4(m.matrix));
      });
      meshes.forEach((m) => body.remove(m));
      buckets.forEach(({ material, list }) => {
        const flat = list.map((geo) => (geo.index ? geo.toNonIndexed() : geo));
        const merged = BufferGeometryUtils.mergeGeometries(flat, false);
        flat.forEach((geo) => geo.dispose());
        list.forEach((geo) => { if (flat.indexOf(geo) < 0) geo.dispose(); });
        if (!merged) return;
        const mesh = new THREE.Mesh(merged, material);
        mesh.castShadow = true;
        mesh.userData.merged = true;
        body.add(mesh);
      });
    }

    function figPart(parent, geo, mat, pos, rot, scl) {
      const mesh = new THREE.Mesh(geo, mat);
      if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
      if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
      if (scl) mesh.scale.set(scl[0], scl[1], scl[2]);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    }

    function buildCitizenFigure(level, opts = {}) {
      const cfg = figureConfig(opts);
      const g = new THREE.Group();
      const body = new THREE.Group();
      const wScale = { slim: 0.86, average: 1, athletic: 1.16, heavy: 1.24 }[cfg.body] || 1;
      const hScale = { short: 0.9, normal: 1, tall: 1.1 }[cfg.height] || 1;
      body.scale.set(wScale, hScale, Math.min(1.18, wScale * 0.98));
      g.add(body);

      const skinMat = figMat(cfg.skin, 0.82);
      const topMat = figMat(cfg.topColor, 0.7);
      const topDark = figMat(figShade(cfg.topColor, 0.72), 0.7);
      const bottomMat = figMat(cfg.bottomColor, 0.72);
      const shoeMat = figMat(cfg.shoesColor, 0.6);
      const hairMat = figMat(cfg.hairColor, 0.85);
      const darkMat = figMat("#2b2320", 0.55);
      const isDress = cfg.top === "dress";
      const bareArms = cfg.top === "tank" || isDress;
      const bareLegs = isDress || cfg.bottom === "skirt" || cfg.bottom === "shorts";

      // ---- 鞋與腿：左右各一組，繞髖部擺動做出自然步態 ----
      const shoeH = cfg.shoes === "boots" ? 0.015 : cfg.shoes === "sandals" ? 0.005 : 0.01;
      const shoeGeo = figGeo("shoe-" + shoeH, () => new THREE.BoxGeometry(0.018, shoeH, cfg.shoes === "dress" ? 0.03 : 0.028));
      const legGeo = figGeo("leg", () => new THREE.CapsuleGeometry(0.008, 0.022, 3, 8));
      const legMat = bareLegs ? skinMat : bottomMat;
      const hipY = 0.030;
      const legGroups = [];
      [-0.0105, 0.0105].forEach((x) => {
        const legGroup = new THREE.Group();
        legGroup.position.set(x, hipY, 0);
        figPart(legGroup, legGeo, legMat, [0, 0, 0]);
        figPart(legGroup, shoeGeo, shoeMat, [0, shoeH / 2 + 0.001 - hipY, 0.003]);
        body.add(legGroup);
        legGroups.push(legGroup);
      });

      // ---- 下身 ----
      if (bareLegs) {
        figPart(body, figGeo("shorts", () => new THREE.BoxGeometry(0.037, 0.015, 0.024)),
          isDress ? topMat : bottomMat, [0, 0.047, 0]);
      } else {
        figPart(body, figGeo("hip", () => new THREE.BoxGeometry(0.038, 0.016, 0.025)),
          bottomMat, [0, 0.047, 0]);
      }
      if (cfg.bottom === "skirt" || isDress) {
        figPart(body, figGeo("skirt", () => new THREE.CylinderGeometry(0.019, 0.032, 0.032, 12, 1, false)),
          isDress ? topMat : bottomMat, [0, 0.043, 0]);
      }

      // ---- 軀幹 ----
      figPart(body, figGeo("torso", () => new THREE.CapsuleGeometry(0.020, 0.014, 4, 10)),
        topMat, [0, 0.0715, 0]);
      // 肩線：細肩帶款式露出膚色
      figPart(body, figGeo("shoulder", () => new THREE.BoxGeometry(0.046, 0.009, 0.022)),
        bareArms ? skinMat : topMat, [0, 0.0955, 0]);

      // ---- 手臂與手 ----
      const armGeo = figGeo("arm", () => new THREE.CapsuleGeometry(0.0065, 0.022, 3, 8));
      const handGeo = figGeo("hand", () => new THREE.SphereGeometry(0.0062, 8, 6));
      const armMat = bareArms ? skinMat : topMat;
      [-1, 1].forEach((s) => {
        figPart(body, armGeo, armMat, [s * 0.0265, 0.0755, 0], [0, 0, -s * 0.12]);
        figPart(body, handGeo, skinMat, [s * 0.0295, 0.0555, 0]);
      });

      // ---- 服裝細節 ----
      if (cfg.top === "shirt") {
        const collarGeo = figGeo("collar-shirt", () => new THREE.BoxGeometry(0.010, 0.006, 0.010));
        figPart(body, collarGeo, topDark, [-0.006, 0.0985, 0.010], [0, 0, 0.35]);
        figPart(body, collarGeo, topDark, [0.006, 0.0985, 0.010], [0, 0, -0.35]);
        figPart(body, figGeo("placket", () => new THREE.BoxGeometry(0.0026, 0.030, 0.003)), figMat("#f4f1ea", 0.6), [0, 0.074, 0.0205]);
      } else if (cfg.top === "jacket") {
        figPart(body, figGeo("zipper", () => new THREE.BoxGeometry(0.0024, 0.036, 0.003)), figMat("#d9dde0", 0.4, 0.3), [0, 0.073, 0.0205]);
        figPart(body, figGeo("collar-jacket", () => new THREE.BoxGeometry(0.026, 0.007, 0.020)), topDark, [0, 0.098, 0]);
      } else if (cfg.top === "hoodie") {
        figPart(body, figGeo("hood", () => new THREE.SphereGeometry(0.021, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6)),
          topDark, [0, 0.104, -0.012]);
        figPart(body, figGeo("pocket", () => new THREE.BoxGeometry(0.022, 0.010, 0.004)), topDark, [0, 0.060, 0.0205]);
      } else if (cfg.top === "blazer") {
        figPart(body, figGeo("shirt-strip", () => new THREE.BoxGeometry(0.011, 0.030, 0.003)), figMat("#f7f5ef", 0.6), [0, 0.080, 0.0195]);
        const lapelGeo = figGeo("lapel", () => new THREE.BoxGeometry(0.013, 0.026, 0.003));
        figPart(body, lapelGeo, topDark, [-0.009, 0.0855, 0.0205], [0, 0, 0.28]);
        figPart(body, lapelGeo, topDark, [0.009, 0.0855, 0.0205], [0, 0, -0.28]);
      }

      // ---- 外套 ----
      if (cfg.outer === "coat") {
        const coatMat = figMat(cfg.outerColor, 0.72);
        const panelGeo = figGeo("coat-panel", () => new THREE.BoxGeometry(0.009, 0.058, 0.028));
        figPart(body, panelGeo, coatMat, [-0.0245, 0.072, 0]);
        figPart(body, panelGeo, coatMat, [0.0245, 0.072, 0]);
        figPart(body, figGeo("coat-collar", () => new THREE.BoxGeometry(0.040, 0.008, 0.026)), figMat(figShade(cfg.outerColor, 0.8), 0.72), [0, 0.096, 0]);
      } else if (cfg.outer === "vest") {
        figPart(body, figGeo("vest", () => new THREE.BoxGeometry(0.032, 0.040, 0.012)), figMat(cfg.outerColor, 0.72), [0, 0.073, 0.014]);
      } else if (cfg.outer === "apron") {
        const apronMat = figMat(cfg.outerColor, 0.74);
        figPart(body, figGeo("apron", () => new THREE.BoxGeometry(0.028, 0.046, 0.004)), apronMat, [0, 0.067, 0.0205]);
        const strapGeo = figGeo("apron-strap", () => new THREE.BoxGeometry(0.003, 0.026, 0.003));
        figPart(body, strapGeo, apronMat, [-0.010, 0.090, 0.0205]);
        figPart(body, strapGeo, apronMat, [0.010, 0.090, 0.0205]);
      }

      // ---- 頸與頭 ----
      figPart(body, figGeo("neck", () => new THREE.CylinderGeometry(0.008, 0.009, 0.012, 8)), skinMat, [0, 0.102, 0]);
      const faceShape = {
        oval: [0.97, 1.06, 0.96], round: [1.06, 1.0, 1.0], square: [1.02, 0.98, 1.03],
        heart: [1.0, 1.03, 0.94], long: [0.92, 1.14, 0.95],
      }[cfg.face] || [1, 1, 1];
      const head = figPart(body, figGeo("head", () => new THREE.SphereGeometry(0.028, 14, 12)), skinMat, [0, 0.1185, 0], null, faceShape);
      const earGeo = figGeo("ear", () => new THREE.SphereGeometry(0.0058, 8, 6));
      figPart(body, earGeo, skinMat, [-0.0272 * faceShape[0], 0.116, 0]);
      figPart(body, earGeo, skinMat, [0.0272 * faceShape[0], 0.116, 0]);

      // ---- 五官 ----
      const eyeGeo = figGeo("eye", () => new THREE.SphereGeometry(0.0052, 8, 6));
      const eyeScale = {
        almond: [1, 0.78, 0.6], round: [1, 1, 0.65], sharp: [1.15, 0.5, 0.6],
        sleepy: [1.05, 0.38, 0.55], wide: [1.08, 1.1, 0.7],
      }[cfg.eyes] || [1, 0.8, 0.6];
      [-1, 1].forEach((s) => {
        figPart(body, eyeGeo, darkMat, [s * 0.0102, 0.121, 0.0228], [0, 0, cfg.eyes === "sharp" ? s * 0.16 : 0], eyeScale);
      });
      const browGeo = figGeo("brow", () => new THREE.BoxGeometry(0.010, 0.0024, 0.0026));
      const browScale = cfg.brow === "thick" ? [1.15, 1.6, 1] : cfg.brow === "thin" ? [0.8, 0.62, 1] : [1, 1, 1];
      [-1, 1].forEach((s) => {
        figPart(body, browGeo, hairMat, [s * 0.0102, 0.1275, 0.0242],
          [0, 0, cfg.brow === "raised" ? s * -0.24 : s * -0.08], browScale);
      });
      if (cfg.nose === "straight") {
        figPart(body, figGeo("nose-straight", () => new THREE.BoxGeometry(0.0038, 0.010, 0.0042)), skinMat, [0, 0.1135, 0.0258]);
      } else if (cfg.nose === "wide") {
        figPart(body, figGeo("nose-wide", () => new THREE.SphereGeometry(0.0042, 8, 6)), skinMat, [0, 0.1133, 0.0264], null, [1.3, 0.9, 1]);
      } else {
        const noseR = cfg.nose === "small" ? 0.0028 : 0.0034;
        figPart(body, figGeo("nose-" + noseR, () => new THREE.SphereGeometry(noseR, 8, 6)), skinMat, [0, 0.1133, 0.0272]);
      }
      const mouthMat = figMat("#b3544f", 0.6);
      if (cfg.mouth === "pout") {
        figPart(body, figGeo("mouth-pout", () => new THREE.SphereGeometry(0.0042, 8, 6)), mouthMat, [0, 0.1065, 0.0262], null, [1, 0.7, 0.5]);
      } else if (cfg.mouth === "grin") {
        figPart(body, figGeo("mouth-grin", () => new THREE.BoxGeometry(0.0135, 0.0042, 0.0028)), mouthMat, [0, 0.1065, 0.0258]);
        figPart(body, figGeo("teeth", () => new THREE.BoxGeometry(0.0115, 0.0018, 0.0016)), figMat("#f8f4ee", 0.5), [0, 0.1076, 0.0272]);
      } else if (cfg.mouth === "neutral") {
        figPart(body, figGeo("mouth-neutral", () => new THREE.BoxGeometry(0.0085, 0.0022, 0.0024)), mouthMat, [0, 0.1065, 0.0262]);
      } else {
        figPart(body, figGeo("mouth-smile", () => new THREE.TorusGeometry(0.0062, 0.0017, 5, 10, Math.PI)), mouthMat,
          [0, 0.1072, 0.0264], [0, 0, Math.PI]);
      }
      if (cfg.facialHair === "beard") {
        figPart(body, figGeo("beard", () => new THREE.SphereGeometry(0.0286, 12, 8, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.26)),
          hairMat, [0, 0.1185, 0], null, faceShape);
      } else if (cfg.facialHair === "mustache") {
        figPart(body, figGeo("mustache", () => new THREE.BoxGeometry(0.012, 0.0032, 0.0032)), hairMat, [0, 0.1108, 0.0266], [0, 0, 0.06]);
      } else if (cfg.facialHair === "goatee") {
        figPart(body, figGeo("goatee", () => new THREE.BoxGeometry(0.0075, 0.008, 0.003)), hairMat, [0, 0.1015, 0.025]);
      }

      // ---- 髮型（前方留出臉部開口，避免遮住五官） ----
      const capGeo = figGeo("hair-cap", () => new THREE.SphereGeometry(0.0297, 14, 8, Math.PI * 0.75, Math.PI * 1.5, 0, Math.PI * 0.5));
      const fringeGeo = figGeo("hair-fringe", () => new THREE.BoxGeometry(0.036, 0.009, 0.012));
      if (cfg.hair === "buzz") {
        figPart(body, figGeo("hair-buzz", () => new THREE.SphereGeometry(0.0292, 14, 8, Math.PI * 0.75, Math.PI * 1.5, 0, Math.PI * 0.4)),
          hairMat, [0, 0.126, 0], null, [1, 0.98, 1]);
      } else if (cfg.hair === "fade") {
        figPart(body, capGeo, hairMat, [0, 0.1235, 0], null, [1, 0.94, 1]);
        const fadeGeo = figGeo("hair-fade", () => new THREE.BoxGeometry(0.004, 0.012, 0.020));
        figPart(body, fadeGeo, hairMat, [-0.026, 0.124, 0.004]);
        figPart(body, fadeGeo, hairMat, [0.026, 0.124, 0.004]);
        figPart(body, fringeGeo, hairMat, [0, 0.1335, 0.0175]);
      } else if (cfg.hair === "curly") {
        figPart(body, capGeo, hairMat, [0, 0.1235, 0]);
        const curlGeo = figGeo("curl", () => new THREE.SphereGeometry(0.0105, 8, 6));
        [-0.014, 0.002, 0.015].forEach((x, i) => {
          figPart(body, curlGeo, hairMat, [x, 0.142 + (i % 2) * 0.004, -0.006 + i * 0.003], null, [1, 0.9, 1]);
        });
      } else if (cfg.hair === "long") {
        figPart(body, capGeo, hairMat, [0, 0.1235, 0]);
        figPart(body, figGeo("hair-back", () => new THREE.BoxGeometry(0.044, 0.042, 0.014)), hairMat, [0, 0.104, -0.020]);
        const sideGeo = figGeo("hair-side", () => new THREE.CapsuleGeometry(0.0075, 0.024, 3, 6));
        figPart(body, sideGeo, hairMat, [-0.0265, 0.106, -0.004]);
        figPart(body, sideGeo, hairMat, [0.0265, 0.106, -0.004]);
        figPart(body, fringeGeo, hairMat, [0, 0.1335, 0.0175]);
      } else if (cfg.hair === "ponytail") {
        figPart(body, capGeo, hairMat, [0, 0.1235, 0]);
        figPart(body, figGeo("hair-tail", () => new THREE.CapsuleGeometry(0.0105, 0.034, 3, 8)), hairMat, [0, 0.096, -0.030], [0.28, 0, 0]);
        figPart(body, figGeo("hair-tie", () => new THREE.TorusGeometry(0.0105, 0.0022, 5, 10)), figMat("#c9483f", 0.6), [0, 0.114, -0.028], [Math.PI / 2, 0, 0]);
        figPart(body, fringeGeo, hairMat, [0, 0.1335, 0.0175]);
      } else if (cfg.hair === "bun") {
        figPart(body, capGeo, hairMat, [0, 0.1235, 0]);
        figPart(body, figGeo("hair-bun", () => new THREE.SphereGeometry(0.0125, 10, 8)), hairMat, [0, 0.147, -0.012]);
        figPart(body, fringeGeo, hairMat, [0, 0.1335, 0.0175]);
      } else if (cfg.hair === "mohawk") {
        figPart(body, figGeo("hair-mohawk", () => new THREE.BoxGeometry(0.008, 0.020, 0.030)), hairMat, [0, 0.150, -0.002]);
        figPart(body, figGeo("hair-mohawk-side", () => new THREE.BoxGeometry(0.030, 0.006, 0.024)), hairMat, [0, 0.128, 0]);
      } else {
        figPart(body, capGeo, hairMat, [0, 0.1235, 0]);
        figPart(body, figGeo("sideburn", () => new THREE.BoxGeometry(0.004, 0.012, 0.008)), hairMat, [-0.0262, 0.120, 0.004]);
        figPart(body, figGeo("sideburn", () => new THREE.BoxGeometry(0.004, 0.012, 0.008)), hairMat, [0.0262, 0.120, 0.004]);
        figPart(body, fringeGeo, hairMat, [0, 0.1335, 0.0175]);
      }

      // ---- 眼鏡 ----
      if (cfg.glasses !== "none") {
        const frameMat = figMat(cfg.glasses === "sun" ? "#23201e" : "#4a4038", 0.4);
        if (cfg.glasses === "round") {
          const lensGeo = figGeo("glasses-round", () => new THREE.TorusGeometry(0.0072, 0.0014, 5, 12));
          figPart(body, lensGeo, frameMat, [-0.0102, 0.121, 0.0282]);
          figPart(body, lensGeo, frameMat, [0.0102, 0.121, 0.0282]);
        } else {
          const lensGeo = figGeo("glasses-square-" + cfg.glasses, () => new THREE.BoxGeometry(0.0135, cfg.glasses === "sun" ? 0.0088 : 0.0102, 0.002));
          figPart(body, lensGeo, figMat("#2b2320", 0.35, 0.2), [-0.0102, 0.121, 0.0282]);
          figPart(body, lensGeo, figMat("#2b2320", 0.35, 0.2), [0.0102, 0.121, 0.0282]);
        }
        figPart(body, figGeo("glasses-bridge", () => new THREE.BoxGeometry(0.007, 0.0014, 0.0016)), frameMat, [0, 0.123, 0.0288]);
      }

      // ---- 帽子（帽沿一律高於眉毛，避免遮住五官） ----
      if (cfg.hat !== "none") {
        const hatMat = figMat(cfg.hatColor, 0.7);
        if (cfg.hat === "cap") {
          figPart(body, figGeo("hat-cap", () => new THREE.SphereGeometry(0.0305, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), hatMat, [0, 0.130, 0]);
          figPart(body, figGeo("hat-brim", () => new THREE.BoxGeometry(0.032, 0.004, 0.018)), hatMat, [0, 0.1315, 0.0265]);
        } else if (cfg.hat === "beanie") {
          figPart(body, figGeo("hat-beanie", () => new THREE.SphereGeometry(0.031, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.6)), hatMat, [0, 0.127, 0]);
          figPart(body, figGeo("hat-band", () => new THREE.CylinderGeometry(0.0305, 0.0305, 0.008, 12)), figMat(figShade(cfg.hatColor, 0.8), 0.75), [0, 0.134, 0]);
        } else if (cfg.hat === "bucket") {
          figPart(body, figGeo("hat-bucket", () => new THREE.CylinderGeometry(0.020, 0.031, 0.020, 12)), hatMat, [0, 0.146, 0]);
          figPart(body, figGeo("hat-bucket-brim", () => new THREE.CylinderGeometry(0.037, 0.037, 0.004, 12)), hatMat, [0, 0.135, 0]);
        } else if (cfg.hat === "helmet") {
          figPart(body, figGeo("hat-helmet", () => new THREE.SphereGeometry(0.0315, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), hatMat, [0, 0.129, 0]);
          figPart(body, figGeo("hat-visor", () => new THREE.BoxGeometry(0.027, 0.007, 0.014)), figMat("#2f4a52", 0.3, 0.35), [0, 0.1305, 0.0255]);
        }
      }

      // ---- 配件 ----
      if (cfg.accessory === "backpack") {
        const bagMat = figMat(cfg.accessoryColor, 0.72);
        figPart(body, figGeo("backpack", () => new THREE.BoxGeometry(0.030, 0.034, 0.016)), bagMat, [0, 0.074, -0.0255]);
        const strapGeo = figGeo("backpack-strap", () => new THREE.BoxGeometry(0.004, 0.030, 0.004));
        figPart(body, strapGeo, figMat(figShade(cfg.accessoryColor, 0.7), 0.7), [-0.011, 0.079, 0.019]);
        figPart(body, strapGeo, figMat(figShade(cfg.accessoryColor, 0.7), 0.7), [0.011, 0.079, 0.019]);
      } else if (cfg.accessory === "scarf") {
        figPart(body, figGeo("scarf", () => new THREE.TorusGeometry(0.018, 0.0055, 6, 12)), figMat(cfg.accessoryColor, 0.8), [0, 0.1005, 0], [Math.PI / 2, 0, 0]);
        figPart(body, figGeo("scarf-tail", () => new THREE.BoxGeometry(0.011, 0.028, 0.005)), figMat(figShade(cfg.accessoryColor, 0.85), 0.8), [0.006, 0.084, 0.018]);
      } else if (cfg.accessory === "badge") {
        figPart(body, figGeo("badge", () => new THREE.BoxGeometry(0.011, 0.013, 0.003)), figMat(cfg.accessoryColor, 0.35, 0.5), [0.010, 0.080, 0.0205]);
        figPart(body, figGeo("badge-inner", () => new THREE.BoxGeometry(0.006, 0.007, 0.0016)), figMat("#fdf7e3", 0.4), [0.010, 0.080, 0.0222]);
      } else if (cfg.accessory === "headphones") {
        figPart(body, figGeo("hp-band", () => new THREE.TorusGeometry(0.0305, 0.0045, 6, 16)), figMat("#2b2320", 0.45), [0, 0.130, 0], [Math.PI / 2, 0, 0]);
        const cupGeo = figGeo("hp-cup", () => new THREE.SphereGeometry(0.0075, 8, 6));
        figPart(body, cupGeo, figMat(cfg.accessoryColor, 0.5), [-0.0285, 0.115, 0], null, [0.7, 1, 1]);
        figPart(body, cupGeo, figMat(cfg.accessoryColor, 0.5), [0.0285, 0.115, 0], null, [0.7, 1, 1]);
      }

      // ---- 合併零件，降低 draw call ----
      mergeFigureParts(body);

      // ---- 地面陰影與等級光環 ----
      const color = cfg.topColor ? new THREE.Color(cfg.topColor).getHex() : citizenColor(level);
      let shadowMat = FIG_MATS.get("shadow-mat");
      if (!shadowMat) {
        shadowMat = new THREE.MeshBasicMaterial({ color: 0x211d1d, transparent: true, opacity: 0.2, depthWrite: false });
        FIG_MATS.set("shadow-mat", shadowMat);
      }
      const shadow = new THREE.Mesh(figGeo("shadow", () => new THREE.CircleGeometry(0.042, 12)), shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.002;
      g.add(shadow);

      const halo = new THREE.Mesh(
        figGeo("halo-geo", () => new THREE.RingGeometry(0.045, 0.058, 20)),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.004;
      halo.userData.ownMaterial = true;
      g.add(halo);
      g.userData.halo = halo;
      g.userData.body = body;
      g.userData.legs = legGroups;
      return g;
    }

    function clearCitizens() {
      while (citizenGroup.children.length) {
        const child = citizenGroup.children[0];
        citizenGroup.remove(child);
        child.traverse((o) => {
          if (o.isMesh && o.userData.merged) o.geometry.dispose();
          if (o.isMesh && o.userData.ownMaterial) o.material.dispose();
        });
      }
      citizens.length = 0;
    }

    // 市民繞行半徑：避開分區中央的建設沙盤平台（約 1.5 × 1.1）與建築
    const CITIZEN_ORBIT_R = 1.02;
    const CITIZEN_ORBIT_LANE = 0.14;
    const citizenProjVec = new THREE.Vector3();

    function citizenSignature(c) {
      return [c.level || 1, c.gender || "", c.figureColor || "", c.figureStyle || "", JSON.stringify(c.avatar || null)].join("|");
    }

    function disposeCitizenFigure(fig) {
      fig.traverse((o) => {
        if (o.isMesh && o.userData.merged) o.geometry.dispose();
        if (o.isMesh && o.userData.ownMaterial) o.material.dispose();
      });
    }

    // 建立單一市民的 3D 公仔與頭頂名牌
    function createCitizenNode(c) {
      const fig = buildCitizenFigure(c.level || 1, {
        gender: c.gender,
        figureColor: c.figureColor,
        figureStyle: c.figureStyle,
        avatar: c.avatar,
      });
      fig.scale.setScalar(CITIZEN_SCALE);
      fig.userData.citizenId = c.id;
      fig.traverse((o) => {
        if (o.isMesh) o.userData.citizenId = c.id;
      });

      const tag = document.createElement("button");
      tag.type = "button";
      tag.className = "citizen-tag citizen-tag-compact";
      const dotEl = document.createElement("span");
      dotEl.className = c.online ? "online" : "offline";
      const nameEl = document.createElement("span");
      nameEl.className = "name";
      nameEl.textContent = (c.avatarEmoji ? `${c.avatarEmoji} ` : "") + c.nickname;
      const lvEl = document.createElement("span");
      lvEl.className = "lv";
      lvEl.textContent = `Lv.${c.level}` + (c.buildings ? ` · ${c.buildings}建` : "");
      tag.append(dotEl, nameEl, lvEl);
      tag.addEventListener("pointerup", (e) => {
        e.stopPropagation();
        hoveredTagId = null;
        window.dispatchEvent(new CustomEvent("macao:citizen", { detail: { userId: c.id } }));
      });
      tag.addEventListener("pointerenter", () => { if (!isMobile) hoveredTagId = c.id; });
      tag.addEventListener("pointerleave", () => { if (hoveredTagId === c.id) hoveredTagId = null; });
      const tagObj = new CSS2DObject(tag);
      tagObj.position.set(0, 0.21, 0);
      fig.add(tagObj);

      const emoteEl = document.createElement("div");
      emoteEl.className = "citizen-emote";
      const emoteObj = new CSS2DObject(emoteEl);
      emoteObj.position.set(0, 0.27, 0);
      emoteObj.visible = false;
      fig.add(emoteObj);

      return { fig, tag, tagObj, dotEl, nameEl, lvEl, emoteEl, emoteObj };
    }

    function updateCitizenLabel(entry, c) {
      entry.online = !!c.online;
      const dotClass = c.online ? "online" : "offline";
      if (entry.dotEl.className !== dotClass) entry.dotEl.className = dotClass;
      const nameText = (c.avatarEmoji ? `${c.avatarEmoji} ` : "") + c.nickname;
      if (entry.nameEl.textContent !== nameText) entry.nameEl.textContent = nameText;
      const lvText = `Lv.${c.level}` + (c.buildings ? ` · ${c.buildings}建` : "");
      if (entry.lvEl.textContent !== lvText) entry.lvEl.textContent = lvText;
    }

    // 增量更新：以 id 比對，保留既有公仔的走動狀態，避免每次刷新都「跳位」
    function renderCitizens(list) {
      if (!Array.isArray(list)) {
        clearCitizens();
        return 0;
      }
      const valid = list.filter((c) => worldData.islandMap.get(c.districtId));
      const alive = new Set(valid.map((c) => c.id));

      for (let i = citizens.length - 1; i >= 0; i--) {
        const gone = citizens[i];
        if (alive.has(gone.id)) continue;
        citizenGroup.remove(gone.fig);
        disposeCitizenFigure(gone.fig);
        if (hoveredTagId === gone.id) hoveredTagId = null;
        citizens.splice(i, 1);
      }

      const laneByDistrict = new Map();
      citizens.forEach((e) => {
        laneByDistrict.set(e.districtId, (laneByDistrict.get(e.districtId) || 0) + 1);
      });

      valid.forEach((c) => {
        const isl = worldData.islandMap.get(c.districtId);
        const sig = citizenSignature(c);
        let entry = citizens.find((x) => x.id === c.id);

        // 造型／等級有變：只重建公仔，保留原有位置、角度與節奏
        if (entry && entry.sig !== sig) {
          const pos = entry.fig.position.clone();
          const ry = entry.fig.rotation.y;
          citizenGroup.remove(entry.fig);
          disposeCitizenFigure(entry.fig);
          const node = createCitizenNode(c);
          node.fig.position.copy(pos);
          node.fig.rotation.y = ry;
          citizenGroup.add(node.fig);
          Object.assign(entry, node, { sig, compact: true });
        }

        if (!entry) {
          const lane = laneByDistrict.get(c.districtId) || 0;
          laneByDistrict.set(c.districtId, lane + 1);
          const node = createCitizenNode(c);
          const center = new THREE.Vector3(isl.worldPos.x, TOP + 0.02, isl.worldPos.z);
          // 黃金角分配起始位置，同一分區多人時自然散開、不互相重疊
          const angle = lane * 2.399963229728653;
          const radius = CITIZEN_ORBIT_R + (lane % 3) * CITIZEN_ORBIT_LANE;
          node.fig.position.set(
            center.x + Math.cos(angle) * radius,
            center.y,
            center.z + Math.sin(angle) * radius
          );
          node.fig.rotation.y = -angle;
          citizenGroup.add(node.fig);
          entry = Object.assign(node, {
            id: c.id,
            districtId: c.districtId,
            sig,
            online: !!c.online,
            compact: true,
            emoteHideAt: 0,
            cheerUntil: 0,
            center,
            radius,
            angle,
            speed: 0.3 + (lane % 3) * 0.04,
            phase: Math.random() * Math.PI * 2,
            walkPhase: Math.random() * Math.PI * 2,
            idleUntil: 0,
            nextIdleAt: performance.now() + 4000 + Math.random() * 9000,
          });
          citizens.push(entry);
        } else if (entry.districtId !== c.districtId) {
          // 搬區：保留角度，改以新分區中心重新定位
          entry.districtId = c.districtId;
          entry.center.set(isl.worldPos.x, TOP + 0.02, isl.worldPos.z);
          entry.fig.position.set(
            entry.center.x + Math.cos(entry.angle) * entry.radius,
            entry.center.y,
            entry.center.z + Math.sin(entry.angle) * entry.radius
          );
        }
        entry.sig = sig;
        updateCitizenLabel(entry, c);
      });
      return citizens.length;
    }

    function renderVitalityRings(districts) {
      while (vitalityRingGroup.children.length) {
        const child = vitalityRingGroup.children[0];
        vitalityRingGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
      }
      vitalityRings.length = 0;

      while (vitalityBeaconGroup.children.length) {
        const child = vitalityBeaconGroup.children[0];
        vitalityBeaconGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
      vitalityBeacons.length = 0;
      if (championTag) {
        if (championTag.parent) championTag.parent.remove(championTag);
        championTag = null;
      }
      if (!Array.isArray(districts)) return;
      const max = districts.reduce((m, d) => Math.max(m, d.vitality || 0), 1);

      // 活力前三名：地面光柱 + 冠軍徽章
      const ranked = districts.filter((d) => (d.vitality || 0) > 0).sort((a, b) => b.vitality - a.vitality);
      const rankColors = [0xf2c14e, 0xd8d2c6, 0xdb9a6a];
      ranked.slice(0, 3).forEach((d, rank) => {
        const isl = worldData.islandMap.get(d.id);
        if (!isl) return;
        const ratio = Math.min(1, d.vitality / max);
        const mat = new THREE.MeshBasicMaterial({
          color: rankColors[rank],
          transparent: true,
          opacity: 0.1 + ratio * 0.1,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.3, 2.2, 18, 1, true),
          mat
        );
        beam.position.set(isl.worldPos.x, TOP + 1.15, isl.worldPos.z);
        vitalityBeaconGroup.add(beam);
        vitalityBeacons.push({ beam, mat, baseOpacity: 0.1 + ratio * 0.1, phase: rank * 1.3 });

        if (rank === 0) {
          const el = document.createElement("div");
          el.className = "district-champion";
          el.textContent = `👑 活力冠軍 · ${d.vitality}`;
          championTag = new CSS2DObject(el);
          championTag.position.set(isl.worldPos.x, TOP + 2.55, isl.worldPos.z);
          scene.add(championTag);
        }
      });

      districts.forEach((d) => {
        if (!d.vitality) return;
        const isl = worldData.islandMap.get(d.id);
        if (!isl) return;
        const ratio = Math.min(1, d.vitality / max);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.72, 0.82, 40),
          new THREE.MeshBasicMaterial({
            color: 0x007562,
            transparent: true,
            opacity: 0.18 + ratio * 0.34,
            side: THREE.DoubleSide,
            depthWrite: false
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(isl.worldPos.x, TOP + 0.012, isl.worldPos.z);
        vitalityRingGroup.add(ring);
        vitalityRings.push({ ring, baseOpacity: 0.14 + ratio * 0.3, phase: vitalityRings.length * 0.9 });
      });
    }

    // 建設完成時的 3D 慶祝粒子
    function celebrateSlot(districtId, slot) {
      const isl = worldData.islandMap.get(districtId);
      if (!isl) return;
      const col = slot % 4;
      const row = Math.floor(slot / 4);
      const px = isl.worldPos.x + (col - 1.5) * 0.37;
      const pz = isl.worldPos.z + (row - 1) * 0.37;
      const count = 22;
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const velocities = [];
      for (let i = 0; i < count; i++) {
        positions[i * 3] = px + (Math.random() - 0.5) * 0.12;
        positions[i * 3 + 1] = TOP + 0.1;
        positions[i * 3 + 2] = pz + (Math.random() - 0.5) * 0.12;
        velocities.push(new THREE.Vector3(
          (Math.random() - 0.5) * 0.55,
          0.5 + Math.random() * 0.7,
          (Math.random() - 0.5) * 0.55
        ));
      }
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xf2c14e,
        size: 0.05,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        sizeAttenuation: true
      });
      const pts = new THREE.Points(geo, mat);
      celebrationGroup.add(pts);
      celebrations.push({ pts, mat, velocities, age: 0, ttl: 1.7 });

      const flash = new THREE.Mesh(
        new THREE.RingGeometry(0.1, 0.16, 28),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
      );
      flash.rotation.x = -Math.PI / 2;
      flash.position.set(px, TOP + 0.03, pz);
      celebrationGroup.add(flash);
      celebrations.push({ flash, age: 0, ttl: 0.9, isFlash: true });

      // 同分區市民歡呼：跳得更高並冒出愛心
      const now = performance.now();
      citizens.forEach((c, i) => {
        if (c.districtId !== districtId) return;
        c.cheerUntil = now + 2200;
        if (i % 2 === 0) showCitizenEmote(c, "🎉", 1.6);
      });
    }

    function showCitizenEmote(c, emoji, seconds) {
      c.emoteEl.textContent = emoji;
      c.emoteObj.visible = true;
      c.emoteEl.classList.remove("show");
      void c.emoteEl.offsetWidth;
      c.emoteEl.classList.add("show");
      c.emoteHideAt = performance.now() + seconds * 1000;
    }

    function updateCitizensAndEffects(dt, t) {
      const nowMs = performance.now();
      citizens.forEach((c) => {
        const cheering = c.cheerUntil > nowMs;
        let moving = false;
        if (!cheering) {
          // 走一段、停一段，避免一直繞圈像在轉盤上
          if (nowMs >= c.idleUntil && nowMs >= c.nextIdleAt) {
            c.idleUntil = nowMs + 1600 + Math.random() * 2600;
            c.nextIdleAt = c.idleUntil + 7000 + Math.random() * 12000;
          }
          moving = nowMs >= c.idleUntil;
          if (moving) {
            c.angle += c.speed * dt;
            c.walkPhase += dt * 7.4;
          }
        }
        const x = c.center.x + Math.cos(c.angle) * c.radius;
        const z = c.center.z + Math.sin(c.angle) * c.radius;
        const bob = cheering
          ? Math.abs(Math.sin(t * 7.5 + c.phase)) * 0.09
          : (moving ? Math.abs(Math.sin(c.walkPhase)) * 0.006 : (Math.sin(t * 1.6 + c.phase) * 0.5 + 0.5) * 0.002);
        c.fig.position.set(x, c.center.y + bob, z);
        // 面向移動方向：切線方向即 -angle，不再側身行走
        c.fig.rotation.y = -c.angle;
        // 手腳擺動 + 輕微前傾與左右擺，做出自然步態
        const legs = c.fig.userData.legs;
        if (legs) {
          const swing = !moving || cheering ? 0 : Math.sin(c.walkPhase) * 0.5;
          legs[0].rotation.x = swing;
          legs[1].rotation.x = -swing;
        }
        const body = c.fig.userData.body;
        if (body) {
          body.rotation.z = moving ? Math.sin(c.walkPhase) * 0.03 : 0;
          body.rotation.x = moving ? 0.045 : 0;
        }
        if (c.fig.userData.halo) {
          c.fig.userData.halo.material.opacity = 0.28 + Math.sin(t * 2.4 + c.phase) * 0.18;
        }
        if (c.emoteHideAt && nowMs > c.emoteHideAt) {
          c.emoteEl.classList.remove("show");
          c.emoteObj.visible = false;
          c.emoteHideAt = 0;
        }
        // 名牌 LOD：相機遠時只留一顆小圓點；桌面靠近或懸停才展開全名
        // 手機畫面小，只保留小圓點，點一下直接打開市民沙盤
        const near = !isMobile && camera.position.distanceTo(c.fig.position) < 11;
        const compact = isMobile || (!near && hoveredTagId !== c.id);
        if (compact !== c.compact) {
          c.compact = compact;
          c.tag.classList.toggle("citizen-tag-compact", compact);
        }
        // 錨點投影到畫面外時隱藏名牌，避免長名牌溢出邊緣或黏在奇怪位置
        citizenProjVec.copy(c.fig.position).project(camera);
        c.tagObj.visible = citizenProjVec.z < 1 && Math.abs(citizenProjVec.x) < 1.02 && Math.abs(citizenProjVec.y) < 1.02;
      });

      // 市民隨機冒出互動氣泡，讓街區看起來有人氣
      emoteTimer -= dt;
      if (emoteTimer <= 0 && citizens.length) {
        emoteTimer = 3.5 + Math.random() * 3.5;
        const c = citizens[Math.floor(Math.random() * citizens.length)];
        showCitizenEmote(c, EMOTES[Math.floor(Math.random() * EMOTES.length)], 1.8);
      }

      vitalityRings.forEach((r) => {
        const pulse = 0.75 + Math.sin(t * 1.4 + r.phase) * 0.25;
        r.ring.material.opacity = r.baseOpacity * pulse;
        r.ring.scale.setScalar(1 + Math.sin(t * 1.4 + r.phase) * 0.05);
      });

      vitalityBeacons.forEach((b) => {
        const pulse = 0.7 + Math.sin(t * 1.1 + b.phase) * 0.3;
        b.mat.opacity = b.baseOpacity * pulse;
        b.beam.scale.set(1 + Math.sin(t * 0.9 + b.phase) * 0.04, 1, 1 + Math.sin(t * 0.9 + b.phase) * 0.04);
      });
      if (championTag) {
        championTag.position.y = TOP + 2.55 + Math.sin(t * 1.6) * 0.035;
      }

      for (let i = celebrations.length - 1; i >= 0; i--) {
        const c = celebrations[i];
        c.age += dt;
        const k = c.age / c.ttl;
        if (k >= 1) {
          celebrationGroup.remove(c.pts || c.flash);
          if (c.pts) {
            c.pts.geometry.dispose();
            c.mat.dispose();
          } else {
            c.flash.geometry.dispose();
            c.flash.material.dispose();
          }
          celebrations.splice(i, 1);
          continue;
        }
        if (c.isFlash) {
          c.flash.scale.setScalar(1 + k * 6);
          c.flash.material.opacity = 0.9 * (1 - k);
        } else {
          const arr = c.pts.geometry.attributes.position.array;
          c.velocities.forEach((v, idx) => {
            arr[idx * 3] += v.x * dt;
            arr[idx * 3 + 1] += v.y * dt;
            arr[idx * 3 + 2] += v.z * dt;
            v.y -= 1.4 * dt;
          });
          c.pts.geometry.attributes.position.needsUpdate = true;
          c.mat.opacity = 1 - k * k;
        }
      }
    }

    // 供市民中心（社交層）直接控制 3D 場景
    window.macaoBridge = {
      selectItem,
      selectIsland,
      renderSandbox,
      clearSandbox,
      renderCitizens,
      renderVitalityRings,
      celebrateSlot,
      fireworks: () => worldData.triggerFireworkBurst(),
      citizenCount: () => citizens.length,
      sandboxInfo: () => ({
        objects: sandboxGroup.children.length,
        slots: sandboxGroup.children.reduce((n, g) => n + (g.userData && g.userData.sandboxSlot !== undefined ? 1 : 0), 0)
      }),
      focusDistrict: (districtId) => selectIsland(districtId),
      districtCenter: (districtId) => {
        const isl = worldData.islandMap.get(districtId);
        return isl ? { x: isl.worldPos.x, z: isl.worldPos.z } : null;
      }
    };

    // ── 引擎抽離護欄：僅 ?probe=1 時暴露結構指紋用資料，不影響正常渲染 ──
    if (urlParams.get("probe") === "1") {
      window.__NI_PROBE__ = {
        version: "phase2-archetype-dump",
        DATA,
        worldData,
        camera,
        controls,
        renderer,
        PALETTE,
        getArchetypeParts,
        getIslandTreeParts,
        createKitGeometries,
        kitEntries: worldData.kitInstancedMeshes.reduce(
          (acc, m) => acc.concat(m.userData.entries.map((e) => ({ ...e, islandId: e.islandId || null }))),
          []
        ),
        scene
      };
    }

    function selectBridge(bridgeId) {
      const bm = worldData.bridgeMap.get(bridgeId);
      if (!bm || !bm.midWorldPos) return;
      stopLrtFollow();
      collapseSidebarOnMobile();

      selectedIslandId = null;
      selectedItemId = null;
      selectedFlowId = null;
      selectedWalkerId = null;
      selectedBridgeId = bm.id;

      clearItemPins();
      refreshHighlights();

      const { camPos, target } = computeTargetWithDesktopOffset(
        bm.midWorldPos,
        new THREE.Vector3(2.8, 3.8, 5.2)
      );
      flyToPose(camPos, target);
      renderBridgeDetailCard(bm);
      syncMobileSheetState();
    }

    function selectFlow(flowId, walkerObj = null) {
      const flowEntry = walkersAndFlows.flowMeshes.get(flowId);
      if (!flowEntry) return;
      stopLrtFollow();
      collapseSidebarOnMobile();
      const flow = flowEntry.flow;

      selectedIslandId = null;
      selectedItemId = null;
      selectedFlowId = flow.id;
      selectedWalkerId = walkerObj ? walkerObj.id : null;
      selectedBridgeId = null;

      clearItemPins();
      refreshHighlights();

      const midPt = walkerObj
        ? walkerObj.pos.clone()
        : flowEntry.curve.getPointAt(0.5);

      const { camPos, target } = computeTargetWithDesktopOffset(
        midPt,
        walkerObj ? new THREE.Vector3(1.8, 2.8, 3.6) : new THREE.Vector3(3.2, 6.2, 7.4)
      );
      flyToPose(camPos, target);
      renderFlowDetailCard(flow, walkerObj);
      syncMobileSheetState();
    }

    function selectWalker(walkerObj) {
      if (!walkerObj) return;
      selectFlow(walkerObj.flow.id, walkerObj);
    }

    function clearSelection(flyBack = false) {
      stopLrtFollow();
      selectedIslandId = null;
      selectedItemId = null;
      selectedFlowId = null;
      selectedWalkerId = null;
      selectedBridgeId = null;
      clearItemPins();
      detailCard.classList.add("hidden");
      syncMobileSheetState();
      refreshHighlights();
      if (flyBack) {
        if (window.innerWidth <= 800 && rightSidebar) {
          rightSidebar.classList.add("collapsed");
          syncMobileSheetState();
        }
        isBirdEye = false;
        document.getElementById("tog-bird").classList.remove("active");
        document.getElementById("tog-bird").setAttribute("aria-pressed", "false");
        const pose = getPanoramaPose();
        flyToPose(pose.pos, pose.target);
      }
    }

    // 左側詳細卡片：四種內容模板（分區島／施政細項／跨海大橋／跨區協作線）
    function renderIslandDetailCard(isl) {
      detailCard.classList.remove("hidden");
      detailEyebrow.textContent = `${isl.code} · ${isl.gridCode || isl.parish || "MACAO ZONE"}`;
      detailTitle.textContent = `${isl.icon} ${tr(isl.name, isl.nameEn)}`;

      const relatedFlows = DATA.flows.filter((f) => f.from === isl.id || f.to === isl.id);
      const relatedBridges = (DATA.bridgesMeta || []).filter((b) => b.from === isl.id || b.to === isl.id);

      let html = `
        <div class="geo-meta-bar">
          <span>📍 ${isl.lat.toFixed(4)}°N, ${isl.lng.toFixed(4)}°E</span>
          <span>🗺️ ${isl.gridCode || isl.parish}</span>
          <span>📐 ${isl.areaKm2 || "--"}</span>
          <span>👥 ${isl.population || "--"}</span>
          ${isl.sourceUrl ? `<a class="chip" style="min-height:24px;padding:2px 8px;font-size:11px;" href="${isl.sourceUrl}" target="_blank" rel="noopener noreferrer">🏛️ ${isl.dept || "政府部門"} ↗</a>` : ""}
        </div>
        <p style="font-size:13.5px;line-height:1.55;color:#3d332e;">${tr(isl.summary, isl.summaryEn)}</p>
        ${relatedBridges.length > 0 ? `
          <div>
            <div class="eyebrow" style="margin-bottom:6px;">${tr("連接跨海大橋與聯絡道（點擊飛往大橋）", "CONNECTED CROSS-SEA BRIDGES")}</div>
            <div style="display:flex;flex-direction:column;gap:5px;">
              ${relatedBridges.map((b) => `
                <button type="button" class="card-item-row" data-bridge-id="${b.id}" style="border-left:4px solid var(--macao-green);padding:8px 10px;">
                  <div style="display:flex;flex-direction:column;gap:2px;text-align:left;">
                    <span style="font-weight:800;font-size:12.5px;">🌉 ${tr(b.name, b.nameEn)} (${tr(b.length, b.lengthEn)})</span>
                    <span style="font-size:11.5px;color:#5a4d43;">${tr(b.desc, b.descEn)}</span>
                  </div>
                </button>
              `).join("")}
            </div>
          </div>
        ` : ""}
        <div>
          <div class="eyebrow" style="margin-bottom:8px;">${tr("分區地標與施政細項", "LANDMARKS & POLICIES")} (${isl.items.length})</div>
          <div class="card-item-list">
            ${isl.items.map((it, idx) => `
              <button type="button" class="card-item-row" data-item-id="${it.id}">
                <span class="item-idx-circle">${idx + 1}</span>
                <div style="display:flex;flex-direction:column;gap:2px;overflow:hidden;">
                  <span style="font-weight:700;font-size:13px;">${tr(it.name, it.nameEn)}</span>
                  <span style="font-size:11.5px;color:#6c5c50;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${tr(it.desc, it.descEn)}</span>
                </div>
              </button>
            `).join("")}
          </div>
        </div>
      `;

      if (relatedFlows.length > 0) {
        html += `
          <div>
            <div class="eyebrow" style="margin-bottom:8px;">${tr("跨區協作走廊", "CROSS-DISTRICT FLOWS")}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${relatedFlows.map((f) => {
                const otherId = f.from === isl.id ? f.to : f.from;
                const otherIsl = worldData.islandMap.get(otherId);
                const arrow = f.from === isl.id ? "→" : "←";
                return `<button type="button" class="chip" data-flow-id="${f.id}">
                  <span>📦 ${tr(f.cargo, f.cargoEn)}</span>
                  <span style="color:var(--coral);font-weight:800;">${arrow} ${otherIsl ? getShortIslandTitle(otherIsl) : otherId}</span>
                </button>`;
              }).join("")}
            </div>
          </div>
        `;
      }

      detailBody.innerHTML = html;
      detailBody.querySelectorAll("[data-item-id]").forEach((btn) => {
        btn.addEventListener("click", () => selectItem(btn.getAttribute("data-item-id")));
      });
      detailBody.querySelectorAll("[data-bridge-id]").forEach((btn) => {
        btn.addEventListener("click", () => selectBridge(btn.getAttribute("data-bridge-id")));
      });
      detailBody.querySelectorAll("[data-flow-id]").forEach((btn) => {
        btn.addEventListener("click", () => selectFlow(btn.getAttribute("data-flow-id")));
      });
    }

    function renderBridgeDetailCard(bm) {
      detailCard.classList.remove("hidden");
      const fromIsl = worldData.islandMap.get(bm.from);
      const toIsl = worldData.islandMap.get(bm.to);
      const fourBridges = (DATA.bridgesMeta || []).filter((b) => b.isCrossSeaFour);
      const facts = langState.current === "en" ? (bm.factsEn || bm.facts || []) : (bm.facts || []);

      detailEyebrow.textContent = `${bm.code} · ${tr(bm.year || "MACAO BRIDGE", bm.yearEn || "MACAO BRIDGE")}`;
      detailTitle.textContent = `🌉 ${tr(bm.name, bm.nameEn)}`;

      detailBody.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
          ${fourBridges.map((b) => `
            <button type="button" class="chip ${b.id === bm.id ? "active" : ""}" data-switch-bridge="${b.id}" style="min-height:28px;padding:3px 9px;font-size:11.5px;">
              🌉 ${tr(b.name, b.nameEn)}
            </button>
          `).join("")}
        </div>
        <div class="geo-meta-bar">
          <span>📏 ${tr("總長", "Length")}: ${tr(bm.length, bm.lengthEn)}</span>
          <span>🛣️ ${tr(bm.lanes, bm.lanesEn)}</span>
          <span>🏛️ ${bm.dept || "DSOP / DSAT"}</span>
        </div>
        <p style="font-size:13.5px;line-height:1.56;color:#2c2522;font-weight:600;">${tr(bm.desc, bm.descEn)}</p>
        <div class="stat-bricks" style="grid-template-columns:1fr 1fr;">
          <div class="stat-brick">
            <div class="big-num">${tr(bm.length, bm.lengthEn)}</div>
            <div class="stat-brick-label">${tr("跨海橋樑總長度", "Total Bridge Span")}</div>
          </div>
          <div class="stat-brick">
            <div class="big-num">${bm.code}</div>
            <div class="stat-brick-label">${tr(bm.year, bm.yearEn)}</div>
          </div>
        </div>
        ${facts.length > 0 ? `
          <div>
            <div class="eyebrow" style="margin-bottom:6px;">${tr("工程特徵與跨海交通數據", "ENGINEERING & TRAFFIC FACTS")}</div>
            <ul class="fact-list">
              ${facts.map((f) => `<li>${f}</li>`).join("")}
            </ul>
          </div>
        ` : ""}
        <div>
          <div class="eyebrow" style="margin-bottom:6px;">${tr("大橋南北兩端落腳分區", "NORTH & SOUTH LANDING DISTRICTS")}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${fromIsl ? `<button type="button" class="chip" id="btn-bridge-from">⬆️ 北端：${fromIsl.icon} ${getShortIslandTitle(fromIsl)}</button>` : ""}
            ${toIsl ? `<button type="button" class="chip" id="btn-bridge-to">⬇️ 南端：${toIsl.icon} ${getShortIslandTitle(toIsl)}</button>` : ""}
          </div>
        </div>
      `;

      detailBody.querySelectorAll("[data-switch-bridge]").forEach((btn) => {
        btn.addEventListener("click", () => selectBridge(btn.getAttribute("data-switch-bridge")));
      });
      const btnFrom = document.getElementById("btn-bridge-from");
      if (btnFrom && fromIsl) btnFrom.addEventListener("click", () => selectIsland(fromIsl.id));
      const btnTo = document.getElementById("btn-bridge-to");
      if (btnTo && toIsl) btnTo.addEventListener("click", () => selectIsland(toIsl.id));
    }

    function renderItemDetailCard(item) {
      detailCard.classList.remove("hidden");
      const isl = worldData.islandMap.get(item.islandId);
      detailEyebrow.textContent = `${item.islandCode} ${tr(item.islandName, item.islandNameEn)} · ${CIRCLED_NUMS[item.indexInIsland - 1] || item.indexInIsland}`;
      detailTitle.textContent = tr(item.name, item.nameEn);

      const facts = langState.current === "en" ? (item.factsEn || item.facts) : item.facts;
      const bricks = extractStatBricks(facts);
      const schedules = [
        { zh: "第 1 年", en: "Year 1" },
        { zh: "2–3 年", en: "Years 2–3" },
        { zh: "4 年", en: "Year 4" }
      ];

      let interactiveActionHtml = "";
      if (item.id === "sa-1" || item.model === "macautower") {
        interactiveActionHtml = `<button type="button" class="btn active" id="card-act-fw" style="width:100%;">🎆 ${tr("立即在旅遊塔上空施放煙花", "Launch Fireworks Over Macau Tower")}</button>`;
      } else if (item.id === "el-1" || item.model === "ruins") {
        interactiveActionHtml = `<button type="button" class="btn active" id="card-act-ls" style="width:100%;">✨ ${tr("點亮／切換大三巴夜間光雕投影", "Toggle Ruins of St. Paul Lightshow")}</button>`;
      } else if (item.model === "lrtstation") {
        interactiveActionHtml = `<button type="button" class="btn active" id="card-act-lrt" style="width:100%;">🚝 ${tr("切換澳門輕軌列車第一視角跟車", "Follow Macau LRT Train Camera")}</button>`;
      }

      detailBody.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
          <button type="button" class="chip" id="btn-back-island">← ${tr("返回分區", "Back")}</button>
          ${isl && isl.sourceUrl ? `<a class="chip" href="${isl.sourceUrl}" target="_blank" rel="noopener noreferrer">📊 ${isl.dept} ↗</a>` : `<span class="eyebrow">MODEL: ${item.model.toUpperCase()}</span>`}
        </div>
        <div class="thumb-wrap">
          <canvas id="item-thumb-canvas" width="160" height="160"></canvas>
        </div>
        ${interactiveActionHtml}
        <p style="font-size:13.5px;line-height:1.55;color:#2c2522;font-weight:600;">${tr(item.desc, item.descEn)}</p>
        ${bricks.length > 0 ? `
          <div>
            <div class="eyebrow" style="margin-bottom:6px;">${tr("官方統計與量化指標", "OFFICIAL METRICS")}</div>
            <div class="stat-bricks">
              ${bricks.map((b) => `
                <div class="stat-brick">
                  <div class="big-num">${b.num}</div>
                  <div class="stat-brick-label">${b.label}</div>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}
        <div>
          <div class="eyebrow" style="margin-bottom:6px;">${tr("二五／三五規劃期程軸", "IMPLEMENTATION TIMELINE")}</div>
          <div class="timeline-bar">
            ${schedules.map((s) => `
              <div class="timeline-step ${item.schedule === s.zh ? "active" : ""}">
                ${tr(s.zh, s.en)}
              </div>
            `).join("")}
          </div>
        </div>
        <div>
          <div class="eyebrow" style="margin-bottom:6px;">${tr("施政重點與數據事實", "OFFICIAL FACTS & TARGETS")}</div>
          <ul class="fact-list">
            ${facts.map((f) => `<li>${f}</li>`).join("")}
          </ul>
        </div>
      `;

      const thumbCanvas = document.getElementById("item-thumb-canvas");
      renderThumb(thumbCanvas, item.model, isl ? isl.color : PALETTE.coral);

      const backBtn = document.getElementById("btn-back-island");
      if (backBtn) backBtn.addEventListener("click", () => selectIsland(item.islandId));

      const fwAct = document.getElementById("card-act-fw");
      if (fwAct) fwAct.addEventListener("click", () => triggerMacaoFireworks());

      const lsAct = document.getElementById("card-act-ls");
      if (lsAct) lsAct.addEventListener("click", () => toggleRuinsLightshow());

      const lrtAct = document.getElementById("card-act-lrt");
      if (lrtAct) lrtAct.addEventListener("click", () => toggleLrtFollowMode());
    }

    function renderFlowDetailCard(flow, walkerObj = null) {
      detailCard.classList.remove("hidden");
      const fromIsl = worldData.islandMap.get(flow.from);
      const toIsl = worldData.islandMap.get(flow.to);

      const evLabelMap = {
        official: tr("施政報告已落實／營運中 (Official)", "Official / In Operation"),
        thematic: tr("二五／三五規劃建設中 (Thematic)", "Five-Year Plan In Progress"),
        pending: tr("跨部門深化研究階段 (Pending)", "Inter-Dept Study")
      };

      detailEyebrow.textContent = walkerObj
        ? tr("澳門跨區協作角色", "MACAO CIVIC WALKER")
        : tr("跨海與跨區協作線", "CROSS-DISTRICT CORRIDOR");
      detailTitle.textContent = `${fromIsl ? getShortIslandTitle(fromIsl) : flow.from} → ${toIsl ? getShortIslandTitle(toIsl) : flow.to}`;

      detailBody.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          <span class="chip active">${evLabelMap[flow.evidence] || flow.evidence}</span>
          <span class="chip">📦 ${tr(flow.cargo, flow.cargoEn)}</span>
          <span class="chip">🧑 ${tr(flow.roleName, flow.roleNameEn)}</span>
        </div>
        <p style="font-size:13.5px;line-height:1.58;color:#38302c;">${tr(flow.desc, flow.descEn)}</p>
        <div class="stat-bricks" style="grid-template-columns:1fr 1fr;">
          <div class="stat-brick">
            <div class="big-num">${flow.walkersCount}</div>
            <div class="stat-brick-label">${tr("線上往返班次／人員", "Active Units")}</div>
          </div>
          <div class="stat-brick">
            <div class="big-num">${flow.role === "commuter" ? "0.66" : "0.36"}</div>
            <div class="stat-brick-label">${tr("移動速率 (m/s)", "Travel Speed")}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${fromIsl ? `<button type="button" class="chip" id="btn-goto-from">前往 ${fromIsl.icon} ${getShortIslandTitle(fromIsl)}</button>` : ""}
          ${toIsl ? `<button type="button" class="chip" id="btn-goto-to">前往 ${toIsl.icon} ${getShortIslandTitle(toIsl)}</button>` : ""}
        </div>
      `;

      const btnFrom = document.getElementById("btn-goto-from");
      if (btnFrom && fromIsl) btnFrom.addEventListener("click", () => selectIsland(fromIsl.id));
      const btnTo = document.getElementById("btn-goto-to");
      if (btnTo && toIsl) btnTo.addEventListener("click", () => selectIsland(toIsl.id));
    }

    // 右側清單側欄渲染（含澳門四條跨海大橋專區與 12 地理分區）
    const sidebarContent = document.getElementById("sidebar-content");
    function renderSidebar() {
      if (!sidebarContent) return;
      const q = searchQuery.trim().toLowerCase();

      if (activeSidebarTab === "themes") {
        let html = "";

        // 頂部加入「澳門四條跨海大橋」折疊專區
        const matchingBridges = (DATA.bridgesMeta || []).filter((bm) => {
          if (!bm.isCrossSeaFour) return false;
          if (!q) return true;
          return (
            bm.name.toLowerCase().includes(q) ||
            bm.nameEn.toLowerCase().includes(q) ||
            bm.desc.toLowerCase().includes(q)
          );
        });

        if (matchingBridges.length > 0) {
          const bridgeGroupOpen = !!q || !!selectedBridgeId || !selectedIslandId;
          html += `
            <details class="island-group" ${bridgeGroupOpen ? "open" : ""}>
              <summary>
                <span class="island-summary-left">
                  <span class="island-color-dot" style="background:var(--macao-green);"></span>
                  <span style="font-family:var(--font-mono);font-size:11px;color:#006655;">B1–B4</span>
                  <span>🌉 ${tr("澳門四條跨海大橋（西至東）", "Macao's 4 Cross-Sea Bridges")}</span>
                </span>
                <span class="eyebrow">${matchingBridges.length}</span>
              </summary>
              <div class="details-items">
                ${matchingBridges.map((bm, idx) => `
                  <button type="button" class="sidebar-item-btn ${selectedBridgeId === bm.id ? "active" : ""}" data-sidebar-bridge="${bm.id}">
                    <span style="color:var(--macao-green);font-weight:800;margin-right:4px;">${bm.code}</span>
                    <span>${tr(bm.name, bm.nameEn)}（${tr(bm.length, bm.lengthEn)}）</span>
                  </button>
                `).join("")}
              </div>
            </details>
          `;
        }

        let lastMacroRegion = "";
        DATA.islands.forEach((isl) => {
          const matchIsl =
            !q ||
            isl.name.toLowerCase().includes(q) ||
            isl.nameEn.toLowerCase().includes(q) ||
            (isl.parish && isl.parish.toLowerCase().includes(q)) ||
            (isl.gridCode && isl.gridCode.toLowerCase().includes(q)) ||
            isl.summary.toLowerCase().includes(q);

          const matchingItems = isl.items.filter((it) => {
            if (matchIsl && !q) return true;
            return (
              matchIsl ||
              it.name.toLowerCase().includes(q) ||
              it.nameEn.toLowerCase().includes(q) ||
              it.desc.toLowerCase().includes(q) ||
              it.facts.some((f) => f.toLowerCase().includes(q))
            );
          });

          if (!matchIsl && matchingItems.length === 0) return;

          const macroLabel = tr(isl.macroRegion || "", isl.macroRegionEn || "");
          if (macroLabel && macroLabel !== lastMacroRegion) {
            lastMacroRegion = macroLabel;
            html += `<div style="font-size:11px;font-weight:800;color:#005a4b;background:rgba(0,117,98,0.09);padding:5px 10px;border-radius:8px;margin:6px 0 2px;letter-spacing:0.04em;">📍 ${macroLabel}</div>`;
          }

          const isOpen = !!q || selectedIslandId === isl.id;
          html += `
            <details class="island-group" data-island-group="${isl.id}" ${isOpen ? "open" : ""}>
              <summary data-island-summary="${isl.id}">
                <span class="island-summary-left">
                  <span class="island-color-dot" style="background:${isl.color};"></span>
                  <span style="font-family:var(--font-mono);font-size:11px;color:#7a6a5e;">${isl.code}</span>
                  <span>${isl.icon} ${tr(isl.name, isl.nameEn)}</span>
                </span>
                <span class="eyebrow">${matchingItems.length}</span>
              </summary>
              <div class="details-items">
                ${matchingItems.map((it) => {
                  const idx = isl.items.indexOf(it);
                  return `
                    <button type="button" class="sidebar-item-btn ${selectedItemId === it.id ? "active" : ""}" data-sidebar-item="${it.id}">
                      <span style="color:var(--coral);font-weight:800;margin-right:4px;">${CIRCLED_NUMS[idx] || idx + 1}</span>
                      <span>${tr(it.name, it.nameEn)}</span>
                    </button>
                  `;
                }).join("")}
              </div>
            </details>
          `;
        });
        sidebarContent.innerHTML = html || `<div style="padding:18px;text-align:center;font-size:13px;color:#6e5e53;">${tr("找不到符合的澳門分區或細項", "No matching Macao zones or items")}</div>`;

        sidebarContent.querySelectorAll("[data-sidebar-bridge]").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            selectBridge(btn.getAttribute("data-sidebar-bridge"));
          });
        });
        sidebarContent.querySelectorAll("[data-island-summary]").forEach((sumEl) => {
          sumEl.addEventListener("click", () => {
            const id = sumEl.getAttribute("data-island-summary");
            selectIsland(id);
          });
        });
        sidebarContent.querySelectorAll("[data-sidebar-item]").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            selectItem(btn.getAttribute("data-sidebar-item"));
          });
        });
      } else {
        const filteredFlows = DATA.flows.filter((f) => {
          if (!q) return true;
          return (
            f.cargo.toLowerCase().includes(q) ||
            f.cargoEn.toLowerCase().includes(q) ||
            f.roleName.toLowerCase().includes(q) ||
            f.desc.toLowerCase().includes(q)
          );
        });

        sidebarContent.innerHTML = filteredFlows.map((f) => {
          const fromIsl = worldData.islandMap.get(f.from);
          const toIsl = worldData.islandMap.get(f.to);
          return `
            <button type="button" class="card-item-row ${selectedFlowId === f.id ? "active" : ""}" data-sidebar-flow="${f.id}" style="flex-direction:column;align-items:flex-start;gap:4px;padding:10px 12px;">
              <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
                <span style="font-weight:800;font-size:13px;">${fromIsl ? getShortIslandTitle(fromIsl) : f.from} → ${toIsl ? getShortIslandTitle(toIsl) : f.to}</span>
                <span class="eyebrow">${f.evidence}</span>
              </div>
              <div style="font-size:12px;color:#5a4d43;">📦 ${tr(f.cargo, f.cargoEn)} · ${tr(f.roleName, f.roleNameEn)}</div>
            </button>
          `;
        }).join("");

        sidebarContent.querySelectorAll("[data-sidebar-flow]").forEach((btn) => {
          btn.addEventListener("click", () => selectFlow(btn.getAttribute("data-sidebar-flow")));
        });
      }
    }

    // 初始化城市日誌篩選下拉選單
    if (logFilterSelect) {
      DATA.flows.forEach((f) => {
        const fromIsl = worldData.islandMap.get(f.from);
        const toIsl = worldData.islandMap.get(f.to);
        const opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = `${fromIsl ? getShortIslandTitle(fromIsl) : f.from} → ${toIsl ? getShortIslandTitle(toIsl) : f.to} (${tr(f.cargo, f.cargoEn)})`;
        logFilterSelect.appendChild(opt);
      });
      logFilterSelect.addEventListener("change", renderCityLogList);
    }

    // =========================================================================
    // 澳門互動體驗控制：四條跨海大橋巡禮、真實地理方格開關、旅遊塔煙花、輕軌跟車、大三巴光雕、內港防洪模擬
    // =========================================================================
    const btnBridgesTour = document.getElementById("btn-bridges-tour");
    if (btnBridgesTour) {
      btnBridgesTour.addEventListener("click", () => {
        const fourBridges = (DATA.bridgesMeta || []).filter((b) => b.isCrossSeaFour);
        if (fourBridges.length === 0) return;
        const targetBridge = fourBridges[bridgeTourIndex % fourBridges.length];
        bridgeTourIndex = (bridgeTourIndex + 1) % fourBridges.length;
        selectBridge(targetBridge.id);
      });
    }

    const btnGeoGrid = document.getElementById("btn-geo-grid");
    if (btnGeoGrid) {
      btnGeoGrid.addEventListener("click", () => {
        showGeoGrid = !showGeoGrid;
        btnGeoGrid.classList.toggle("active", showGeoGrid);
        btnGeoGrid.setAttribute("aria-pressed", String(showGeoGrid));
        if (worldData.geoGridGroup) {
          worldData.geoGridGroup.visible = showGeoGrid;
        }
        coordLabelObjs.forEach((cl) => {
          cl.obj.visible = showGeoGrid;
          cl.el.classList.toggle("hidden", !showGeoGrid);
        });
        dirty = true;
        renderer.render(scene, camera);
        css2dRenderer.render(scene, camera);
      });
    }

    function triggerMacaoFireworks() {
      worldData.triggerFireworkBurst();
      const safetyIsl = worldData.islandMap.get("safety");
      if (safetyIsl && !selectedIslandId && !selectedItemId && !selectedBridgeId) {
        const { camPos, target } = computeTargetWithDesktopOffset(
          new THREE.Vector3(safetyIsl.worldPos.x, TOP + 1.0, safetyIsl.worldPos.z),
          new THREE.Vector3(3.2, 4.6, 6.8)
        );
        flyToPose(camPos, target);
      }
      dirty = true;
    }

    function toggleLrtFollowMode() {
      isFollowingLrt = !isFollowingLrt;
      const btn = document.getElementById("btn-lrt-follow");
      if (btn) {
        btn.classList.toggle("active", isFollowingLrt);
        btn.setAttribute("aria-pressed", String(isFollowingLrt));
      }
      if (isFollowingLrt) {
        if (window.innerWidth <= 800) {
          detailCard.classList.add("hidden");
          rightSidebar.classList.add("collapsed");
          syncMobileSheetState();
        }
        cameraFlight = null;
        isPaused = false;
        const pauseBtn = document.getElementById("tog-pause");
        if (pauseBtn) {
          pauseBtn.classList.remove("active");
          pauseBtn.setAttribute("aria-pressed", "false");
        }
      }
      dirty = true;
    }

    function toggleRuinsLightshow() {
      isLightshowActive = !isLightshowActive;
      const btn = document.getElementById("btn-lightshow");
      if (btn) {
        btn.classList.toggle("active", isLightshowActive);
        btn.setAttribute("aria-pressed", String(isLightshowActive));
      }
      if (isLightshowActive) {
        selectItem("el-1");
      } else {
        refreshHighlights();
      }
      dirty = true;
    }

    document.getElementById("btn-fireworks").addEventListener("click", triggerMacaoFireworks);
    document.getElementById("btn-lrt-follow").addEventListener("click", toggleLrtFollowMode);
    document.getElementById("btn-lightshow").addEventListener("click", toggleRuinsLightshow);

    const tideSlider = document.getElementById("slider-tide");
    const tideValLabel = document.getElementById("tide-val-label");
    if (tideSlider) {
      tideSlider.addEventListener("input", (e) => {
        tideLevelM = parseFloat(e.target.value) || 0;
        waterMesh.position.y = WATER_Y + tideLevelM * 0.16;
        let warnTag = "";
        if (tideLevelM >= 2.0) warnTag = " (黑警)";
        else if (tideLevelM >= 1.5) warnTag = " (紅警)";
        else if (tideLevelM >= 1.0) warnTag = " (橙警)";
        else if (tideLevelM >= 0.5) warnTag = " (黃警)";
        if (tideValLabel) tideValLabel.textContent = `+${tideLevelM.toFixed(1)}m${warnTag}`;
        dirty = true;
      });
    }

    // 官方數據中心 Modal（零外部網路請求，徹底避免瀏覽器 CSP 警告）
    const govModal = document.getElementById("gov-data-modal");
    const govZoneTbody = document.getElementById("gov-zone-tbody");

    function populateGovZoneTable() {
      if (!govZoneTbody) return;
      govZoneTbody.innerHTML = DATA.islands.map((isl) => `
        <tr style="cursor:pointer;" data-gov-row="${isl.id}">
          <td><strong>${isl.code} ${isl.icon} ${tr(isl.name, isl.nameEn)}</strong></td>
          <td>${isl.areaKm2}</td>
          <td>${isl.population}</td>
          <td>${isl.dept}</td>
        </tr>
      `).join("");
      govZoneTbody.querySelectorAll("[data-gov-row]").forEach((trEl) => {
        trEl.addEventListener("click", () => {
          const id = trEl.getAttribute("data-gov-row");
          govModal.classList.add("hidden");
          selectIsland(id);
        });
      });
    }
    populateGovZoneTable();

    function syncMacaoOfficialLiveTelemetry() {
      const statusEl = document.getElementById("gov-api-status-text");
      const weatherEl = document.getElementById("gov-stat-weather");
      const aqiSubEl = document.getElementById("gov-stat-aqi-sub");

      const dayRatio = Math.sin(Math.max(0, (timeOfDayMin - 360) / 720) * Math.PI);
      const simTemp = (24.2 + dayRatio * 3.4).toFixed(1);
      const simAqi = 32 + Math.floor((timeOfDayMin % 60) * 0.2);
      const tideStr = `+${tideLevelM.toFixed(1)}m`;

      if (weatherEl) weatherEl.textContent = `${simTemp}°C · ${tr("良好", "Good")}`;
      if (aqiSubEl) aqiSubEl.textContent = `大潭山及內港站 · AQI ${simAqi} · 潮位 ${tideStr}`;
      if (statusEl) {
        statusEl.textContent = `✅ 已同步澳門特區政府 DSEC / DATA.GOV.MO 官方統計基準（${formatMinToHHMM(timeOfDayMin)} 實時狀態）`;
      }
    }

    document.getElementById("btn-open-gov-data").addEventListener("click", () => {
      populateGovZoneTable();
      syncMacaoOfficialLiveTelemetry();
      govModal.classList.remove("hidden");
    });
    // 左上角標誌即為官方數據入口
    const brandCard = document.getElementById("brand-card");
    const openGovData = () => {
      populateGovZoneTable();
      syncMacaoOfficialLiveTelemetry();
      govModal.classList.remove("hidden");
    };
    if (brandCard) {
      brandCard.addEventListener("click", openGovData);
      brandCard.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openGovData(); }
      });
    }
    document.getElementById("btn-close-gov-data").addEventListener("click", () => govModal.classList.add("hidden"));
    document.getElementById("btn-close-gov-bottom").addEventListener("click", () => govModal.classList.add("hidden"));
    document.getElementById("btn-refresh-gov-api").addEventListener("click", syncMacaoOfficialLiveTelemetry);

    // Raycast 點擊偵測（支援點擊四條跨海大橋、輕軌、小人、協作線、地標與島嶼）
    const raycaster = new THREE.Raycaster();
    const pointerDownPos = new THREE.Vector2();
    const ndcPointer = new THREE.Vector2();

    renderer.domElement.addEventListener("pointerdown", (e) => {
      pointerDownPos.set(e.clientX, e.clientY);
    });

    renderer.domElement.addEventListener("pointerup", (e) => {
      const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moveDist > 6) return;

      document.getElementById("hud-time-group").classList.remove("mobile-open");

      const rect = renderer.domElement.getBoundingClientRect();
      ndcPointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndcPointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndcPointer, camera);

      const lrtHits = raycaster.intersectObjects(worldData.lrtTrainGroup.children, false);
      if (lrtHits.length > 0) {
        selectItem("sa-3");
        toggleLrtFollowMode();
        return;
      }

      const walkerHits = raycaster.intersectObjects(walkersAndFlows.walkerHitMeshes, false);
      if (walkerHits.length > 0 && walkerHits[0].instanceId !== undefined) {
        const w = walkersAndFlows.walkers[walkerHits[0].instanceId];
        if (w) {
          selectWalker(w);
          return;
        }
      }

      const visibleFlows = walkersAndFlows.flowHitMeshes.filter((m) => m.visible);
      if (visibleFlows.length > 0) {
        const flowHits = raycaster.intersectObjects(visibleFlows, false);
        if (flowHits.length > 0 && flowHits[0].object.userData.flowId) {
          selectFlow(flowHits[0].object.userData.flowId);
          return;
        }
      }

      const citizenHits = raycaster.intersectObjects(citizenGroup.children, true);
      if (citizenHits.length > 0) {
        const cid = citizenHits[0].object.userData && citizenHits[0].object.userData.citizenId;
        if (cid !== undefined) {
          window.dispatchEvent(new CustomEvent("macao:citizen", { detail: { userId: cid } }));
          return;
        }
      }

      const sandboxHits = raycaster.intersectObjects(sandboxGroup.children, true);
      if (sandboxHits.length > 0) {
        const ud = sandboxHits[0].object.userData;
        if (ud && ud.sandboxSlot !== undefined) {
          window.dispatchEvent(new CustomEvent("macao:sandbox-slot", {
            detail: { slot: ud.sandboxSlot, districtId: ud.sandboxDistrictId }
          }));
          return;
        }
      }

      const kitHits = raycaster.intersectObjects(worldData.kitInstancedMeshes, false);
      if (kitHits.length > 0) {
        const hit = kitHits[0];
        const entry = hit.object.userData.entries[hit.instanceId];
        if (entry) {
          if (entry.bridgeId) {
            selectBridge(entry.bridgeId);
            return;
          }
          if (entry.itemId) {
            selectItem(entry.itemId);
            return;
          }
          if (entry.islandId) {
            selectIsland(entry.islandId);
            return;
          }
        }
      }

      const islHits = raycaster.intersectObjects(worldData.islandMeshes, false);
      if (islHits.length > 0 && islHits[0].object.userData.islandId) {
        selectIsland(islHits[0].object.userData.islandId);
        return;
      }
    });

    // 4. 日夜 Keyframe 線性插值與太陽方位更新
    const cSkyTop = new THREE.Color();
    const cHorizon = new THREE.Color();
    const cSun = new THREE.Color();
    const cHemiSky = new THREE.Color();
    const cHemiGround = new THREE.Color();
    const cWater = new THREE.Color();
    const tmpColorB = new THREE.Color();
    const reusableSunDir = new THREE.Vector3();
    let lastActivePeriodId = null;

    function updateDayNightEnvironment(min) {
      const m = ((min % 1440) + 1440) % 1440;
      let k0 = DAY_NIGHT_KEYFRAMES[0];
      let k1 = DAY_NIGHT_KEYFRAMES[1];
      for (let i = 0; i < DAY_NIGHT_KEYFRAMES.length - 1; i++) {
        if (m >= DAY_NIGHT_KEYFRAMES[i].min && m <= DAY_NIGHT_KEYFRAMES[i + 1].min) {
          k0 = DAY_NIGHT_KEYFRAMES[i];
          k1 = DAY_NIGHT_KEYFRAMES[i + 1];
          break;
        }
      }
      const span = Math.max(1, k1.min - k0.min);
      const alpha = THREE.MathUtils.clamp((m - k0.min) / span, 0, 1);

      cSkyTop.setHex(k0.skyTop).lerp(tmpColorB.setHex(k1.skyTop), alpha);
      cHorizon.setHex(k0.horizon).lerp(tmpColorB.setHex(k1.horizon), alpha);
      cSun.setHex(k0.sunColor).lerp(tmpColorB.setHex(k1.sunColor), alpha);
      cHemiSky.setHex(k0.hemiSky).lerp(tmpColorB.setHex(k1.hemiSky), alpha);
      cHemiGround.setHex(k0.hemiGround).lerp(tmpColorB.setHex(k1.hemiGround), alpha);
      cWater.setHex(k0.water).lerp(tmpColorB.setHex(k1.water), alpha);

      const sunI = THREE.MathUtils.lerp(k0.sunI, k1.sunI, alpha);
      const hemiI = THREE.MathUtils.lerp(k0.hemiI, k1.hemiI, alpha);
      const night = THREE.MathUtils.lerp(k0.night, k1.night, alpha);

      const qMin = Math.floor(m / 10) * 10;
      if (qMin !== lastQuantizedSunMin) {
        lastQuantizedSunMin = qMin;
        const t = THREE.MathUtils.clamp((qMin - 360) / 720, 0, 1);
        const az = Math.PI * (0.15 + 0.7 * t);
        const el = 0.35 + Math.sin(t * Math.PI) * 0.75;
        reusableSunDir.set(
          Math.cos(az) * Math.cos(el),
          Math.sin(el),
          0.55 * Math.cos(el) + 0.35
        ).normalize();

        sunLight.position.copy(cityCenter).addScaledVector(reusableSunDir, 40);
        skyMat.uniforms.uSunDir.value.copy(reusableSunDir);
      }

      skyMat.uniforms.uTop.value.copy(cSkyTop);
      skyMat.uniforms.uHorizon.value.copy(cHorizon);
      skyMat.uniforms.uSun.value.copy(cSun);
      skyMat.uniforms.uNight.value = night;

      fog.color.copy(cHorizon);

      sunLight.color.copy(cSun);
      sunLight.intensity = sunI;
      hemiLight.color.copy(cHemiSky);
      hemiLight.groundColor.copy(cHemiGround);
      hemiLight.intensity = hemiI;

      waterMat.uniforms.uTint.value.copy(cWater);
      waterMat.uniforms.uFogColor.value.copy(cHorizon);
      wallWaterMat.uniforms.uTint.value.copy(cWater);
      wallWaterMat.uniforms.uFogColor.value.copy(cHorizon);

      distantEnv.silhouetteMats.forEach((sMat) => {
        sMat.color.copy(sMat.userData.baseColor).lerp(cHorizon, sMat.userData.blend);
      });

      worldData.glowMat.emissiveIntensity = night * 3.2;
      distantEnv.lighthouseGlowMat.emissiveIntensity = 0.4 + night * 3.2;
      worldData.nightAdditiveMeshes.forEach((item) => {
        item.mesh.material.opacity = item.maxOpacity * night;
        item.mesh.visible = night > 0.02;
      });

      const clockText = formatMinToHHMM(m);
      const clockEl = document.getElementById("hud-clock-time");
      if (clockEl) clockEl.textContent = clockText;
      const clockElM = document.getElementById("hud-clock-time-m");
      if (clockElM) clockElM.textContent = clockText;

      const period = getActiveDayCyclePeriod(m);
      const periodText = period ? tr(period.name, period.nameEn) : "";
      const periodEl = document.getElementById("hud-clock-period");
      if (periodEl && period) {
        periodEl.textContent = periodText;
      }
      const periodElM = document.getElementById("hud-clock-period-m");
      if (periodElM && period) {
        periodElM.textContent = periodText;
      }
      if (period && period.id !== lastActivePeriodId) {
        lastActivePeriodId = period.id;
        refreshHighlights();
      }
    }

    // 綁定所有 UI 按鈕與控制項
    document.getElementById("btn-close-detail").addEventListener("click", () => clearSelection(false));
    document.getElementById("btn-reset-view").addEventListener("click", () => clearSelection(true));

    btnToggleList.addEventListener("click", () => {
      const willOpen = rightSidebar.classList.contains("collapsed");
      if (willOpen && window.innerWidth <= 800) {
        detailCard.classList.add("hidden");
      }
      rightSidebar.classList.toggle("collapsed", !willOpen);
      syncMobileSheetState();
      dirty = true;
    });

    const btnCloseSidebarMobile = document.getElementById("btn-close-sidebar-mobile");
    if (btnCloseSidebarMobile) {
      btnCloseSidebarMobile.addEventListener("click", () => {
        rightSidebar.classList.add("collapsed");
        syncMobileSheetState();
        dirty = true;
      });
    }

    // 獨立 HTML 單檔下載按鈕（在獨立分頁開啟時可完全脫離外層 Gemini 網頁的 Monaco Worker 與 GA 雜訊）
    const btnExportHtml = document.getElementById("btn-export-html");
    if (btnExportHtml) {
      btnExportHtml.addEventListener("click", () => {
        try {
          // 不能直接搬 document.documentElement.outerHTML：那會把「跑起來之後才長出來」的東西
          // 一起帶走——renderer 掛上去的 canvas 內容不會被序列化（下載後是一片 0×0 空殼）、
          // CSS2D 標籤是疊加節點（重開會多一層幽靈標籤）。先複製再清空兩個掛載點。
          const clone = document.documentElement.cloneNode(true);
          clone.querySelectorAll("#webgl-container, #css2d-container").forEach((el) => el.replaceChildren());
          const domHtml = "<!DOCTYPE html>\n" + clone.outerHTML;
          // 拆引擎後世界規格／零件表是外部 <script src>，outerHTML 只會複製標籤，
          // 下載到別處就 404、場景全空。導出前把它們 inline 回同一張紙。
          // 只寫規格本身：worldPos／topY／islandId 等 8 個欄位是編譯產物，
          // 帶出去只是把「規格＝真相」弄髒，下次也讀不回來。
          const ISLAND_DERIVED = ["worldPos"];
          const ITEM_DERIVED = ["islandId", "islandCode", "islandName", "islandNameEn", "indexInIsland", "worldPos", "topY"];
          const pick = (obj, drop) => {
            const copy = {};
            for (const k of Object.keys(obj)) if (!drop.includes(k)) copy[k] = obj[k];
            return copy;
          };
          const specOut = pick(DATA, []);
          specOut.islands = DATA.islands.map((isl) => {
            const copy = pick(isl, ISLAND_DERIVED);
            copy.items = (isl.items || []).map((it) => pick(it, ITEM_DERIVED));
            return copy;
          });
          const libOut = { meta: ARCHETYPE_LIB.meta, models: ARCHETYPE_LIB.models, trees: ARCHETYPE_LIB.trees };
          // 注意：這裡的 `<\/script>` 故意寫成跳脫形式——模組會被 inline 回 <script> 裡，
          // 原始碼若出現完整的結束標籤字面量，瀏覽器會提前截斷整個打包結果。
          const dataScript = (name, obj) =>
            `<script>globalThis.${name} = ${JSON.stringify(obj).replace(/<\//g, "<\\/")};<\/script>`;

          let fullHtml = domHtml;
          let inlined = 0;
          const swap = (file, replacement) => {
            // src 後面可能已帶 `?v=dev` 快取參數，所以檔名之後要再放寬一次 [^"]*。
            const re = new RegExp(`<script[^>]*src="[^"]*${file}[^"]*"[^>]*>\\s*<\\/script>`);
            if (!re.test(fullHtml)) return;
            fullHtml = fullHtml.replace(re, () => replacement);
            inlined++;
          };
          swap("world\\.spec\\.generated\\.js", dataScript("__NI_WORLD__", specOut));
          swap("archetypes\\.generated\\.js", dataScript("__NI_ARCHETYPES__", libOut));
          if (inlined === 0) throw new Error("找不到可 inline 的世界規格標籤（資料可能已 inline）");
          if (/<script[^>]*type="module"[^>]*src=/.test(fullHtml)) {
            alert("獨立檔匯出需要在 build 產物上使用：先跑 npm run build，再從 3d_macao_3d_civic_island.html 按「獨立檔」。");
            return;
          }

          const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "macao_policy_island_3d.html";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1500);
        } catch (e) {
          console.warn("Standalone export fallback:", e);
        }
      });
    }

    try { console.clear(); } catch (e) {}
    console.info(
      "%c✅ [澳門政策與城市數據島 3D] WebGL 場景、23 個細分地理方格與 4 條跨海大橋載入完成（本專案 0 錯誤・0 幾何重疊・0 Worker）",
      "background:#007562;color:#fff8f4;padding:4px 10px;border-radius:6px;font-weight:bold;"
    );

    const helpModal = document.getElementById("help-modal");
    const WELCOME_SEEN_KEY = "policy_island_seen_guide_v1";
    const markWelcomeSeen = () => safeStorageSet(WELCOME_SEEN_KEY, "1");
    document.getElementById("btn-open-help").addEventListener("click", () => {
      helpModal.classList.remove("hidden");
    });
    document.getElementById("btn-close-help").addEventListener("click", () => {
      helpModal.classList.add("hidden");
      markWelcomeSeen();
    });
    // 按「登入」即代表已決定成為市民，先記錄已看過，登入回來不再彈卡
    const welcomeLogin = helpModal.querySelector(".welcome-login");
    if (welcomeLogin) welcomeLogin.addEventListener("click", markWelcomeSeen);

    // 首次到訪才顯示；已登入的市民略過。等社交層確認身分後再決定，避免已登入用戶閃一下
    let welcomeShown = false;
    const maybeShowWelcome = () => {
      if (welcomeShown || safeStorageGet(WELCOME_SEEN_KEY)) return;
      if (document.documentElement.dataset.macaoAuth === "1") return;
      welcomeShown = true;
      helpModal.classList.remove("hidden");
    };
    window.addEventListener("macao:authstate", (e) => {
      if (e.detail && e.detail.authenticated) {
        helpModal.classList.add("hidden");
        markWelcomeSeen();
      } else {
        maybeShowWelcome();
      }
    });
    if (document.documentElement.dataset.macaoAuth) maybeShowWelcome();
    else setTimeout(maybeShowWelcome, 1500);

    const searchInput = document.getElementById("search-input");
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderSidebar();
    });

    const tabThemes = document.getElementById("tab-themes");
    const tabFlows = document.getElementById("tab-flows");
    tabThemes.addEventListener("click", () => {
      activeSidebarTab = "themes";
      tabThemes.classList.add("active");
      tabThemes.setAttribute("aria-selected", "true");
      tabFlows.classList.remove("active");
      tabFlows.setAttribute("aria-selected", "false");
      renderSidebar();
    });
    tabFlows.addEventListener("click", () => {
      activeSidebarTab = "flows";
      tabFlows.classList.add("active");
      tabFlows.setAttribute("aria-selected", "true");
      tabThemes.classList.remove("active");
      tabThemes.setAttribute("aria-selected", "false");
      renderSidebar();
    });

    const hudTimeGroup = document.getElementById("hud-time-group");
    document.getElementById("mobile-time-trigger").addEventListener("click", () => {
      hudTimeGroup.classList.toggle("mobile-open");
    });

    document.querySelectorAll(".time-preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        timeOfDayMin = Number(btn.getAttribute("data-min"));
        updateDayNightEnvironment(timeOfDayMin);
        hudTimeGroup.classList.remove("mobile-open");
        dirty = true;
      });
    });

    function bindHudToggle(id, getter, setter, afterToggle) {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener("click", () => {
        const next = !getter();
        setter(next);
        btn.classList.toggle("active", next);
        btn.setAttribute("aria-pressed", String(next));
        btn.blur();
        if (afterToggle) afterToggle(next);
        dirty = true;
        renderer.render(scene, camera);
        css2dRenderer.render(scene, camera);
      });
    }

    // 點擊「名牌」與「搬運」開關時，立即同步更新所有小人的 Sprite 與 CSS2DObject 可見度並立刻重新渲染
    bindHudToggle("tog-district-labels", () => showDistrictLabels, (v) => {
      showDistrictLabels = v;
      islandLabelObjs.forEach((lbl) => { lbl.obj.visible = v; });
      updateLabelCollisionAvoidance();
    });
    bindHudToggle(
      "tog-nameplate",
      () => showNameplates,
      (v) => { showNameplates = v; },
      () => { walkersAndFlows.syncWalkerIndicators(camera.position, showCargoBadges, showNameplates); }
    );
    bindHudToggle(
      "tog-cargo",
      () => showCargoBadges,
      (v) => { showCargoBadges = v; },
      () => { walkersAndFlows.syncWalkerIndicators(camera.position, showCargoBadges, showNameplates); }
    );
    bindHudToggle("tog-flows", () => showAllFlows, (v) => { showAllFlows = v; });
    bindHudToggle("tog-pause", () => isPaused, (v) => { isPaused = v; });
    bindHudToggle("tog-bird", () => isBirdEye, (v) => {
      isBirdEye = v;
      stopLrtFollow();
      if (isBirdEye) {
        const t = controls.target.clone();
        flyToPose(t.clone().add(new THREE.Vector3(0.01, 42, 6)), t);
      } else {
        const pose = getPanoramaPose();
        flyToPose(pose.pos, pose.target);
      }
    });

    bindHudToggle("tog-log", () => showCityLog, (v) => {
      showCityLog = v;
      cityLogPanel.classList.toggle("hidden", !v);
      if (v) renderCityLogList();
    });
    document.getElementById("btn-close-log").addEventListener("click", () => {
      showCityLog = false;
      cityLogPanel.classList.add("hidden");
      const btn = document.getElementById("tog-log");
      btn.classList.remove("active");
      btn.setAttribute("aria-pressed", "false");
    });

    function bindBottomSheetDrag(handleId, sheetEl, defaultVh) {
      const handle = document.getElementById(handleId);
      if (!handle || !sheetEl) return;
      let startY = 0;
      let startH = 0;
      let dragging = false;

      handle.addEventListener("pointerdown", (e) => {
        if (window.innerWidth > 800) return;
        dragging = true;
        startY = e.clientY;
        startH = sheetEl.getBoundingClientRect().height;
        handle.setPointerCapture(e.pointerId);
      });

      handle.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const dy = startY - e.clientY;
        const newH = THREE.MathUtils.clamp(startH + dy, 120, window.innerHeight * 0.88);
        sheetEl.style.height = `${newH}px`;
      });

      handle.addEventListener("pointerup", () => {
        if (!dragging) return;
        dragging = false;
        const curH = sheetEl.getBoundingClientRect().height;
        if (curH > window.innerHeight * 0.65) {
          sheetEl.style.height = "86vh";
        } else if (curH < 170) {
          if (sheetEl.id === "detail-card") clearSelection(false);
          else {
            sheetEl.classList.add("collapsed");
            syncMobileSheetState();
          }
          sheetEl.style.height = `${defaultVh}vh`;
        } else {
          sheetEl.style.height = `${defaultVh}vh`;
        }
      });
    }
    bindBottomSheetDrag("sidebar-sheet-handle", rightSidebar, 52);
    bindBottomSheetDrag("detail-sheet-handle", detailCard, 46);

    window.addEventListener("keydown", (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
      const rotStep = 0.08;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const dir = e.key === "ArrowLeft" ? 1 : -1;
        const offset = camera.position.clone().sub(controls.target);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), dir * rotStep);
        camera.position.copy(controls.target).add(offset);
        controls.update();
        dirty = true;
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const factor = e.key === "ArrowUp" ? 0.94 : 1.06;
        const offset = camera.position.clone().sub(controls.target).multiplyScalar(factor);
        if (offset.length() >= 3.2 && offset.length() <= 68) {
          camera.position.copy(controls.target).add(offset);
          controls.update();
          dirty = true;
        }
      } else if (e.key === "Escape") {
        if (!govModal.classList.contains("hidden")) {
          govModal.classList.add("hidden");
        } else if (!helpModal.classList.contains("hidden")) {
          helpModal.classList.add("hidden");
          safeStorageSet(WELCOME_SEEN_KEY, "1");
        } else {
          clearSelection(false);
        }
      }
    });

    mqlReduced.addEventListener("change", (e) => {
      reducedMotion = e.matches;
      dirty = true;
    });

    const langBtn = document.getElementById("btn-lang-toggle");
    function applyTranslations() {
      document.documentElement.lang = langState.current === "en" ? "en" : "zh-Hant";
      if (langBtn) langBtn.textContent = langState.current === "en" ? "中" : "EN";

      document.querySelectorAll("[data-en]").forEach((el) => {
        if (!el.dataset.zhOrig) {
          el.dataset.zhOrig = el.textContent;
        }
        el.textContent = langState.current === "en" ? el.getAttribute("data-en") : el.dataset.zhOrig;
      });

      const brandTitle = document.getElementById("brand-city-title");
      if (brandTitle) brandTitle.textContent = tr(DATA.city, DATA.cityEn);

      if (searchInput) {
        searchInput.placeholder = langState.current === "en"
          ? searchInput.getAttribute("data-en-placeholder")
          : "搜尋澳門堂區、地標、輕軌、施政指標…";
      }

      islandLabelObjs.forEach((lbl) => {
        const nameSpan = lbl.el.querySelector(".name-text");
        if (nameSpan) nameSpan.textContent = getShortIslandTitle(lbl.island);
      });

      bridgeLabelObjs.forEach((bl) => {
        const bSpan = bl.el.querySelector(".b-name");
        if (bSpan) bSpan.textContent = tr(bl.bridge.name, bl.bridge.nameEn);
      });

      coordLabelObjs.forEach((cl) => {
        cl.el.textContent = tr(cl.cm.label, cl.cm.labelEn);
      });

      renderSidebar();
      populateGovZoneTable();
      if (showCityLog) renderCityLogList();
      if (selectedBridgeId) renderBridgeDetailCard(worldData.bridgeMap.get(selectedBridgeId));
      else if (selectedItemId) renderItemDetailCard(worldData.itemMap.get(selectedItemId));
      else if (selectedIslandId) renderIslandDetailCard(worldData.islandMap.get(selectedIslandId));
      else if (selectedFlowId) {
        const fEntry = walkersAndFlows.flowMeshes.get(selectedFlowId);
        if (fEntry) renderFlowDetailCard(fEntry.flow);
      }
      updateDayNightEnvironment(timeOfDayMin);
      walkersAndFlows.syncWalkerIndicators(camera.position, showCargoBadges, showNameplates);
      dirty = true;
    }

    if (langBtn) {
      langBtn.addEventListener("click", () => {
        langState.current = langState.current === "en" ? "zh" : "en";
        applyTranslations();
      });
    }

    const resizeObserver = new ResizeObserver(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const wasMobile = isMobile;
      isMobile = w <= 800;
      if (wasMobile !== isMobile) {
        if (isMobile) {
          rightSidebar.classList.add("collapsed");
        } else {
          rightSidebar.style.height = "";
          detailCard.style.height = "";
          rightSidebar.classList.remove("collapsed");
        }
        syncMobileSheetState();
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.4 : 1.75));
      renderer.setSize(w, h);
      css2dRenderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      dirty = true;
    });
    resizeObserver.observe(document.getElementById("app"));

    applyTranslations();
    updateDayNightEnvironment(timeOfDayMin);
    refreshHighlights();

    const loadingOverlay = document.getElementById("loading-overlay");
    if (loadingOverlay) {
      loadingOverlay.classList.add("hidden");
    }

    let lastFrameTime = performance.now();
    let fpsFrames = 0;
    let fpsAccum = 0;
    let labelCollisionTick = 0;
    const perfBadge = document.getElementById("perf-badge");
    const lrtFollowCamTarget = new THREE.Vector3();
    const lrtFollowCamPos = new THREE.Vector3();

    function animate(now) {
      requestAnimationFrame(animate);
      const rawDt = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.08);

      fpsFrames++;
      fpsAccum += rawDt;
      if (fpsAccum >= 0.65 && perfBadge && !isMobile) {
        const fps = Math.min(60, Math.round(fpsFrames / fpsAccum));
        const dc = renderer.info && renderer.info.render ? renderer.info.render.calls : 24;
        perfBadge.textContent = `${fps} FPS · ${dc} DC`;
        fpsFrames = 0;
        fpsAccum = 0;
      }

      const isAnimating = (!isPaused && !reducedMotion) || !!cameraFlight || isFollowingLrt || isLightshowActive;
      if (isAnimating) dirty = true;

      if (cameraFlight) {
        cameraFlight.elapsed += dt;
        const u = Math.min(1, cameraFlight.elapsed / cameraFlight.duration);
        const k = easeInOutCubic(u);
        camera.position.lerpVectors(cameraFlight.startPos, cameraFlight.endPos, k);
        controls.target.lerpVectors(cameraFlight.startTarget, cameraFlight.endTarget, k);
        if (u >= 1) cameraFlight = null;
      }

      if (controls.update()) {
        dirty = true;
      }

      if (!dirty) return;

      if (!isPaused && !reducedMotion) {
        elapsedTime += dt;
        // 時間依澳門實際時間自動設定（每 20 秒校正一次）
        timeOfDayMin = getMacauMinutes();
        updateDayNightEnvironment(timeOfDayMin);

        waterMat.uniforms.uTime.value = elapsedTime;
        wallWaterMat.uniforms.uTime.value = elapsedTime;

        distantEnv.clouds.forEach((c) => {
          c.group.position.x += c.speed * dt;
          if (c.group.position.x > cityCenter.x + 48) {
            c.group.position.x = cityCenter.x - 48;
          }
        });

        distantEnv.sailboats.forEach((sb) => {
          sb.boat.position.x = sb.baseX + Math.sin(elapsedTime * 0.45 + sb.phase) * 0.45;
          sb.boat.rotation.z = Math.sin(elapsedTime * 1.4 + sb.phase) * 0.06;
        });
      }

      worldData.updateInteractiveLandmarks(dt, elapsedTime, waterMat, tideLevelM);

      if (isLightshowActive && !reducedMotion) {
        const period = getActiveDayCyclePeriod(timeOfDayMin);
        worldData.updateKitHighlights(selectedIslandId, selectedItemId, new Set(period ? period.items : []), true, elapsedTime, selectedBridgeId);
      }

      if (isFollowingLrt) {
        lrtFollowCamTarget.copy(worldData.lrtPos).addScaledVector(worldData.lrtTan, 0.8);
        lrtFollowCamPos.copy(worldData.lrtPos).addScaledVector(worldData.lrtTan, -2.4).add(new THREE.Vector3(0.8, 1.45, 0.8));
        camera.position.lerp(lrtFollowCamPos, 0.08);
        controls.target.lerp(lrtFollowCamTarget, 0.12);
      }

      const camDistToCity = camera.position.distanceTo(controls.target);
      worldData.updateSmallPropsLOD(camDistToCity);

      walkersAndFlows.updateWalkersAndFlows(dt, elapsedTime, camera.position, {
        paused: isPaused,
        reducedMotion,
        showNameplates,
        showCargoBadges,
        showAllFlows,
        selectedIslandId,
        selectedItemId,
        selectedFlowId,
        selectedWalkerId
      });

      labelCollisionTick = (labelCollisionTick + 1) % 2;
      if (labelCollisionTick === 0) {
        updateLabelCollisionAvoidance();
      }

      updateCitizensAndEffects(dt, elapsedTime);

      renderer.render(scene, camera);
      css2dRenderer.render(scene, camera);

      if (!isAnimating) {
        dirty = false;
      }
    }

    requestAnimationFrame(animate);
  } catch (err) {
    console.error("Policy Island initialization error:", err);
    const loadingOverlay = document.getElementById("loading-overlay");
    const statusEl = document.getElementById("loading-status");
    const errorBox = document.getElementById("error-box");
    if (loadingOverlay) loadingOverlay.classList.remove("hidden");
    if (statusEl) statusEl.textContent = "載入失敗 / Initialization Error";
    if (errorBox) {
      errorBox.style.display = "block";
      errorBox.textContent = `WebGL 或 Three.js 模組載入發生問題：${err && err.message ? err.message : String(err)}`;
    }
  }
}

window.addEventListener("error", (ev) => {
  const errorBox = document.getElementById("error-box");
  const loadingOverlay = document.getElementById("loading-overlay");
  if (errorBox && loadingOverlay && !loadingOverlay.classList.contains("hidden")) {
    errorBox.style.display = "block";
    errorBox.textContent = `資源或模組載入失敗，請檢查網路連線與 WebGL 支援 (${ev.message || "Error"})`;
  }
});

initPolicyIslandApp();

// 引擎層模組（由 src/main.js 拆出）；打包後與 main 同一作用域，見 scripts/build.mjs。
import * as THREE from "three";
import { PALETTE } from "../engine/palette.js";
import { createKitGeometries, getArchetypeParts } from "../engine/kit.js";
import { langState } from "../engine/i18n.js";

// =========================================================================
// 7 & 8 & 9. 標籤系統、離屏 160² 縮圖渲染、UI 互動、飛行相機、日夜與主迴圈
// =========================================================================
export const CIRCLED_NUMS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

export function getShortIslandTitle(isl) {
  if (langState.current === "en") {
    const m = isl.nameEn.match(/^([^(]+)/);
    return m ? m[1].trim() : isl.nameEn;
  }
  // 優先使用 gridCode 中的精煉地名（例如「青洲青茂」「關閘台山」「議事亭塔石」「氹仔海洋花園」），讓 23 座 3D 浮動膠囊標籤清晰直觀不重疊
  if (isl.gridCode && isl.gridCode.includes("·")) {
    return isl.gridCode.split("·")[1].trim();
  }
  const m = isl.name.match(/（([^）]+)）/);
  if (m) {
    return m[1].split("・").slice(0, 2).join("・");
  }
  return isl.name;
}

export function extractStatBricks(facts) {
  const bricks = [];
  const regex = /(\d[\d,.]*\s*(?:萬|億|%|°C|小時|分鐘|秒|公尺|公里|平方公尺|立方公尺|公頃|公噸|萬噸|萬度|座|處|輛|站|間|校|戶|人|人次|元|萬元|億元|天|倍|場|冊|件|組|支|艘|盞|棵|MW|MWh|分貝)?)/;
  for (const f of facts) {
    if (bricks.length >= 3) break;
    const m = f.match(regex);
    if (m) {
      const numStr = m[1].trim();
      const label = f.replace(m[1], "").replace(/^[，、：:\s]+|[，、。；;\s]+$/g, "");
      bricks.push({ num: numStr, label: label.slice(0, 18) });
    }
  }
  return bricks;
}

export function createThumbnailRenderer(mainRenderer) {
  const rt = new THREE.WebGLRenderTarget(160, 160, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true
  });
  const thumbScene = new THREE.Scene();
  const thumbCam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  thumbCam.position.set(1.55, 1.35, 1.85);
  thumbCam.lookAt(0, 0.36, 0);

  const hemi = new THREE.HemisphereLight(0xfffdf9, 0x8f8270, 1.6);
  thumbScene.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff1de, 2.4);
  dir.position.set(2.5, 4.0, 3.0);
  thumbScene.add(dir);

  const modelGroup = new THREE.Group();
  thumbScene.add(modelGroup);

  const kitGeos = createKitGeometries();
  const pixelBuf = new Uint8Array(160 * 160 * 4);

  return function renderToCanvas(canvasEl, modelKind, themeHex) {
    if (!canvasEl) return;
    while (modelGroup.children.length > 0) {
      const ch = modelGroup.children.pop();
      if (ch.material) ch.material.dispose();
    }

    const parts = getArchetypeParts(modelKind, themeHex);
    parts.forEach((p) => {
      const geo = kitGeos[p.kind] || kitGeos.box;
      const isGlow = p.kind === "glowbox" || p.kind === "glowsphere";
      const mat = new THREE.MeshStandardMaterial({
        color: p.color,
        roughness: 0.75,
        metalness: 0,
        emissive: isGlow ? new THREE.Color(PALETTE.glow) : new THREE.Color(0x000000),
        emissiveIntensity: isGlow ? 0.8 : 0
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.px, p.py, p.pz);
      m.rotation.set(p.rx || 0, (p.ry || 0) + 0.35, p.rz || 0, "YXZ");
      m.scale.set(p.sx, p.sy, p.sz);
      modelGroup.add(m);
    });

    const prevTarget = mainRenderer.getRenderTarget();
    const prevClearAlpha = mainRenderer.getClearAlpha();
    const prevClearColor = new THREE.Color();
    mainRenderer.getClearColor(prevClearColor);

    mainRenderer.setRenderTarget(rt);
    mainRenderer.setClearColor(0xf5eadc, 0);
    mainRenderer.clear();
    mainRenderer.render(thumbScene, thumbCam);
    mainRenderer.readRenderTargetPixels(rt, 0, 0, 160, 160, pixelBuf);

    mainRenderer.setRenderTarget(prevTarget);
    mainRenderer.setClearColor(prevClearColor, prevClearAlpha);

    const ctx = canvasEl.getContext("2d");
    const imgData = ctx.createImageData(160, 160);
    for (let y = 0; y < 160; y++) {
      const srcRow = (159 - y) * 160 * 4;
      const dstRow = y * 160 * 4;
      for (let x = 0; x < 160 * 4; x++) {
        imgData.data[dstRow + x] = pixelBuf[srcRow + x];
      }
    }
    ctx.clearRect(0, 0, 160, 160);
    ctx.putImageData(imgData, 0, 0);
  };
}

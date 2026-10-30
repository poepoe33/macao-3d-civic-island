import * as THREE from "three";
import { mulberry32 } from "./rng.js";
import { DATA } from "./world-data.js";

// =========================================================================
// Canvas 程序貼圖產生器（含澳門葡式碎石路 Calçada Portuguesa、磚紋、斑點、條紋）
// =========================================================================
export function createGroundTexture(type, seedOffset) {
  const rng = mulberry32(DATA.seed + seedOffset);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f2e7d8";
  ctx.fillRect(0, 0, 256, 256);

  if (type === "calcada") {
    // 澳門經典黑白海浪紋葡式碎石路 (Calçada Portuguesa)
    ctx.fillStyle = "#f4ece0";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "rgba(56, 48, 44, 0.34)";
    ctx.lineWidth = 10;
    for (let row = -32; row < 288; row += 32) {
      ctx.beginPath();
      for (let x = 0; x <= 256; x += 8) {
        const y = row + Math.sin((x / 256) * Math.PI * 4) * 9;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // 微細石塊縫隙感
    ctx.fillStyle = "rgba(255, 252, 246, 0.35)";
    for (let i = 0; i < 240; i++) {
      ctx.fillRect(rng() * 256, rng() * 256, 3, 3);
    }
  } else if (type === "brick") {
    const rows = 8;
    const cols = 4;
    const rh = 256 / rows;
    const cw = 256 / cols;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (cw / 2);
      for (let c = -1; c <= cols; c++) {
        const shade = Math.floor((rng() - 0.5) * 14);
        ctx.fillStyle = `rgb(${236 + shade}, ${223 + shade}, ${206 + shade})`;
        ctx.fillRect(c * cw + offset + 2, r * rh + 2, cw - 4, rh - 4);
      }
    }
  } else if (type === "speckle") {
    ctx.fillStyle = "#efe4d4";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 420; i++) {
      const x = rng() * 256;
      const y = rng() * 256;
      const rad = 1.2 + rng() * 2.8;
      ctx.fillStyle = rng() > 0.5 ? "rgba(185, 165, 145, 0.38)" : "rgba(255, 252, 245, 0.55)";
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // stripe
    ctx.fillStyle = "#f0e5d6";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "rgba(212, 195, 174, 0.42)";
    for (let i = 0; i < 16; i++) {
      ctx.fillRect(0, i * 16, 256, 7);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRimPatternTexture(themeHex, idx) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = themeHex;
  ctx.fillRect(0, 0, 256, 64);

  ctx.fillStyle = "rgba(255, 248, 244, 0.48)";
  ctx.fillRect(0, 0, 256, 8);
  ctx.fillRect(0, 56, 256, 8);

  // 葡式花磚 Azulejo 幾何圖騰
  const step = 32;
  for (let x = 0; x < 256; x += step) {
    if (idx % 3 === 0) {
      ctx.beginPath();
      ctx.moveTo(x + 16, 14);
      ctx.lineTo(x + 28, 32);
      ctx.lineTo(x + 16, 50);
      ctx.lineTo(x + 4, 32);
      ctx.closePath();
      ctx.fill();
    } else if (idx % 3 === 1) {
      ctx.beginPath();
      ctx.arc(x + 16, 32, 10, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(x + 8, 18, 16, 28);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createLightPoolTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, "rgba(255, 205, 125, 0.95)");
  grad.addColorStop(0.45, "rgba(255, 195, 110, 0.42)");
  grad.addColorStop(1, "rgba(255, 195, 110, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBadgeTexture(iconKind) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fillStyle = "#fff8f4";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#db6a41";
  ctx.stroke();

  ctx.strokeStyle = "#211d1d";
  ctx.fillStyle = "#211d1d";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (iconKind === "book") {
    ctx.strokeRect(38, 42, 26, 44);
    ctx.strokeRect(64, 42, 26, 44);
    ctx.beginPath();
    ctx.moveTo(45, 54); ctx.lineTo(57, 54);
    ctx.moveTo(45, 66); ctx.lineTo(57, 66);
    ctx.moveTo(71, 54); ctx.lineTo(83, 54);
    ctx.stroke();
  } else if (iconKind === "lunchbox") {
    ctx.strokeRect(36, 52, 56, 36);
    ctx.beginPath();
    ctx.moveTo(32, 52); ctx.lineTo(96, 52);
    ctx.arc(64, 52, 14, Math.PI, 0);
    ctx.stroke();
  } else if (iconKind === "sapling") {
    ctx.beginPath();
    ctx.moveTo(64, 92); ctx.lineTo(64, 46);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(50, 56, 14, 8, -0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(78, 48, 14, 8, 0.4, 0, Math.PI * 2);
    ctx.stroke();
  } else if (iconKind === "medkit") {
    ctx.strokeRect(36, 46, 56, 42);
    ctx.beginPath();
    ctx.moveTo(52, 46); ctx.lineTo(52, 36); ctx.lineTo(76, 36); ctx.lineTo(76, 46);
    ctx.moveTo(64, 55); ctx.lineTo(64, 79);
    ctx.moveTo(52, 67); ctx.lineTo(76, 67);
    ctx.stroke();
  } else if (iconKind === "gear") {
    ctx.beginPath();
    ctx.arc(64, 64, 18, 0, Math.PI * 2);
    ctx.stroke();
    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(64 + Math.cos(ang) * 18, 64 + Math.sin(ang) * 18);
      ctx.lineTo(64 + Math.cos(ang) * 28, 64 + Math.sin(ang) * 28);
      ctx.stroke();
    }
  } else if (iconKind === "sensor") {
    ctx.beginPath();
    ctx.arc(64, 74, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(64, 74, 18, -Math.PI * 0.8, -Math.PI * 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(64, 74, 30, -Math.PI * 0.8, -Math.PI * 0.2);
    ctx.stroke();
  } else if (iconKind === "music") {
    ctx.beginPath();
    ctx.arc(48, 78, 8, 0, Math.PI * 2);
    ctx.arc(78, 72, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(55, 78); ctx.lineTo(55, 42); ctx.lineTo(85, 36); ctx.lineTo(85, 72);
    ctx.stroke();
  } else {
    ctx.strokeRect(38, 42, 52, 44);
    ctx.beginPath();
    ctx.moveTo(55, 42); ctx.lineTo(55, 86);
    ctx.moveTo(73, 42); ctx.lineTo(73, 86);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

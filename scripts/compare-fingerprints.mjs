#!/usr/bin/env node
// 指紋比對：node scripts/compare-fingerprints.mjs <a.json> <b.json>
// 退出碼 0 = 完全一致；1 = 有差異（紅燈，不準進下一個 Phase）
import fs from "node:fs";

const [, , a, b] = process.argv;
if (!a || !b) {
  console.error("用法：node scripts/compare-fingerprints.mjs .baseline/fingerprint.pre.json .baseline/fingerprint.p1.json");
  process.exit(2);
}

const strip = (o) => {
  const c = JSON.parse(fs.readFileSync(o, "utf8"));
  delete c.label;
  delete c.generatedAt;
  const render = c.render;
  delete c.render; // 日夜由真實時鐘驅動，像素值只當參考
  return { fp: c, render };
};
const A0 = strip(a);
const B0 = strip(b);
const A = A0.fp;
const B = B0.fp;

const diffs = [];
// 金鑰順序不該影響比對：.baseline 裡有檔案是瀏覽器原樣、有的是經 sort_keys 落地的，
// 直接 JSON.stringify 會讓兩者每筆都不相等。一律遞迴排序金鑰再 stringify。
const canonical = (v) => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const out = {};
    Object.keys(v).sort().forEach((k) => { out[k] = canonical(v[k]); });
    return out;
  }
  return v;
};
const fmt = (v) => (v && typeof v === "object" ? JSON.stringify(canonical(v)) : String(v));

function walk(path, x, y) {
  if (x === y) return;
  const bothObj = x && y && typeof x === "object" && typeof y === "object";
  if (!bothObj) {
    if (fmt(x) !== fmt(y)) diffs.push({ path, before: fmt(x), after: fmt(y) });
    return;
  }
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of [...keys].sort()) {
    if (!(k in x)) { diffs.push({ path: `${path}.${k}`, before: "(不存在)", after: fmt(y[k]) }); continue; }
    if (!(k in y)) { diffs.push({ path: `${path}.${k}`, before: fmt(x[k]), after: "(不存在)" }); continue; }
    const xi = x[k], yi = y[k];
    if (Array.isArray(xi) || Array.isArray(yi)) {
      if (xi.length !== yi.length) { diffs.push({ path: `${path}.${k}.length`, before: xi.length, after: yi.length }); continue; }
      const sx = [...xi].map(fmt).sort();
      const sy = [...yi].map(fmt).sort();
      for (let i = 0; i < sx.length; i++) if (sx[i] !== sy[i]) diffs.push({ path: `${path}.${k}[${i}]`, before: sx[i], after: sy[i] });
      continue;
    }
    walk(`${path}.${k}`, xi, yi);
  }
}

walk("root", A, B);

console.log(`比對：${a}  →  ${b}`);
console.log(`kit 零件數：${A.kit?.total} → ${B.kit?.total}｜分區：${A.data?.districts} → ${B.data?.districts}｜地標：${A.data?.landmarks} → ${B.data?.landmarks}`);
for (const [tag, r] of [[a.slice(a.lastIndexOf("/") + 1), A0.render], [b.slice(b.lastIndexOf("/") + 1), B0.render]]) {
  console.log(`渲染參考值 ${tag}：${r?.error ? "取樣失敗 " + r.error : `同次執行兩次像素 ${r.stable ? "一致 ✅" : "不一致 ❌（渲染不確定）"}｜亮度 ${r.a.meanLum}｜覆蓋 ${r.a.coverage}`}`);
}
if (!diffs.length) {
  console.log(`\n✅ 結構指紋逐項相等（含 kit 零件、實例幾何、地形、路網 ${A.routes?.n ?? "?"} 條、文案哈希）。`);
  process.exit(0);
}
console.log(`\n❌ ${diffs.length} 處差異：`);
for (const d of diffs.slice(0, 60)) console.log(`  ${d.path}\n     前 ${d.before}\n     後 ${d.after}`);
if (diffs.length > 60) console.log(`  …其餘 ${diffs.length - 60} 處`);
process.exit(1);

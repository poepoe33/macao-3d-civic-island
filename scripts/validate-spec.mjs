#!/usr/bin/env node
// 世界規格守門員：node scripts/validate-spec.mjs <world.spec.json> [--archetypes src/world/archetypes.json]
// 規則全部取自現有引擎（buildArchipelagoAndKit / getArchetypeParts / axialToWorld），
// 抽引擎之後由它證明「AI 寫的規格」不會蓋出重疊、斷線或模型不存在的世界。
import fs from "node:fs";

const args = process.argv.slice(2).filter((a) => a !== "--");
const specPath = args.find((a) => !a.startsWith("--"));
if (!specPath) {
  console.error("用法：node scripts/validate-spec.mjs src/world/world.spec.json [--archetypes src/world/archetypes.json] [--trees src/world/trees.json]");
  process.exit(2);
}
const getFlag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const archPath = getFlag("--archetypes");
const treePath = getFlag("--trees");

// 兩份檔案都接受「文件形態」（{meta, models|trees}，gen-archetypes.mjs 的輸出）或扁平 map。
const normalizeLib = (doc) => {
  if (!doc) return null;
  const inner = doc.models || doc.trees;
  return inner && typeof inner === "object" ? { parts: inner, meta: doc.meta || {} } : { parts: doc, meta: {} };
};
const archLib = normalizeLib(archPath ? JSON.parse(fs.readFileSync(archPath, "utf8")) : null);
const treeLib = normalizeLib(treePath ? JSON.parse(fs.readFileSync(treePath, "utf8")) : null);

const errors = [];
const warns = [];
let skippedModelChecks = 0;
const fallbackModels = new Map(); // kind -> 使用次數（有 default 可退，但屬造型欠債）
const err = (msg) => errors.push(msg);

// 查不到就退回 meta.default（引擎行為）；連 default 也沒有才算不合格。
const resolve = (lib, kind) => {
  if (!lib || !kind) return null;
  if (lib.parts[kind]) return lib.parts[kind];
  const dflt = lib.meta.default || lib.meta.defaultTree;
  if (dflt && lib.parts[dflt]) return "fallback";
  return null;
};
const reportFallback = (lib, kind) => {
  const hit = resolve(lib, kind);
  if (hit === "fallback") fallbackModels.set(kind, (fallbackModels.get(kind) || 0) + 1);
  else if (hit === null) return false;
  return true;
};

// ---- 頂層必填 --------------------------------------------------------------
if (!Number.isInteger(spec.seed)) err("seed 必須是整數（決定性生成的根）");
for (const k of ["city", "cityEn", "officialMeta", "islands"]) if (!(k in spec)) err(`缺少頂層欄位：${k}`);

const islands = spec.islands || [];
const ids = new Set();
const cells = new Map();
const landmarkIds = new Set();

// 取自引擎的既有約束：groundType 四種、六角格不可重疊
const GROUND_TYPES = new Set(["calcada", "brick", "speckle", "stripe"]);

islands.forEach((isl, i) => {
  const tag = `分區[${i}] ${isl.id || "?"}`;
  if (!isl.id) err(`${tag}：缺少 id`);
  else if (ids.has(isl.id)) err(`${tag}：id 重複`);
  else ids.add(isl.id);

  if (typeof isl.q !== "number" || typeof isl.r !== "number") err(`${tag}：缺少六角座標 q/r`);
  else {
    const key = `${isl.q},${isl.r}`;
    if (cells.has(key)) err(`${tag}：與 ${cells.get(key)} 落在同一六角格（${key}）→ 會重疊`);
    else cells.set(key, isl.id);
  }
  if (isl.groundType && !GROUND_TYPES.has(isl.groundType)) err(`${tag}：groundType=${isl.groundType} 不在引擎支援的四種之內`);
  if (isl.mainModel && !archLib) skippedModelChecks++;
  else if (isl.mainModel && !reportFallback(archLib, isl.mainModel)) err(`${tag}：mainModel=${isl.mainModel} 不存在於 archetypes 庫，也無 default 可退`);
  if (isl.treeType && !treeLib) skippedModelChecks++;
  else if (isl.treeType && !reportFallback(treeLib, isl.treeType)) err(`${tag}：treeType=${isl.treeType} 不存在於 trees 庫，也無 defaultTree 可退`);
  if (!isl.name || !isl.nameEn) warns.push(`${tag}：缺一語名稱`);

  (isl.items || []).forEach((it, j) => {
    const t2 = `${tag} 地標[${j}] ${it.id || "?"}`;
    if (!it.id) err(`${t2}：缺少 id`);
    else if (landmarkIds.has(it.id)) err(`${t2}：地標 id 全域重複`);
    else landmarkIds.add(it.id);
    if (it.model && !archLib) skippedModelChecks++;
    else if (it.model && !reportFallback(archLib, it.model)) err(`${t2}：model=${it.model} 不存在於 archetypes 庫，也無 default 可退`);
  });
});

// ---- 橋樑與流線必須連到存在的分區 ------------------------------------------
const checkLink = (kind, obj) => {
  for (const key of ["from", "to", "a", "b", "islandId", "startIsland", "endIsland"]) {
    const v = obj?.[key];
    if (typeof v === "string" && v && !ids.has(v) && !landmarkIds.has(v)) err(`${kind} ${obj.id || "?"}：${key}=${v} 指向不存在的分區／地標`);
  }
  (obj?.connects || obj?.islands || []).forEach((v) => {
    if (typeof v === "string" && !ids.has(v)) err(`${kind} ${obj.id || "?"}：connects 指向不存在的分區 ${v}`);
  });
};
(spec.bridgesMeta || spec.bridges || []).forEach((b) => checkLink("橋樑", b));
(spec.flows || []).forEach((f) => checkLink("流線", f));
(islands || []).forEach((isl) => checkLink("分區", isl));

// ---- 輸出 ------------------------------------------------------------------
const counts = {
  分區: islands.length,
  地標: landmarkIds.size,
  橋樑: (spec.bridgesMeta || spec.bridges || []).length,
  流線: (spec.flows || []).length
};
console.log(`校驗 ${specPath}`);
console.log(Object.entries(counts).map(([k, v]) => `${k} ${v}`).join("｜") + `｜seed ${spec.seed}`);
if (skippedModelChecks) console.log(`提示：未提供 --archetypes／--trees，跳過 ${skippedModelChecks} 筆 model 存在性檢查（Phase 2 後可驗）`);
if (fallbackModels.size) {
  const total = [...fallbackModels.values()].reduce((n, v) => n + v, 0);
  const list = [...fallbackModels.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join("、");
  console.log(`\n造型欠債 ${total} 筆引用（${fallbackModels.size} 種）目前退回 default 佔位造型：\n  ${list}`);
  console.log("  → 這些不會崩潰，但會是同一顆地球儀／同一種樹；補完 src/world/archetypes.json 後自然轉正。");
}
if (warns.length) console.log(`\n提示 ${warns.length} 條：\n  ${[...new Set(warns)].slice(0, 8).join("\n  ")}`);
if (errors.length) {
  console.log(`\n❌ 不合格 ${errors.length} 條：`);
  [...new Set(errors)].slice(0, 40).forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\n✅ 規則全數通過（unique id／無重疊六角格／groundType 合法／連結都有目標）。");

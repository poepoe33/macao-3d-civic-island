#!/usr/bin/env node
// 由 .baseline/archetypes.dump.json（執行期探針展開）產生零件表三份檔：
//   src/world/archetypes.json      模型零件（含 kit 幾何定義與 meta）
//   src/world/trees.json           樹種零件
//   src/world/archetypes.generated.js  給 <script src> 用的合併產物（file:// 也能載入）
// 原則：一律執行期展開，不手抄 —— getArchetypeParts 內有條件分支與 PALETTE 引用，
// 手抄必然漂移；$theme 記號由「兩個哨兵色差分」自動辨識。
// 用法：node scripts/gen-archetypes.mjs [--check]
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DUMP = path.join(ROOT, ".baseline", "archetypes.dump.json");
const OUT_MODEL = path.join(ROOT, "src", "world", "archetypes.json");
const OUT_TREE = path.join(ROOT, "src", "world", "trees.json");
const OUT_JS = path.join(ROOT, "src", "world", "archetypes.generated.js");
const CHECK = process.argv.includes("--check");

if (!fs.existsSync(DUMP)) {
  console.error(`❌ 缺少 ${path.relative(ROOT, DUMP)}：請依 scripts/README.md 以 ?probe=1 重新擷取零件表`);
  process.exit(1);
}
const dump = JSON.parse(fs.readFileSync(DUMP, "utf8"));
if (dump.errors && dump.errors.length) { console.error("❌ 擷取階段有錯誤：\n  " + dump.errors.join("\n  ")); process.exit(1); }

const THEME_TOKEN = "$theme";

// 找出「與 default 分支等形」的樹種：零件表完全相同者視為同一家族，
// 家族代表 = 未知樹種的回退（呼應原始 getIslandTreeParts 的 else 分支）。
const sig = (parts) => JSON.stringify(parts);
const treeFamilies = {};
Object.entries(dump.trees).forEach(([t, parts]) => {
  (treeFamilies[sig(parts)] = treeFamilies[sig(parts)] || []).push(t);
});
const treeFamiliesList = Object.values(treeFamilies).sort((a, b) => a[0].localeCompare(b[0]));
const defaultTree = treeFamiliesList.find((f) => f.length > 1)?.[0] || Object.keys(dump.trees)[0];

const archetypesDoc = {
  meta: {
    themeToken: THEME_TOKEN,
    default: "globe",
    note: "未知 model 回退到 meta.default，行為等同原 getArchetypeParts 的 default 分支。",
    varietyDebt: dump.varietyDebt || null,
    fromProbe: dump.version
  },
  kitGeometries: dump.kitGeos,
  models: dump.archetypes
};

const treesDoc = {
  meta: {
    defaultTree,
    families: treeFamiliesList,
    note: "families 中同組的樹種零件完全相同（目前仍屬佔位樣式，補完後應各自分家）。"
  },
  trees: dump.trees
};

// 執行期只需要 meta + models + trees；kitGeometries 是幾何原語的參考資料（給 engine/kit.js 對照用），
// 不進 runtime bundle，免得白載。
const runtimeMeta = { ...archetypesDoc.meta, defaultTree: treesDoc.meta.defaultTree };
const merged = { meta: runtimeMeta, models: dump.archetypes, trees: dump.trees };
const BANNER = "// 由 archetypes.json + trees.json 產生（node scripts/gen-archetypes.mjs）——不要手改，改 JSON 後重新產生。\n";
const jsText = BANNER + "globalThis.__NI_ARCHETYPES__ = " + JSON.stringify(merged) + ";\n";

const models = Object.keys(dump.archetypes).length;
const treeCount = Object.keys(dump.trees).length;
const parts = Object.values(dump.archetypes).reduce((n, p) => n + p.length, 0);
const treeParts = Object.values(dump.trees).reduce((n, p) => n + p.length, 0);
const themeSlots = Object.values(dump.archetypes).reduce((n, ps) => n + ps.filter((p) => p.color === THEME_TOKEN).length, 0);
console.log(`零件表：${models} 個模型（${parts} 件，其中 ${themeSlots} 件吃分區主題）｜${treeCount} 個樹種（${treeParts} 件）｜樹種家族 ${treeFamiliesList.length} 組`);

if (CHECK) {
  const same =
    fs.existsSync(OUT_MODEL) && fs.existsSync(OUT_TREE) && fs.existsSync(OUT_JS) &&
    fs.readFileSync(OUT_MODEL, "utf8") === JSON.stringify(archetypesDoc, null, 2) + "\n" &&
    fs.readFileSync(OUT_TREE, "utf8") === JSON.stringify(treesDoc, null, 2) + "\n" &&
    fs.readFileSync(OUT_JS, "utf8") === jsText;
  if (same) { console.log("✅ 三份檔案與探針擷取結果同步。"); process.exit(0); }
  console.error("❌ 三份檔案有漂移，請跑 node scripts/gen-archetypes.mjs 重新產生");
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT_MODEL), { recursive: true });
fs.writeFileSync(OUT_MODEL, JSON.stringify(archetypesDoc, null, 2) + "\n");
fs.writeFileSync(OUT_TREE, JSON.stringify(treesDoc, null, 2) + "\n");
fs.writeFileSync(OUT_JS, jsText);
console.log(`寫入 ${path.relative(ROOT, OUT_MODEL)}（${fs.statSync(OUT_MODEL).size} bytes）`);
console.log(`寫入 ${path.relative(ROOT, OUT_TREE)}（${fs.statSync(OUT_TREE).size} bytes）`);
console.log(`寫入 ${path.relative(ROOT, OUT_JS)}（${fs.statSync(OUT_JS).size} bytes）`);

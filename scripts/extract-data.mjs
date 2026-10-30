#!/usr/bin/env node
// 從 3d_macao_3d_civic_island.html 取出原始 DATA literal（純資料），產生 world.spec.json
// 不用執行期 dump：執行期物件含 7 個衍生欄位（isl.worldPos / item.worldPos / topY /
// islandId / islandCode / islandName / islandNameEn / indexInIsland，賦值於 6822 與 7021-7027），
// 固化進規格會讓「世界資料」混入「編譯產物」。
// 用法：node scripts/extract-data.mjs [--check]   （--check 只比對，不寫檔）
// Phase 1 之後 HTML 裡已無 literal：此腳本改為「由 world.spec.json 產生 generated.js」。
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const HTML = path.join(ROOT, "3d_macao_3d_civic_island.html");
const OUT_DIR = path.join(ROOT, "src", "world");
const OUT_JSON = path.join(OUT_DIR, "world.spec.json");
const OUT_JS = path.join(OUT_DIR, "world.spec.generated.js");
const CHECK = process.argv.includes("--check");

const src = fs.readFileSync(HTML, "utf8");
const lines = src.split("\n");

const BANNER = "// 由 world.spec.json 產生（node scripts/extract-data.mjs）——不要手改，改 JSON 後重新產生。\n";
const emitJs = (obj) => BANNER + "globalThis.__NI_WORLD__ = " + JSON.stringify(obj) + ";\n";

// 定位 `const DATA = {` … 同縮排的 `};`
const startIdx = lines.findIndex((l) => /^\s*const DATA = \{\s*$/.test(l));
if (startIdx < 0) {
  // Phase 1 之後原始 literal 已不在 HTML 裡：
  //   不帶參數 → 由 world.spec.json 重新產生 classic script 版（改了 JSON 要跑這步）
  //   --check  → 只比對兩份是否同步，防止有人手改其中一份
  if (!fs.existsSync(OUT_JSON)) { console.error("❌ 缺 src/world/world.spec.json"); process.exit(1); }
  const spec = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
  const want = emitJs(spec);
  if (!CHECK) {
    fs.writeFileSync(OUT_JS, want);
    const n = spec.islands.reduce((k, i) => k + (i.items || []).length, 0);
    console.log(`✅ 由 world.spec.json 產生 world.spec.generated.js（${spec.islands.length} 分區｜${n} 地標｜${Buffer.byteLength(want)} bytes）`);
    process.exit(0);
  }
  if (!fs.existsSync(OUT_JS)) { console.error("❌ 缺 src/world/world.spec.generated.js"); process.exit(1); }
  const have = fs.readFileSync(OUT_JS, "utf8");
  if (want === have) {
    console.log(`✅ world.spec.generated.js 與 world.spec.json 同步（${spec.islands.length} 分區｜${spec.islands.reduce((n, i) => n + (i.items || []).length, 0)} 地標｜seed ${spec.seed}）`);
    process.exit(0);
  }
  console.error(`❌ 兩份不同步（generated ${have.length} bytes vs 應有 ${want.length} bytes）→ 請跑 node scripts/extract-data.mjs 重新產生`);
  process.exit(1);
}
let endIdx = -1;
const indent = lines[startIdx].match(/^\s*/)[0];
for (let i = startIdx + 1; i < lines.length; i++) {
  if (lines[i] === `${indent}};`) { endIdx = i; break; }
  if (new RegExp(`^${indent}const |^${indent}function `).test(lines[i])) break;
}
if (endIdx < 0) { console.error("找不到 DATA 的結尾 };"); process.exit(1); }

const literalText = lines.slice(startIdx, endIdx + 1).join("\n");
console.log(`DATA literal：第 ${startIdx + 1}–${endIdx + 1} 行（${endIdx - startIdx + 1} 行，${literalText.length} bytes）`);

// 在空沙箱求值：若 literal 引用了任何外部符號就會在這裡爆，絕不悄悄產生半成品
const sandbox = {};
const DATA = vm.runInNewContext(`(${literalText.replace(/^\s*const DATA = /, "").replace(/;\s*$/, "")})`, sandbox, { timeout: 5000 });

// 衍生欄位守門：規格內不得出現編譯產物
const DERIVED = [
  "worldPos", "topY", "islandId", "islandCode", "islandName", "islandNameEn", "indexInIsland",
  "midWorldPos", "curve" // bridgesMeta 的執行期派生（6822／7021-7027 與橋樑編譯段）
];
const foundDerived = [];
JSON.stringify(DATA, (k, v) => { if (DERIVED.includes(k)) foundDerived.push(k); return v; });
if (foundDerived.length) { console.error(`❌ 規格內含衍生欄位：${[...new Set(foundDerived)].join(", ")}`); process.exit(1); }

// 穩定欄位順序：先常用欄位，其餘依字母，讓 diff 好讀
const ORDER = {
  top: ["seed", "city", "cityEn", "officialMeta", "islands", "bridgesMeta", "flows", "dayCycle"],
  island: ["id", "code", "name", "nameEn", "parish", "gridCode", "landmass", "macroRegion", "macroRegionEn", "lat", "lng", "areaKm2", "population", "dept", "sourceUrl", "icon", "color", "q", "r", "groundType", "treeType", "mainModel", "summary", "summaryEn", "items"],
  item: ["id", "name", "nameEn", "desc", "descEn", "facts", "factsEn", "schedule", "scheduleEn", "model"]
};
const orderKeys = (obj, pref) => {
  const keys = Object.keys(obj);
  const head = pref.filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !head.includes(k)).sort();
  const out = {};
  for (const k of [...head, ...rest]) out[k] = obj[k];
  return out;
};

const spec = orderKeys(DATA, ORDER.top);
spec.islands = spec.islands.map((isl) => {
  const o = orderKeys(isl, ORDER.island);
  if (Array.isArray(o.items)) o.items = o.items.map((it) => orderKeys(it, ORDER.item));
  return o;
});

const landmarkCount = spec.islands.reduce((n, isl) => n + (isl.items || []).length, 0);
console.log(`抽出：${spec.islands.length} 分區｜${landmarkCount} 地標｜${(spec.bridgesMeta || []).length} 橋樑｜${(spec.flows || []).length} 流線｜seed ${spec.seed}`);

if (CHECK) {
  if (!fs.existsSync(OUT_JSON)) { console.error("❌ 尚無 src/world/world.spec.json 可比對"); process.exit(1); }
  const onDisk = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
  const a = JSON.stringify(spec);
  const b = JSON.stringify(onDisk);
  if (a === b) { console.log("✅ 原始 literal 與 disk 上的規格逐字元相同。"); process.exit(0); }
  console.error(`❌ 出現漂移（literals ${a.length} bytes vs disk ${b.length} bytes）`);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) { console.error(`   第一個差異在第 ${i} 字元：\n   期望 …${a.slice(i, i + 90)}\n   實際 …${b.slice(i, i + 90)}`); break; }
  }
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(spec, null, 2) + "\n");
// 同時產生 classic script 版：file:// 直接開啟時 import 外部模組會被 CORS 擋掉，
// 但 <script src> 的傳統指令碼可以，所以「零建置雙擊開啟」這條賣點要保住。
fs.writeFileSync(OUT_JS, emitJs(spec));
console.log(`寫入 ${path.relative(ROOT, OUT_JSON)}（${fs.statSync(OUT_JSON).size} bytes）`);
console.log(`寫入 ${path.relative(ROOT, OUT_JS)}（${fs.statSync(OUT_JS).size} bytes，classic script 版供 file:// 使用）`);

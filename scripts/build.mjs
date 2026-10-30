#!/usr/bin/env node
// 零相依打包器：src/index.html + src/**|*.js（ESM）→ 根目錄單一 HTML（雙擊可開）。
//
// 為什麼要自己打包：README 的核心賣點是「零建置、雙擊就能開」，而 file:// 下瀏覽器不準
// module script 載入本地相對路徑檔案（CORS）。所以原始碼走 ESM 方便拆與審閱，
// 產物走「整棵模組圖 inline 回一個 <script type="module">」。
//
// 打包規則（寫原始碼時要守，打包器會檢查並紅燈）：
//   1. 不準循環 import（DFS 偵測，報出迴圈路徑）。
//   2. 本地 import 一律寫成 "./x.js" 或 "../dir/x.js" 附副檔名，且檔案必須存在。
//   3. 只準 `import 名稱/命名空間 from "裸模組"`（importmap 裡的那些）與絕對 https，
//      同一裸模組若用了兩個不同本地名稱 → 報錯；打包器把它們提到最前面並去重。
//   4. 匯出只準 `export function|const|let|class …` 與單行 `export { a, b }`；
//      不支援 export default（單一作用域打包下只會增加困惑）。
//   5. 所有模組共用一個頂層作用域 ⇒ 頂層名稱不得重複（打包器逐一對帳）。
//
// 用法：node scripts/build.mjs [--check] [--out 檔案]
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");
const ENTRY = path.join(SRC, "main.js");
const TEMPLATE = path.join(SRC, "index.html");
const OUT_DEFAULT = path.join(ROOT, "3d_macao_3d_civic_island.html");
const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? path.resolve(ROOT, args[outIdx + 1]) : OUT_DEFAULT;

const fail = (msg) => {
  console.error("❌ " + msg);
  process.exit(1);
};

// ── import／export 解析 ────────────────────────────────────────────────────
const RE_IMPORT_MULTI = /^[ \t]*import\s+\{([^}]*)\}\s+from\s+["']([^"']+)["'];?[ \t]*$/gm;
const RE_IMPORT_ONE = /^[ \t]*import\s+([^\n;{}]*?)\s+from\s+["']([^"']+)["'];?[ \t]*$/gm;
const RE_EXPORT_BRACES = /^[ \t]*export\s*\{([^}]*)\};?[ \t]*$/gm;
const RE_EXPORT_DECL = /^([ \t]*)export\s+(async\s+function|function|const|let|var|class)\s+/gm;
const RE_TOP_DECL = /^(?:async function|function|const|let|var|class)\s+(\w+)/;

// import 語句必須先過「多行大括號」再過單行，否則單行式會把半條 import 吃掉。
function stripImports(code) {
  const localSpecs = [];
  const bareImports = new Map(); // specifier -> Set(localName)
  let out = code;

  out = out.replace(RE_IMPORT_MULTI, (_m, names, spec) => {
    record(names, spec, true);
    return "";
  });
  out = out.replace(RE_IMPORT_ONE, (_m, clause, spec) => {
    record(clause, spec, false);
    return "";
  });

  function record(clause, spec, braced) {
    clause.split(",").map((s) => s.trim()).filter(Boolean).forEach((raw) => {
      let local;
      if (raw.startsWith("*")) {
        // `import * as THREE from "three"` → 原樣保留，打包後仍是一條星號 import
        local = raw;
        if (!/\*\s+as\s+\w+/.test(raw)) fail(`星號匯入寫法不完整：「${raw}」（應為 * as 名稱）`);
      } else if (raw.includes(" as ")) {
        local = raw.split(/\s+as\s+/)[1].trim();
      } else if (/^\w+$/.test(raw) && !braced) {
        fail(`不支援 default／副作用 import：「${raw}」from "${spec}" —— 打包器只認命名匯入與 * as`);
      } else {
        local = raw;
      }
      if (spec.startsWith(".") || spec.startsWith("/")) {
        localSpecs.push(spec);
      } else {
        if (!bareImports.has(spec)) bareImports.set(spec, new Set());
        bareImports.get(spec).add(local);
      }
    });
  }

  return { code: out, localSpecs, bareImports };
}

function stripExports(code, exported) {
  let out = code.replace(RE_EXPORT_BRACES, (_m, names) => {
    names.split(",").map((s) => s.trim()).filter(Boolean).forEach((n) => {
      const orig = n.includes(" as ") ? n.split(/\s+as\s+/)[0].trim() : n;
      exported.push({ name: orig, spec: "exported" });
    });
    return "";
  });
  out = out.replace(RE_EXPORT_DECL, (_m, indent, kw) => indent + kw + " ");
  return out;
}

// ── 模組圖 ─────────────────────────────────────────────────────────────────
const visited = new Set();
const visiting = new Set();
const order = [];
const stack = [];
const modules = new Map(); // absPath -> { code, localSpecs, bareImports }

function loadModule(absPath) {
  if (visited.has(absPath)) return;
  if (visiting.has(absPath)) {
    fail("循環 import：" + [...stack.slice(stack.indexOf(absPath)), absPath].map((p) => path.relative(ROOT, p)).join(" → "));
  }
  if (!fs.existsSync(absPath)) fail(`找不到模組：${path.relative(ROOT, absPath)}`);

  visiting.add(absPath);
  stack.push(absPath);

  const raw = fs.readFileSync(absPath, "utf8");
  const parsed = stripImports(raw);
  const deps = [...new Set(parsed.localSpecs)].map((spec) => {
    const target = path.resolve(path.dirname(absPath), spec);
    if (!target.startsWith(SRC + path.sep) && target !== ENTRY) {
      fail(`${path.relative(ROOT, absPath)} import "${spec}" 跳出 src/ 了，打包器不支援`);
    }
    return target;
  });
  deps.forEach(loadModule);

  stack.pop();
  visiting.delete(absPath);
  visited.add(absPath);
  modules.set(absPath, parsed);
  order.push(absPath); // 後序：被依賴者先進 bundle
}

loadModule(ENTRY);

// ── 頂層名稱對帳（同一作用域不能撞名）──────────────────────────────────────
const owner = new Map();
modules.forEach((mod, absPath) => {
  const stripped = stripExports(mod.code, []);
  stripped.split("\n").forEach((line) => {
    const m = RE_TOP_DECL.exec(line);
    if (!m) return;
    const name = m[1];
    if (owner.has(name) && owner.get(name) !== absPath) {
      fail(`頂層名稱撞車：「${name}」同時宣告於 ${path.relative(ROOT, owner.get(name))} 與 ${path.relative(ROOT, absPath)}（打包後同一作用域）`);
    }
    if (!owner.has(name)) owner.set(name, absPath);
  });
});

// ── 組 bundle ──────────────────────────────────────────────────────────────
// 同一裸模組在不同檔案可以取用不同命名匯出（CSS2DRenderer / CSS2DObject），打包後合併成一條 import。
// 會撞車的是「同一本地名稱來自兩個不同模組」，那個才擋。
const bareByName = new Map(); // specifier -> Set(localName)
const specifierOfName = new Map(); // localName -> specifier
modules.forEach((mod, absPath) => {
  mod.bareImports.forEach((names, spec) => {
    if (!bareByName.has(spec)) bareByName.set(spec, new Set());
    names.forEach((n) => {
      if (specifierOfName.has(n) && specifierOfName.get(n) !== spec) {
        fail(`本地名稱「${n}」同時來自 ${specifierOfName.get(n)} 與 ${spec}（${path.relative(ROOT, absPath)}）——打包後會撞名`);
      }
      specifierOfName.set(n, spec);
      bareByName.get(spec).add(n);
    });
  });
});

// `import * as THREE from "three"` 的 clause 是「* as THREE」，須還原成星號形式，
// 其余命名匯入合併成一條 import。
const starLines = [...bareByName.entries()].flatMap(([spec, names]) =>
  [...names].filter((n) => n.startsWith("*")).map((n) => `import ${n} from "${spec}";`)
);
const namedLines = [...bareByName.entries()].flatMap(([spec, names]) => {
  const plain = [...names].filter((n) => !n.startsWith("*"));
  return plain.length ? [`import { ${plain.join(", ")} } from "${spec}";`] : [];
});

const banners = [
  "// ⚠️ 本檔案是 `npm run build` 的產物：原始碼在 src/index.html + src/**/*.js。",
  "//    要改東西請改 src/，再跑 npm run build；直接改這裡的內容會被下次打包蓋掉。",
  `//    模組圖：${order.map((p) => path.relative(ROOT, p)).join("、")}`
];

const bodyParts = order.map((absPath) => {
  const mod = modules.get(absPath);
  const code = stripExports(mod.code, []);
  const clean = code.split("\n").filter((l, i) => !(l === "" && i === 0)).join("\n").replace(/\n{3,}/g, "\n\n");
  return `// ═══ ${path.relative(ROOT, absPath)} ═══\n${clean.trimEnd()}`;
});

const bundle = `${banners.join("\n")}\n\n${[...starLines, ...namedLines].join("\n")}\n\n${bodyParts.join("\n\n")}\n`;

// ── 套 HTML 樣板 ───────────────────────────────────────────────────────────
const html = fs.readFileSync(TEMPLATE, "utf8");
const ENTRY_TAG = '  <script type="module" src="./main.js"></script>';
if (!html.includes(ENTRY_TAG)) fail(`找不到入口 script 標籤：${ENTRY_TAG}`);

const toRoot = (attr) =>
  attr
    .replace(/^\.\/world\//, "./src/world/")
    .replace(/^\.\.\/web\//, "./web/");

let rendered = html.replace(ENTRY_TAG, () => `  <script type="module">\n${bundle.replace(/^/gm, "    ").replace(/[ \t]+$/gm, "")}  </script>`);
rendered = rendered.replace(/(href|src)="(\.\/world\/[^"]*|\.\.\/web\/[^"]*)"/g, (_m, attr, val) => `${attr}="${toRoot(val)}"`);

// 快取參數必須覆蓋每一支外部檔案，不只 social.js／css。
// 規格與零件表拆成 <script src> 後，若沿用固定 URL，使用者會卡在舊世界資料
// （改了 world.spec.json 卻看到舊地圖）。deploy.yml 的 sed 只認字面量 `?v=dev`，
// 所以這裡把所有「本地產物」引用統一戳上 `?v=dev`，由部署時一次換成 commit hash。
rendered = rendered.replace(/(src="\.\/src\/world\/[\w.-]+\.js)(")/g, '$1?v=dev$2');
if (!/world\.spec\.generated\.js\?v=dev/.test(rendered) || !/archetypes\.generated\.js\?v=dev/.test(rendered)) {
  fail("產物裡找不到 generated 腳本的 ?v=dev 快取參數 —— 部署時會拿到舊的規格／零件表");
}
if (!/social\.js\?v=dev/.test(rendered) || !/social\.css\?v=dev/.test(rendered)) {
  fail("產物裡找不到 social.js?v=dev／social.css?v=dev —— deploy.yml 的 sed 會落空");
}

// 整棵模組圖 inline 在同一個 <script> 裡：原始碼只要出現 `</script`（哪怕是字串），
// 瀏覽器就會提前截斷，剩下全部變成頁面文字。這條比任何測試都便宜。
const closers = bundle.match(/<\/script/gi);
if (closers) fail(`bundle 內出現 ${closers.length} 個 \`</script\` 字面量，inline 後會截斷頁面；請改寫成 <\\/script`);

if (CHECK) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : null;
  if (current === rendered) {
    console.log(`✅ ${path.relative(ROOT, OUT)} 與 src/ 同步（${order.length} 個模組）`);
    process.exit(0);
  }
  console.error(`❌ ${path.relative(ROOT, OUT)} 已落後於 src/，請跑 npm run build`);
  process.exit(1);
}

fs.writeFileSync(OUT, rendered);
console.log(`✅ 打包完成：${path.relative(ROOT, OUT)}（${order.length} 個模組、${rendered.split("\n").length} 行、${rendered.length} bytes）`);

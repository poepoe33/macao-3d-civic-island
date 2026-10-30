# 引擎抽離護欄（scripts/）

這九支腳本（兩支跑在瀏覽器）是 Route A 抽離期間的唯一紅燈來源：**結構指紋不同就不准進下一個 Phase。**
全部零相依，只有 Node 22 與瀏覽器；不新增任何 build tool。

| 腳本 | 做什麼 |
| --- | --- |
| `fingerprint.js` | 瀏覽器端，算出世界結構指紋（kit 零件／實例幾何／地形／路網／文案／像素） |
| `camera-poses.js` | 瀏覽器端，切 4 個固定視角供肉眼比對 |
| `collect-server.mjs` | 本機 8766，接收指紋並寫進 `.baseline/`（免於逐次複製 5KB JSON） |
| `compare-fingerprints.mjs` | 兩份指紋比對，不相等就 exit 1（唯一的紅燈來源） |
| `extract-data.mjs` | 由規格來源產生 `world.spec.json` + 可雙擊載入的 classic script |
| `gen-archetypes.mjs` | 由探針展開的零件表產生 `archetypes.json`／`trees.json`／`archetypes.generated.js` |
| `gen-seed.mjs` | 由 `world.spec.json` 產生 `server/data/seed.json`（欄位順序照 `migrate.js` 的 INSERT） |
| `validate-spec.mjs` | 世界規格守門員：重疊六角格、重複 id、斷線、groundType、模型存在性 |
| `build.mjs` | 把 `src/` 的 16 個模組打包回根目錄單一 HTML；`--check` 比對是否同步 |
| `serve.mjs` | 零相依靜態伺服器（8765），全部回應 `no-store`；`npm run serve` 即此 |

`npm run check` 會一次跑完 build／spec／零件表／seed 的漂移比對與規則校驗；CI 部署前也跑同一條（見 `.github/workflows/deploy.yml`）。

**別用 `python3 -m http.server` 做指紋比對**：它不送 `Cache-Control`，瀏覽器會用啟發式快取把舊的 `world.spec.generated.js?v=dev` 餵回來，兩次指紋看起來一樣其實是同一份舊資料（2026-10-30 實際踩到）。`npm run serve` 送 `no-store` 才可靠；但**舊的啟發式快取條目**在同一 URL 下仍可能先贏，所以換一輪驗證時就換一個 port（`node scripts/serve.mjs 8771`），快取鍵不同即拿到新檔。

## 指紋讀的是什麼

| 區塊 | 來源 | 為什麼可信 |
| --- | --- | --- |
| `kit.byKind` | `mesh.userData.entries` 的 `matrix.elements` + `baseColor` | `updateKitHighlights` 每幀 `setColorAt`、`updateSmallPropsLOD` 會寫 `zeroMatrix`，讀 GPU buffer 會讓基線隨時間漂移；`entries` 是編譯輸出的不可變原始值 |
| `instanced` / `instancedAnimated` | `instanceMatrix.array` + `instanceColor.array`，**雙快照自動分類** | 隔 1.5 秒取兩次，哈希相同才算靜態；原本靜態卻被接上動畫會從 stable 掉進 animated = 真實回歸訊號。直接讀底層 Float32Array，模組作用域拿不到 `THREE` 也能跑 |
| `terrain` | `PlaneGeometry` 的 `position`／`normal`／`uv`／`color` 全頂點哈希 | 170² 細分 160 = 25,921 頂點，任何地形演算法改動都會現形 |
| `routes` | `findIslandRoute()` 全部 C(23,2)=253 條最短路 | 路網只暴露這個介面，用成對取樣證明圖結構與里程 |
| `data.copyHash` | 23 分區 × 82 地標的全部中英文名、摘要、facts | 抽 JSON 時最容易漏文案，這條抓漏字 |
| `render`（參考值，不作為紅燈） | 640×400 離屏 `readPixels` 校驗和 | 日夜由 Asia/Macau 真實時鐘驅動，跨時段不可比；但同次執行兩次必須相同（渲染確定性），跨階段比對當作粗粒度訊號 |

## 擷取流程（瀏覽器）

```bash
npm run dev      # 先 npm run build，再開 node scripts/serve.mjs（no-store，避免讀到舊規格）
```

開 `http://127.0.0.1:8765/3d_macao_3d_civic_island.html?probe=1`（產物）或
`http://127.0.0.1:8765/src/index.html?probe=1`（開發，直接跑 16 個 ESM 模組），在 console（或 agent 的 evaluate_script）注入並擷取：

```js
await (async () => {
  const s = document.createElement("script");
  s.src = "/scripts/fingerprint.js?nc=" + Date.now();
  document.head.appendChild(s);
  await new Promise((res, rej) => { s.onload = res; s.onerror = () => rej(new Error("載入指紋腳本失敗")); });
  return await window.__niFingerprint("phase1");   // 注意：async
})()
```

攔下視窗錯誤（頁面卡住又沒印錯誤時用）：在 `<head>` 最前面暫存一段
`window.addEventListener("error", …, true)` 到副本檔，載入後讀 `window.__ERRS__`；查完刪副本。

或直接叫收集器落地（先 `npm run collect`）：

```js
await fetch("http://127.0.0.1:8766/fingerprint?label=phase2", { method: "POST", body: JSON.stringify(await window.__niFingerprint("phase2")) });
```

把回傳的 JSON 存進 `.baseline/fingerprint.<phase>.json`，然後：

```bash
node scripts/compare-fingerprints.mjs .baseline/fingerprint.pre-a.json .baseline/fingerprint.phase1.json
node scripts/validate-spec.mjs src/world/world.spec.json          # Phase 1 起
node scripts/validate-spec.mjs src/world/world.spec.json \
     --archetypes src/world/archetypes.json --trees src/world/trees.json   # Phase 2 起
```

視角切換（肉眼比對用，需可見的分頁表面）：

```js
await (async () => {
  const s = document.createElement("script");
  s.src = "/scripts/camera-poses.js?nc=" + Date.now();
  document.head.appendChild(s);
  await new Promise((res) => { s.onload = res; });
  return window.__niSetPose("panorama");  // panorama / peninsula / taipa / tower
})()
```

## 已知限制

- 截圖型視覺基線需要可見的瀏覽器表面（in-app Browser 或真實分頁）；`viewport=0x0` 時 `take_screenshot` 會拒絕，此時改用 `render` 像素校驗與結構指紋。
- `?probe=1` 只在 URL 帶該參數時多掛一個 `window.__NI_PROBE__` 參考，不改變任何渲染路徑；正常載入完全不執行。
- 免登入（後端未啟動）時 `/api/*` 會 404，市民與建設沙盤是空的——這是預期狀態，指紋擷取一律在此狀態進行，確保前後條件一致。

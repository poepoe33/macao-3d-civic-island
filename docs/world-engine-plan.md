# 造島引擎抽離計畫（Route A）

> 目標：把 `3d_macao_3d_civic_island.html` 裡的「世界生成手法」從程式碼提煉成 **規格 + 引擎**，
> 讓 AI（與未來的我們）只寫資料就能生成或修改一座 3D 世界，不必再 patch 一個 11,596 行的單檔。
>
> 鐵律：**這個階段不改任何畫面、不改任何互動。** 抽完的判定標準只有一個——
> 同種子渲染出的場景，結構指紋與遷移前逐項相等。

---

## 1. 現況地圖（實測，作為遷移依據）

| 區塊 | 行範圍 | 行數 | 性質 |
| --- | --- | --- | --- |
| `<style>` 全部 CSS | 15–2119 | 2,105 | UI 樣式，與 3D 無關 |
| `<body>` 標記（HUD／彈窗／歡迎卡） | 2122–2494 | 373 | UI 骨架 |
| `<script type="module">` | 2495–11393 | 8,899 | **引擎全部在這裡** |
| — Section 0 `DATA` 常數 | 2503–5411 | 2,909 | 23 分區、82 地標、橋樑、流線、日夜 |
| — Section 1 工具與色票 | 5412–5474 | 63 | `mulberry32`、`tr()`、`PALETTE` |
| — Section 2 座標系統 | 5475–5499 | 25 | `R`／`SPACING`／`axialToWorld`／`HEX_DIRS` |
| — Section 3 Canvas 程序貼圖 | 5500–5723 | 224 | 碎石路、磚紋、波紋、徽章 |
| — Section 4 日夜與環境 Shader | 5724–5871 | 148 | `DAY_NIGHT_KEYFRAMES`、天空、水面 |
| — Section 5 零件庫與 Archetypes | 5872–6216 | 345 | `createKitGeometries`、`getArchetypeParts`（275 行／153 個 `add()`）、`getIslandTreeParts` |
| — 遠景地形 | 6217–6532 | 316 | fbm＋Simplex、170² 地形、2,100/900 棵實例樹、雲、燈塔、帆船 |
| — 群島編譯器 | 6533–7771 | 1,239 | `buildArchipelagoAndKit`：`pushKitPart`、`placeArchetypeModel`、Dijkstra 路網、`kitEntries` |
| — Section 6 公仔與流線 | 7772–8267 | 496 | walkers、badge 貼圖、協作 tube |
| — `initPolicyIslandApp` | 8383–11392 | 3,010 | HUD、選取、沙盤、市民公仔、日迴圈 |
| `web/social.js`（外部） | — | 104 KB | 市民中心 overlay |
| 尾端 inline script | 11395–11595 | 201 | 表單／HUD sheet |

已存在的好東西（**不要重寫，只要外提**）：

- `pushKitPart()` 的輸出 tuple `{kind, px,py,pz, sx,sy,sz, color, rx,ry,rz}` —— 這已經是場景 IR。
- `mulberry32` + `DATA.seed = 20261023` —— 決定性生成，回歸對拍的基礎。
- `axialToWorld(q, r)` + 「R=1.62／SPACING=1.84 零重疊」—— 現成的空間規則。
- `window.macaoBridge`（定義於 10016 行）—— 3D 與社群層之間已經有一份乾淨介面。

---

## 2. 目標結構

```
src/
  world/
    world.spec.json        # 世界：seed、city、meta、districts[]、landmarks[]、bridges[]、flows[]、dayCycle
    archetypes.json        # 36+ 種 model 的零件表（由執行期 dump 產出，不手抄）
    trees.json             # treeType → 零件表
    textures.json          # groundType / rimPattern 參數化
    themes.json            # PALETTE、日夜 keyframes、霧色
  engine/
    rng.js                 # mulberry32
    coords.js              # R/SPACING/axialToWorld/HEX_DIRS
    kit.js                 # createKitGeometries
    materials.js           # canvas 貼圖 + sky/water shader
    compile.js             # spec + archetypes → kitEntries／scene（純函數，不碰 DOM）
    graph.js               # 路網節點、邊、Dijkstra
    walkers.js             # 公仔與流線
    render.js              # scene、LOD、動畫迴圈
  app/
    hud.js  sandbox.js  citizens.js  cards.js  i18n.js  bridge.js
  index.template.html
web/  social.js  social.css   # 不動，繼續吃 macaoBridge
server/data/seed.json         # 改成由 world.spec.json 產出（見 Phase 4）
dist/3d_macao_3d_civic_island.html   # build 產物，部署用的檔名維持不變
```

核心契約：`compile(spec, libraries) -> { kitEntries, meshes, graph, stats }` 必須是**無 DOM、無 THREE 場景副作用**的純函數，這樣伺服器、測試、AI 都能直接呼叫它。

---

## 3. 遷移順序

### Phase 0｜護欄先行（半個工作段落，別跳過）

1. 建 `scripts/dump-scene.mjs`＋`scripts/validate-spec.mjs` 兩支腳本（見 §4、§5）。
2. 在當前檔案記錄基線：`kitEntries` 依 `kind` 的數量與色值總和、每島包圍盒、`graphNodes.size`／`graphAdj` 邊數、82 地標的 `model` 分佈（現況：`lrtstation` 9、`pavilion`/`busdepot` 5、`townhall`/`park`/`guia`/`globe`/`cottage` 4…）。
3. 以 4 個視角（遠全景、半島、離島、旅遊塔）用真實 Chrome 截 PNG 存 `.screenshots/baseline/`。
4. 回滾點：標籤 `pre-engine-split`。

**驗證**：基線檔能重跑重現（同種子兩次 dump 指紋一致）。

**Phase 0 實測結果（2026-10-30 完成）**

護欄四支腳本已就位：`scripts/fingerprint.js`（瀏覽器側指紋）、`scripts/compare-fingerprints.mjs`（比對紅燈）、`scripts/validate-spec.mjs`（規格守門員）、`scripts/camera-poses.js`（固定機位）；用法見 `scripts/README.md`，Node 入口 `npm run serve`／`npm run compare`／`npm run check`。探針鉤點 `window.__NI_PROBE__` 已掛在 `3d_macao_3d_civic_island.html`，只在 `?probe=1` 時生效，正常載入不執行任何一路徑。

基線（`.baseline/fingerprint.pre-a.json` 與 `pre-b.json`，兩次擷取逐項相等，exit 0）：

- kit 編譯輸出 **3,559 個零件**，分 12 組 InstancedMesh（`rbox` 1,067、`cylinder` 777、`box` 437、`glowsphere` 432、`ico` 377、`sphere` 224、`torus` 65、`glowbox` 59、`cone` 49、`hip` 34、`dome` 30、`prism` 8）。
- 地形 **25,921 個頂點**，包圍盒 `[-87.49, 82.51, -0.55, 8.39, -86.52, 83.48]`，position／normal／uv／color 四條屬性哈希全入檔。
- 路網 **253 條最短路**（C(23,2)）全數取樣入哈希。
- 資料面：23 分區、82 地標、7 條橋樑資料、12 條流線、**38 種 model 型別**，全部中英文名＋摘要＋facts 的 `copyHash` 已記錄。
- 實例幾何分類：**靜態 19 組、動態 0 組**（免登入狀態下 NPC 凍結，與 README「真實市民取代 NPC」一致）。
- 離屏渲染參考值：640×400 像素校驗 `43a11aa7`、平均亮度 155.66、非黑覆蓋 99.96%，同次執行兩次一致（渲染確定性成立）。GPU 為 ANGLE Metal（Apple M4），非 SwiftShader。
- Console -side：WebGL 場景載入訊息為 0 錯誤；`/api/*` 的 5 筆 404 是「未起後端」的預期狀態，指紋一律在此條件擷取。

待辦：視覺截圖基線需要可見的瀏覽器表面（in-app Browser 分頁），目前 0x0 會拒絕擷取，因此視覺訊號走 `render` 校驗和。

### Phase 1｜抽出 `world.spec.json`（機械式，不手抄）

1. 瀏覽器載入現況頁 → `evaluate_script` 執行 `JSON.stringify(DATA)` → 寫入 `src/world/world.spec.json`。
2. 原 `DATA` 常數改成 `import spec from "../world/world.spec.json"`，其餘 22 處引用（`DATA.islands` 8、`DATA.bridgesMeta` 6、`DATA.seed` 5、`DATA.flows` 4、`DATA.dayCycle` 2、`city`/`cityEn` 各 1）不動，只換來源。
3. 跑 `validate-spec.mjs` 守住：q/r 不重疊、`landmark.model` 必須在 archetypes 清單內、`bridge` 兩端 island 存在。

**驗證**：`compile` 指紋與 Phase 0 逐項相等。**注意 `worldPos` 等執行期寫入欄位不要進 JSON**（`isl.worldPos = center.clone()` 在 6822 行，屬產物不是規格）。

**Phase 1 實測結果（2026-10-30 完成）**

- 沒有走 `JSON.stringify(DATA)`：執行期的 DATA 已被引擎寫入 7 個衍生欄位（`worldPos`／`topY`／`islandId`／`islandCode`／`islandName`／`islandNameEn`／`indexInIsland`，加上 `bridgesMeta` 的 `midWorldPos`／`curve`），改由 `extract-data.mjs` 用 `vm` 在空 sandbox 裡求值原始字面量，衍生欄位列入黑名單直接擋。
- `file://` 下 ES module import 會被 CORS 擋，所以走 classic `<script src>` 掛 `globalThis.__NI_WORLD__`，README 的「雙擊就能開」保住了（實測 `file://` 載入 canvas 正常）。
- 主檔 11,596 → 8,721 行；`world.spec.json` 151,602 bytes、`world.spec.generated.js` 122,386 bytes。
- 指紋：kit 3,559 件、per-kind 哈希、地形 25,921 頂點、路網 253 條、文案哈希 `712a4d7c` 全部與 Phase 0 逐項相等。

### Phase 2｜抽出 `archetypes.json`／`trees.json`（這一步才讓 AI 能蓋新建築）

1. 用探針把 `getArchetypeParts(kind, theme)` 對 38 種 model × 各分區 theme 全數展開，序列化成表。
   該函式內含條件分支與 `PALETTE` 引用，**手抄一定錯**，所以一律走執行期 dump。
2. `getArchetypeParts` 改為查表：`archetypes[kind].parts(theme)`，保留 `default` 底板基座邏輯。
3. 同步把市民沙盤 `buildSandboxBuilding()`（9036–9099 行那條 10 分支 if/else）改成吃同一份零件表，`server/src/sandbox.js` 的 `BUILDING_CATALOG` 加 `archetype` 欄位對應（現況兩邊靠 type 字串默契，是脆弱點）。

**驗證**：抽成查表後 `placeArchetypeModel()` 輸出 tuple 序列逐筆相等（比對整個 `kitEntries` 的矩陣哈希）。

**Phase 2 實測結果（2026-10-30 完成）**

- 探針以兩個哨兵主題色跑兩遍，差分出 6 個吃分區主題的零件槽，寫成 `$theme` 記號；查表時再代回 `themeHex`。
- 落地三份檔：`archetypes.json`（52,768 B，含 kit 原語參考資料）、`trees.json`（10,344 B）、runtime `archetypes.generated.js`（28,950 B，只帶 `meta`／`models`／`trees`，不帶 kitGeometries 免白載）。
- `getArchetypeParts`／`getIslandTreeParts` 的 316 行 if/else 換成 16 行查表；主檔 8,721 → 8,439 行。
- 指紋紅燈掃過一次真 bug：runtime bundle 一度把 `meta` 攤平，導致 `ARCHETYPE_LIB.meta.themeToken` 在模組頂層拋 `TypeError` 且因早於 `window.onerror` 註冊而不進 error-box；以 `<head>` 暫存錯誤監聽器的副本抓到行號。修法是維持 `{meta, models, trees}` 巢狀結構，並把 `defaultTree` 補進 runtime `meta`。
- 負載測試：把 `archetypes.generated.js` 改名後載入，頁面出現「零件表載入失敗：請確認 src/world/archetypes.generated.js…」（雙擊開啟沒有 console，所以錯誤必須上畫面）。
- **量化到的造型欠債**：38 種 model 只有 20 種有專屬零件，105 筆引用裡 34 筆（18 種，`busdepot`×8、`park`×5 最嚴重）退回 `globe` 佔位；10 種樹只有 6 家，`banyan/camphor/flame/maple/pine` 共用同一種造型。`validate-spec.mjs` 現在會把這件事印成欠債清單（不是紅燈，補 JSON 即轉正）。
- 沙盤 `buildSandboxBuilding()` 的 10 分支尚未吃同一份表 —— 它不在島嶼指紋範圍內，改到 Phase 3 一併處理，驗法用 `macaoBridge.sandboxInfo()`。

### Phase 3｜拆 engine／app 模組

順序：`rng.js` → `coords.js` → `materials.js`（貼圖＋shader）→ `kit.js` → `compile.js` → `graph.js` → `walkers.js` → `render.js` → `app/*`。
每移一支就跑一次指紋。把 `buildArchipelagoAndKit`（1,239 行）裡混在一起的「編譯」與「加入 scene」剝開：前者進 `compile.js`，後者留 `render.js`。`initPolicyIslandApp`（3,010 行）按 HUD／沙盤／市民／詳情卡／日迴圈切 5 檔，`macaoBridge` 收攏進 `app/bridge.js` 並補一份 TS 型別宣告當文件契約。

**Phase 3 實測結果（engine 部分完成；app 部分見待辦）**

- 落地 16 個模組：`engine/`（`rng`／`coords`／`palette`／`textures`／`daynight`／`kit`／`i18n`／`storage`／`halt`／`world-data`）＋ `engine/world/`（`grid`／`archipelago`／`distant`／`walkers`）＋ `app/labels.js`。`src/` 共 724 KB。
- 打包器自己寫（`scripts/build.mjs`，零相依）：topo 排序拼接整棵模組圖、剝 `export`／本地 `import`、裸模組去重合併，並主動擋循環 import、頂層撞名、跳出 `src/` 的 import。產物 `3d_macao_3d_civic_island.html` 8,539 行（原始碼 `src/main.js` 3,103 行 ＋ `src/index.html` 2,704 行）。
- ESM 實名綁定踩到一次：`import` 進來的 `let` 不能被匯入方重新賦值，`currentLang` 改成 `export const langState = { current }`；這是整個遷移唯一「非零差異」的程式碼改寫。
- 四道指紋閘門（Phase 2／3a／3b／3c／4a）全部 exit 0：kit 3,559 件逐件矩陣＋色值、地形 25,921 頂點、路網 253 條、文案哈希不變。
- 三種載入方式都實測過：dev（`http://127.0.0.1:8765/src/index.html` 直接跑 ESM）、產物（http）、`file://` 雙擊 —— canvas 1 個、kitEntries 3,559、error-box 空。
- **app 層還沒拆**：`initPolicyIslandApp` 仍是 3,103 行同一個閉包（HUD／沙盤／市民／詳情卡／日迴圈共享 `scene`／`camera`／`state`）。拆它要把整個閉包狀態提升成顯式物件，否則只是把三萬行的隱式耦合換成五個隱式耦合；驗證也不能只看島嶼指紋，得用 `macaoBridge` 的方法逐一探測。列為 Phase 3d，與沙盤零件表（原 Phase 2 第 3 點）一起做。

### Phase 4｜build 與部署（有兩個坑，先講）

1. **檔名不能改**。`​.github/workflows/deploy.yml` 在 `git reset --hard` 後對 `3d_macao_3d_civic_island.html` 做 `sed s|social.js?v=dev|...|`，且 `git clean -fd` 會砍掉未追蹤檔。所以：`dist` 產物要 commit、檔名維持、workflow 的 sed 目標維持同一支檔案。
2. **快取參數要覆蓋模組圖**。原本只 bust 了 `social.js`／`social.css`，拆成 ESM 後每個 import 都要帶 `?v=REV`，否則使用者卡在舊模組片段。build 步驟統一注入版本字串。
3. 匯出獨立檔（10932–10945 行現用 `document.documentElement.outerHTML`，本質無法包含 module）改成：下載 build 產生的 `dist/standalone.html`（CSS/JS/spec 全 inline，零外部請求），保住 README 那條「零建置、可離線」賣點。
4. `server/data/seed.json` 由 `world.spec.json` 產生（`npm run gen:seed`），消滅 23 分區／82 地標的雙份真相；`migrate.js --seed` 不必改。

**Phase 4 實測結果（2026-10-30 完成）**

- **seed 單一真相**：`scripts/gen-seed.mjs` 依 `migrate.js` 的 INSERT 欄位順序輸出，跑一次後 `git diff server/data/seed.json` 是空的（byte-identical，連尾換行都不加），證明它只是把規格換個形狀、沒有偷偷改文案。`npm run gen:seed` 寫檔、`--check` 進 `npm run check` 鏈。
- **快取參數（坑 2）**：build 對 4 個外部引用統一戳 `?v=dev` —— `social.css`、`social.js`、`world.spec.generated.js`、`archetypes.generated.js`；少戳規格那兩支，改了世界也看不到。`deploy.yml` 的 sed 擴大成 `s|?v=dev|?v=$REV|g`，後面補一道 `grep -q "v=dev"` 殘留檢查（sed 落空就紅燈，不會靜默上線）。
- **部署順序（坑 1）**：workflow 新增 `actions/checkout` + `npm run check` 作為前置閘門，跑在 GitHub runner 上（不在正式機）；正式機維持 `git reset --hard` → `git clean -fd` → sed → `npm ci` → seed → restart。實測確認**線上需要的檔案只有 `src/` 是未追蹤的**（`web/social.*` 已追蹤），所以 commit 必須包含 `src/`，否則 `git clean -fd` 會把世界規格砍掉。
- **獨立檔（坑 3）沒有走 `dist/standalone.html`**：`file://` 下 `fetch` 被擋，「雙擊就能開」的賣點就沒了；而且多一份 HTML 產物等於多一個「哪份才是真相」的問題。改成在頁內組裝：clone 當前 DOM → 清空 `#webgl-container`／`#css2d-container`（renderer 掛上去的 canvas 內容不會被序列化，下載後是一片 0×0 空殼；CSS2D 標籤是疊加節點，重開會多一層幽靈標籤）→ 把外部規格標籤換成 inline `globalThis.__NI_WORLD__`／`__NI_ARCHETYPES__`，並剝掉 8 個執行期衍生欄位。
- 匯出檔實測 505,947 bytes；用 iframe `srcdoc` 載入後 canvas 1 個（896×596）、23 分區／82 地標、`#webgl-container ... #css2d-container > *` 只有 renderer 自己那層、error-box 空。另把「build 產物 + inline 資料」的等價版本丟到 `file://` 開，world 掛上、canvas 存在、無報錯（`?v=dev` 與 `./web/social.js` 在本地就是 404，社交層降級為免登入，與拆引擎前的行為一致）。
- 唯一不能 inline 的是 Three.js 本身（importmap 指 CDN）。所以文案只能寫「單一 HTML、資料全 inline」，不能寫「零外部請求」。
- **驗證時抓到兩個真問題**：
  1. 規格裡混著兩個簡體字（「科大站**与**東亞運」、「二**维码**」），已改成「與」「二維碼」；改完重跑指紋，`copyHash` 由 `712a4d7c` → `46042be2`，其餘（kit 3,559／地形／路網／instanced）逐項不變 —— 證明這道閘門精確到「只紅文案」。
  2. `python3 -m http.server` 沒有 `Cache-Control`，瀏覽器用啟發式快取把舊的 `world.spec.generated.js?v=dev` 餵回來，第一次比對因此顯示「指紋沒變」。本機指紋一律改用帶 `no-store` 的小伺服器（`/tmp/serve-nostore.mjs`）跑；這也順帶證明 `?v=dev` 在真實部署必須換成 commit hash。
- `extract-data.mjs` 補上「由 `world.spec.json` 產生 `generated.js`」的路徑（拆檔後 HTML 裡已無 literal，原本只能比對不能重生）。

### Phase 5｜可選收尾

CSS 2,105 行拆 `styles/`；i18n 的 `data-en` 抽 `locales/en.json`；README「技術架構／專案結構」章節同步更新（文件裡的數字要重新量過再寫）。

---

## 4. 回歸驗證法（WebGL 不能用 headless 截圖當真相）

1. **結構指紋（主）**：對 `kitEntries` 逐筆取 `matrix.toArray().map(round4)` + `kind` + `baseColor.getHex()`，排序後求哈希；同時記 per-island／per-kind 計數。遷移前後必須完全相同。
2. **功能性探針（次）**：用 `evaluate_script` 讀 `errbox`、HUD 狀態、`macaoBridge` 各方法存在、市民數、沙盤 12 槽渲染結果 —— 沿用我們既有的驗證習慣，不依賴 SwiftShader 截圖。
3. **像素對拍（旁證）**：只在本地真實 Chrome（Metal）跑 4 個固定視角，`pixelmatch` 差異 < 0.2%。先殺殘留 process，幀數設上限。
4. **互動冒煙**：選島、選地標、橋、輕軌跟車、煙花、日夜跨 24 小時（把時鐘壓縮跑一輪）、手機 800px 抽屜。

---

## 5. 風險清單

| 風險 | 處置 |
| --- | --- |
| `DATA` 內有執行期寫入欄位（`worldPos`）被一起序列化，導致髒資料進 JSON | dump 前 `JSON.stringify` 自訂 replacer 剔除，或只取 `islands.map(pickFields)` |
| `getArchetypeParts` 的條件分支（`ruins`、theme 預設值）查表化後遺失 | 一律執行期展開，保留一組 golden 測試詞（38 種 model 全跑） |
| 部署 sed／git clean 依賴單一檔名與 `?v=dev` 字串 | Phase 4 先改 workflow，再改產物；上線前手動跑一次部署乾跑 |
| 模組拆分後 `import` 順序改變，造成全域初始化時序差異 | 保持 `initPolicyIslandApp()` 為唯一入口，模組只做宣告不做副作用 |
| 單檔變多檔，客戶演示環境離線開啟失敗 | `dist/standalone.html` inline 產物為交付物，並列為演示預設 |
| 工時膨脹（一次性大重構） | 每個 Phase 獨立可上線、可回滾；指紋紅燈絕不進下一個 Phase |

---

## 6. 抽完之後接得上什麼

- **B（描述生成世界）**：LLM 只需產 `world.spec.json` + 新 `archetypes` 條目；`validate-spec.mjs` 就是「依照規則施工」的守門員。
- **C（多城市複製）**：寫一支 `open-data → world.spec` 轉譯器（GeoJSON 分區 + POI + 統計），沿用 `lat/lng → q,r` 既有映射。
- **D（教育任務層）**：在 spec 加 `quests[]`：`{at, trigger, requires, reward, quiz}`，綁座標而非綁地標 id。
- 現況的 38 種 model 被 23 個 `mainModel` ＋ 82 個地標重複引用（最斜的 `lrtstation` 出現 11 次、`busdepot` 8 次、`pavilion` 6 次），拆完後要補的是 **archetype 的參數化變體**（主體＋屋頂＋立面＋招牌四槽隨機），而不是繼續手寫第 39 種。

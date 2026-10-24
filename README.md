# 澳門政策與城市數據島 · Macao 3D Civic Island

一個以 **Three.js + WebGL 2.0** 打造的單檔 3D 互動微縮城市模型，將澳門特別行政區的 23 個地理分區、82 個地標、跨海大橋、輕軌與政策協作關係，整合成可旋轉、可點擊、可模擬的城市數據沙盤。

> 打開一個 HTML 檔，即可瀏覽整個澳門半島、氹仔、路氹、路環與橫琴澳大校區，並即時查看官方統計基準、城市流動與互動體驗。

**線上示範**：<https://city.nexuslinktech.com/>（舊址：<http://43.156.106.40/macao/>）

---

## 開發規則（每次修改前必讀）

1. **動手前先讀本 README**：先看下方「系統結構」與「升級日誌」，確認現有功能、已隱藏項目與最近改動，避免重複或回退既有設計。
2. **改完必更新 README**：每次功能新增、修正或介面調整，都要在「升級日誌」補一筆（版本、日期、改動內容、影響檔案），並同步更新相關章節描述。
3. **部署方式固定**：`git push origin main` 後由 GitHub Actions 自動同步到騰訊雲；前端資源以 commit sha 作版本參數（`social.js?v=<sha>`），Nginx 對 HTML/JS/CSS 設 no-cache。
4. **驗證要求**：每次改動後以瀏覽器實測主要互動（載入無 Console error、關鍵 UI 可見/隱藏正確、3D 市民與建設正常），再向使用者回報。

---

## 專案用途

| 場景 | 說明 |
| --- | --- |
| 政策與城市規劃展示 | 以立體方式呈現分區定位、公共建設、施政指標與跨區協作關係 |
| 公民教育與科普 | 讓居民與學生直觀理解澳門地理、口岸、交通與公共設施 |
| 數據可視化演示 | 串接 DATA.GOV.MO / DSEC / SMG / DSOP 的官方數據基準 |
| 教學與匯報 | 單檔可直接投影、嵌入簡報或作為課堂互動教材 |
| 3D Web 技術示範 | 展示程序化建模、實例化渲染、LOD、CSS2D 標籤與互動拾取 |

---

## 核心特點

- **單一 HTML 檔、零建置**：完整程式、樣式與資料都在一個檔案內，無需 npm、後端或 API Key。
- **真實地理拼圖**：依真實經緯度將澳門細分為 23 個區塊，北至南依序為半島、新城 A 區、港珠澳口岸人工島、氹仔、路氹與橫琴澳大、路環。
- **程序化 3D 城市**：建築、地標、樹木、橋樑與水面皆由程式即時生成，不依賴外部模型檔或貼圖。
- **政策數據驅動**：每個分區與地標都附有官方統計、工程進度、職責部門與規劃年份。
- **跨海連結可視化**：四條跨海大橋、A 區橋群、港珠澳聯絡道與蓮花大橋一對一精準連接（橋樑標籤目前預設隱藏）。
- **澳門輕軌真實路網**：氹仔線（媽閣—氹仔碼頭）、橫琴線（蓮花—橫琴）、石排灣線（蓮花—石排灣）三線列車同時往返行駛。
- **真實市民取代 NPC**：地圖上只保留已註冊市民的 3D 公仔，原有的搬運／通勤 NPC 全部隱藏，強化社區感。
- **多重互動體驗**：旅遊塔煙花、輕軌跟車第一視角、大三巴光雕、內港潮位防洪閘門。
- **按澳門時間自動日夜**：依 Asia/Macau 實際時間驅動天空、水色、燈光與窗戶發光，不再需要手動切換清晨／白天／黃昏。
- **繁體中文／英文雙語**：一鍵切換，介面與資料同步翻譯。
- **桌機與手機自適應**：手機採底部抽屜式面板，支援拖曳、觸控與安全區域。
- **效能友善**：LOD 遠近細節、標籤防重疊、可暫停動畫、支援減少動態效果（FPS 徽章暫時隱藏）。
- **無障礙設計**：ARIA 標籤、鍵盤焦點樣式、`prefers-reduced-motion` 支援。
- **可離線保存**：一鍵匯出獨立 HTML，並以 localStorage 記憶語言、視角與顯示設定。


---

## 功能總覽

### 1. 3D 城市與地理

- 23 個依真實位置排列的六角形地理區塊，含海岸線、山體、綠地與水體。
- 程序化生成的城市街區、公共房屋、口岸大樓、體育場、機場、碼頭、醫院、學校、廟宇與旅遊塔等地標模型。
- 四條跨海大橋（西灣、嘉樂庇總督、友誼、澳門大橋）具備拱形、斜拉與雙層結構差異。
- 新城 A 區橋群、港珠澳口岸聯絡道、蓮花大橋與輕軌橫琴線。
- 澳門輕軌列車依真實路網行駛：氹仔線（媽閣—氹仔碼頭）、橫琴線（蓮花—橫琴）、石排灣線（蓮花—石排灣），可切換第一視角跟車。
- 真實地理方格可對照經緯網格與分區位置（目前預設關閉、按鈕暫時隱藏）。
- 外圍環境包含海面、島嶼、山脈與天空，形成微縮沙盤氛圍。


### 2. 數據瀏覽與導覽

- **右側政策目錄**：政策主題／協作關係雙分頁。
- **全文搜尋**：可搜尋堂區、地標、輕軌、施政指標與統計數據。
- **分區詳情卡**：概述、人口與面積、地標清單、相關橋樑與協作流。
- **地標詳情卡**：3D 模型縮圖、職責部門、規劃年份、三條重點數據。
- **橋樑詳情卡**：長度、車道、啟用年份、連接分區與工程特色。
- **流線詳情卡**：起訖分區、證據等級、承載內容與涉及部門。
- **證據等級標示**：官方落實（實線）／規劃建設中（虛線）／研究深化（點線）。
- **城市日誌**：即時記錄人流、物流與跨區事件，可依流線篩選。

### 3. 互動體驗

**目前暫時隱藏**（功能仍在、按鈕先收起）：四條跨海環覽、真實地理方格、內港潮位滑桿、協作線、地標名牌、暫停、FPS、獨立檔、說明、時間預設。

| 功能 | 操作與效果 |
| --- | --- |
|  旅遊塔煙花 | 在澳門旅遊塔上空施放 3D 粒子煙花 |
| 🚝 輕軌跟車 | 以第一視角跟隨輕軌列車跨海行駛 |
| ✨ 大三巴光雕 | 點亮大三巴牌坊夜間光雕投影 |
| � 地區名 | 顯示／隱藏 23 個分區名稱（預設隱藏） |
| 🦅 鳥瞰 | 切換全局鳥瞰視角 |
| ⏸ 暫停 | 凍結城市動畫以便講解（按鈕暫時隱藏） |
| 📋 日誌 | 開啟城市事件日誌面板 |


### 4. 時間與環境

- **時間依澳門時間（Asia/Macau）自動設定**，每幀同步真實時鐘，天空、水色、燈光與窗光連續變化。
- 原本的清晨／白天／黃昏／夜晚預設按鈕已暫時隱藏。
- 不同時段的城市活動與流線會同步變化。
- **節慶煙花**：節慶日（元旦、勞動節、國慶日、澳門回歸紀念日、聖誕節）載入時自動在旅遊塔上空施放煙花。
- 風暴潮潮位模擬與防洪閘門視覺反應仍保留於程式內，滑桿暫時隱藏。


### 5. 官方數據中心

點擊**左上角品牌卡（澳門特別行政區 · 數據.GOV.MO）**即可開啟監測面板，內容包括：


- 總人口 **68.7 萬**、總面積 **33.3 km²**。
- 開放數據集 **1,377** 個、開放 API **463** 個、參與部門 **44** 個、一戶通用戶 **62 萬+**。
- 各分區人口、面積、人口密度與主要設施表格。
- 氣溫、AQI、濕度與潮位的即時狀態（依目前時間與潮位滑桿模擬）。
- 直接連結 [data.gov.mo](https://data.gov.mo/)、[DSEC](https://www.dsec.gov.mo/)、[SMG](https://www.smg.gov.mo/)、[DSOP](https://www.dsop.gov.mo/)。

### 6. 介面與輔助

- **頂部工具列（由左至右）**：市民、全景、清單、EN。市民入口與視角控制同排，不再浮在畫面中間。
- **右側資訊欄預設收起**：按「清單」才展開，避免遮擋 3D 地圖。
- 官方數據入口整合至左上角品牌卡。
- 市民中心分頁：市民檔案、探索圖鑑、建設沙盤、好友社團、私訊、每日任務、提案牆、城市活動、排行榜。
- 管理員在市民檔案可看到「🛠 管理後台」入口，前往 `/admin.html`。
- 底部 HUD 按功能分為三組：**城市體驗**（煙花、輕軌跟車、光雕）、**顯示與視角**（時鐘、地區名、鳥瞰、日誌）、**關於**（關於本站）。
- 手機（≤800px）底部為精簡功能列（時間＋「☰ 功能」），點擊彈出分組選單，按鈕兩欄排列、不可左右拖動。
- 繁中／英文即時切換。
- 「關於本站」整合於 HUD「關於」分組：點擊展開頁尾卡片（製作團隊、聯絡我哋與意見反映表單），不另佔畫面浮動空間。
- 首次進入的三步操作引導。
- 桌面與手機自適應版面；清單／詳情卡開啟時底部功能列自動收起。
- 減少動態效果偏好支援與完整鍵盤焦點樣式。


---

## 會員系統與社區（城市模擬 MVP）

在原有 3D 沙盤上疊加一層「市民中心」，把瀏覽數據變成可經營、可比較、可討論的城市遊戲。

### 市民檔案

- Google 帳戶登入，選擇暱稱與「居住分區」，建立個人市民卡。
- 等級與稱號：城市觀察員 → 規劃見習生 → 社區設計師 → 澳門城市大使 → 澳門共創夥伴。
- 城市幣與 XP：探索、投票、提案、模擬互動皆可獲得；連續登入另有連擊獎勵。
- 個人統計：地標收集數、提案數、投票數、連續登入天數、探索進度條。

### 探索圖鑑

- 收錄全部 82 個地標徽章，按 23 個分區分組展示。
- 在 3D 場景點擊地標會自動登錄圖鑑（每個地標只計一次）。
- 圖鑑可直接點擊飛往對應地標，形成「收集 → 導覽 → 再探索」循環。

### 分區建設沙盤

- 每位市民在自己的居住分區擁有 **12 格建設用地**，可在 3D 城市之外經營屬於自己的小街區。
- 10 種設施分五級解鎖：社區公園、智慧巴士站、屋頂花園 → 單車徑、文創市集、太陽能遮陽棚 → 社區衛生站、公共房屋 → 社區圖書館 → 海濱步道。
- 建設消耗城市幣並永久增加分區活力；拆除可退回 40% 費用。
- **分區活力值** ＝ 建設活力 ＋ 鄰里點讚 × 2 ＋ 該區地標探索數，用於「分區活力榜」，讓個人選擇與全區表現連動。
- 可參觀其他市民的沙盤並點讚，形成互訪循環；每日任務新增「完成 1 次分區建設」。
- 新市民加入時發放 200 城市幣，足夠完成首批建設。
- **3D 場景可視化**：建設會以立體模型即時出現在自己所屬分區，4×3 格排列於半透明平台上；10 種設施各有獨立造型（樹木公園、橙色市集帳篷、高層公屋、太陽能板等）。可在 3D 場景直接點擊建設開啟對應格子，或按「在 3D 場景查看／參觀」一鍵飛往該分區。

### 好友與社團

- **好友**：以暱稱搜尋市民、送出邀請、接受／拒絕、移除；好友沙盤可直接「參觀」並跳轉 3D 場景。
- **社團**：Lv.2 以上可成立（名稱唯一、10 種圖示、簡介），每人同時只能加入一個社團；成員可自由加入或離開，離開後社團自動轉移會長或解散。
- **共同目標**：社團成員本週所有 XP（探索、任務、建設）自動累積，目標為 `max(400, 120 × 成員數)`，進度條即時顯示。
- **達標獎勵**：任一成員可領取，全員獲得 **+80 城市幣、+40 XP**，每週只能領取一次。
- 社團列表依總建設活力排序，詳情頁顯示成員本週貢獻排行。

### 市民 3D 可視化與遊戲化效果

- 已註冊且選好分區的市民，會以 3D 小人出現在自己所屬分區中心，繞圈走動（約 2.4 倍放大，便於辨識）。
- **名牌 LOD**：相機拉遠時只顯示一顆 9px 在線／離線小圓點（不遮擋地圖與公仔）；拉近（<11 世界單位）或滑鼠移到點上才展開「暱稱 · Lv · 建設數」。
- 點頭像圓點：已登入直接打開該市民的建設沙盤；未登入打開市民中心登入卡。
- 市民會隨機冒出互動氣泡（💬 ❤️ 🏗 ✨ 👍），增加街區人氣。
- **分區活力光柱**：活力前三名分區有金／銀／銅 3D 光柱，冠軍頭頂顯示「👑 活力冠軍 · N」徽章並浮動。
- **建設慶祝**：完成建設時，同分區市民歡呼跳躍並冒出 🎉，配合金色粒子與白色擴散環。

### 鄰里互動與城市聲望

- **打招呼**：在好友列或市民沙盤頁按「👋 打招呼」，打招呼者 +4 城市幣／+5 XP，對方 +2 城市幣；每人每日最多 5 次，同一位鄰居每日只計一次。
- **好友巡訪**：打開好友沙盤即自動記錄巡訪，只計算好友（非好友不計獎勵），每日每座沙盤一次。
- **城市聲望** ＝ 鄰里點讚 × 2 ＋ 收到的打招呼 ＋ 建設數 × 3；顯示於市民檔案、市民沙盤頁、排行榜與 3D 市民資料。
- **節慶事件**：依澳門日期自動判定（元旦、勞動節、國慶日、澳門回歸紀念日、聖誕節），當日載入即在旅遊塔上空施放煙花並顯示節慶提示。

### 每日任務

- 每天依日期輪換 3 項任務，例如探索 3 個地標、參與 2 次投票、模擬潮位防洪、搭乘輕軌、點亮光雕、提交提案、完成分區建設、向 3 位鄰居打招呼、巡訪 3 位好友沙盤。
- 任務進度由真實互動事件即時計算，達標自動發放 XP 與城市幣，每日 00:00（澳門時間）重置。

### 提案牆與投票

- 六類提案：交通改善、防災與氣候、公共空間、文旅活動、社區設施、環境與綠化。
- 可按分區、類別、最多支持／最新排序瀏覽；每人每日最多提交 3 篇。
- 一鍵支持提案，支持數即時更新，並計入每日任務。

### 排行榜與共創目標

- 四種榜單：本週 XP、探索王（累計收集）、城市幣、城市聲望。
- 全城共創目標：本週探索地標累計進度，達標後解鎖限定效果（後續階段）。

### 個人資料與 3D 公仔

- 「市民檔案」頁可編輯 **暱稱、性別、頭像 Emoji、居住分區、自我介紹**，點「🎨 打開公仔建構器」進入完整造型編輯。
- **公仔建構器**（模仿 SimCity 的角色建構）分六大分頁，可任意組合：
  1. **臉部**：臉型（鵝蛋／圓／方／心形／長）、眼睛（杏眼／圓眼／銳利／慵懶／大眼）、眉毛（自然／濃／細／上揚）、鼻子（小巧／挺直／寬／迷你）、嘴巴（微笑／平嘴／露齒／嘟嘴）、鬍子（無／落腮鬍／八字鬍／山羊鬍）。
  2. **髮型**：短髮、兩側削短、寸頭、捲髮、長髮、馬尾、丸子頭、莫西干。
  3. **身型**：纖瘦／標準／健碩／豐滿，配合矮／中等／高。
  4. **服裝**：上衣（T恤／襯衫／連帽衛衣／夾克／西裝／連身裙／背心）、下身（牛仔褲／短褲／裙子／長褲／緊身褲）、鞋子（波鞋／靴子／皮鞋／涼鞋）、外套（不穿／大衣／背心外套／圍裙）。
  5. **配件**：眼鏡（無／圓框／方框／太陽眼鏡）、帽子（不戴／棒球帽／毛帽／漁夫帽／頭盔）、配件（無／背包／頸巾／胸章／耳機）。
  6. **顏色**：膚色、髮色、上衣、下身、鞋子、外套、帽子、配件共 8 組調色盤，另可用取色器自訂。
- 左側 2D SVG 即時預覽，右側選項以晶片呈現；支援「🎲 隨機造型」與「↩ 重設」。
- 儲存後寫入 `users.avatar_config`，並同步 `figure_color`／`figure_style` 舊欄位；3D 地圖上的公仔立即以同一組設定重建。
- 居住分區可隨時更改，公仔會搬到新分區中心。

### 私訊（PM）

- 每位已建檔市民可與其他市民一對一私訊，訊息上限 500 字。
- 入口：好友名單的「私訊」按鈕、他人沙盤頁的「私訊」按鈕，或「私訊」分頁的對話列表。
- 對話列表顯示最後一則訊息、未讀數與時間；開啟對話後自動標記已讀。
- 被封禁的市民無法收發私訊。

### 城市活動

- 由管理員在後台建立，分為六大類：社區共融、文化藝術、體育康樂、環保綠化、智慧城市、節慶慶典。
- 每場活動包含：名稱、類別、分區、地點、起訖時間、名額（可留空為不限）、獎勵城市幣與 XP、活動說明、狀態（草稿／已發佈／已取消／已結束）。
- 市民可在「城市活動」分頁按類別瀏覽、報名、取消報名；活動名額依 `activity_signups` 即時統計，額滿即截止。
- **現場簽到**：活動開始前 30 分鐘至結束期間可簽到，簽到即發放該活動設定的城市幣與 XP，並計入每日任務「參加 1 個城市活動」（每場活動每人只獎勵一次）。
- 管理員可查看每場活動的報名與簽到名單。

### 管理後台

- 網址：`/admin.html`；預設管理員為 **paul.ccp@gmail.com**（可用環境變數 `ADMIN_EMAIL` 覆寫）。
- 三個模組：
  1. **概覽**：註冊／已建檔／今日活躍／封禁人數、探索、提案、私訊、打招呼、建設、活動與報名統計。
  2. **市民管理**：搜尋市民、查看等級／幣／XP／聲望／分區、調整城市幣與 XP、設為管理員或降回市民、封禁／解封（封禁會強制登出並取消未簽到報名）。
  3. **活動管理**：建立／編輯／刪除活動、切換狀態、查看報名與簽到名單。
- 非管理員開啟頁面會顯示權限不足；未登入則引導以 Google 登入並自動回到後台。

### 技術實作

| 層級 | 內容 |
| --- | --- |
| 前端 | `web/social.css`、`web/social.js`，以 overlay 掛載，不影響原 3D 場景 |
| 後端 | `server/`（Node 22 + Express），提供 `/api/*` |
| 資料庫 | PostgreSQL 18，`macao_city` 資料庫 |
| 認證 | Google OAuth 2.0 + HttpOnly Session Cookie（30 天） |
| 安全 | 同源 Origin 檢查、速率限制、參數化 SQL、伺服器端輸入驗證 |
| 部署 | systemd `macao-city.service` + Nginx 反向代理 `/api/` |

### API 一覽

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/api/auth/google` | 發起 Google 登入 |
| GET | `/api/auth/google/callback` | OAuth 回調、建立 session |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/me` | 市民檔案、等級、任務與統計 |
| POST | `/api/onboard` | 建立暱稱與居住分區 |
| GET | `/api/districts` | 23 分區與收集進度 |
| GET | `/api/landmarks?district=` | 分區地標清單 |
| POST | `/api/discover` | 登錄地標收藏 |
| POST | `/api/events` | 回報互動事件（煙花、光雕、輕軌、潮位等） |
| GET | `/api/proposals` | 提案列表（分區／類別／排序） |
| POST | `/api/proposals` | 提交提案 |
| POST | `/api/proposals/:id/vote` | 支持／取消支持 |
| GET | `/api/leaderboard?board=` | 排行榜 |
| GET | `/api/sandbox/me` | 我的沙盤、設施目錄與可用城市幣 |
| GET | `/api/sandbox/user/:id` | 參觀指定市民的沙盤 |
| POST | `/api/sandbox/build` | 在指定格建設設施 |
| POST | `/api/sandbox/demolish` | 拆除並退回 40% |
| POST | `/api/sandbox/like/:id` | 為鄰里沙盤點讚／取消 |
| GET | `/api/sandbox/overview` | 鄰里沙盤與分區活力榜 |
| GET | `/api/users/search?q=` | 以暱稱搜尋市民 |
| GET | `/api/friends` | 好友、待處理邀請、已送出邀請 |
| POST | `/api/friends/request` | 邀請（對方已邀請則自動成為好友） |
| POST | `/api/friends/respond` | 接受或拒絕邀請 |
| POST | `/api/friends/remove` | 移除好友 |
| GET | `/api/guilds` | 社團列表與我的社團 |
| GET | `/api/guilds/:id` | 社團詳情、成員貢獻與達標狀態 |
| POST | `/api/guilds` | 成立社團 |
| POST | `/api/guilds/:id/join` | 加入社團 |
| POST | `/api/guilds/leave` | 離開社團（會長自動轉讓） |
| POST | `/api/guilds/:id/claim` | 達標後領取全員獎勵 |
| GET | `/api/city` | 全城統計與共創目標 |
| GET | `/api/citizens` | 3D 場景用市民清單（暱稱、等級、分區、建設數、聲望、在線狀態） |
| POST | `/api/greet/:userId` | 向鄰居打招呼（每日 5 次，對方獲得城市幣） |
| POST | `/api/sandbox/visit/:userId` | 記錄沙盤巡訪（好友才計入每日任務） |
| GET | `/api/festival` | 依澳門日期回傳今日節慶（無則為 null） |
| POST | `/api/profile` | 更新暱稱、性別、頭像、公仔設定、分區、自我介紹 |
| POST | `/api/avatar` | 儲存公仔建構器設定（16 個部位選項＋8 組顏色，白名單驗證） |
| GET | `/api/messages` | 私訊會話列表（含未讀數） |
| GET | `/api/messages/:userId` | 與指定市民的對話（讀取即標記已讀） |
| POST | `/api/messages/:userId` | 發送私訊（上限 500 字） |
| GET | `/api/activities` | 已發佈活動列表（可依類別篩選） |
| GET | `/api/activities/:id` | 活動詳情（管理員另含報名名單） |
| POST | `/api/activities/:id/signup` | 報名活動（名額上限檢查） |
| POST | `/api/activities/:id/cancel` | 取消報名 |
| POST | `/api/activities/:id/checkin` | 現場簽到並發放獎勵 |
| GET | `/api/admin/stats` | 管理員：全站統計 |
| GET | `/api/admin/users?q=` | 管理員：市民清單與搜尋 |
| POST | `/api/admin/users/:id/ban` | 管理員：封禁／解封 |
| POST | `/api/admin/users/:id/role` | 管理員：設定管理員或降回市民 |
| POST | `/api/admin/users/:id/grant` | 管理員：調整城市幣與 XP |
| GET | `/api/admin/activities` | 管理員：活動清單（含草稿） |
| POST | `/api/admin/activities` | 管理員：建立活動 |
| POST | `/api/admin/activities/:id` | 管理員：更新活動 |
| POST | `/api/admin/activities/:id/status` | 管理員：變更活動狀態 |
| DELETE | `/api/admin/activities/:id` | 管理員：刪除活動 |

---

## 資料庫結構

資料庫：**PostgreSQL 18 · `macao_city`**。所有建表語句位於 [schema.sql](file:///Users/paulchang/Library/Mobile%20Documents/com~apple~CloudDocs/PDF/NexusTech/project/NexusIsland_MO/server/src/schema.sql)，部署時由 `npm run migrate` 執行；語句皆為 idempotent（`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / `CREATE UNIQUE INDEX IF NOT EXISTS`），可重複執行。

### 地理與地標

| 資料表 | 主鍵 | 主要欄位 | 說明 |
| --- | --- | --- | --- |
| `districts` | `id` TEXT | `code, name, name_en, parish, macro_region, landmass, icon, color, population, area_km2, summary, lat, lng` | 23 個分區的靜態資料 |
| `landmarks` | `id` TEXT | `district_id → districts.id, name, description, facts JSONB, model, schedule, sort_order` | 82 個地標；`facts` 存重點數據陣列 |

### 會員與認證

| 資料表 | 主鍵 | 主要欄位 | 說明 |
| --- | --- | --- | --- |
| `users` | `id` BIGSERIAL | `google_sub UNIQUE, email, name, avatar_url, nickname, district_id → districts.id, level, xp, coins, streak_days, last_active_on, onboarded, gender, bio, avatar_emoji, figure_color, figure_style, avatar_config JSONB, role, banned, banned_reason, created_at` | 市民主檔；`role` 為 `citizen`／`admin`；`avatar_config` 存公仔建構器完整設定（見下） |
| `sessions` | `token_hash` TEXT | `user_id → users.id, created_at, expires_at` | HttpOnly Cookie Session（30 天），封禁時刪除 |

#### `users.avatar_config`（公仔建構器）

`JSONB NOT NULL DEFAULT '{}'`，由 `POST /api/avatar` 寫入；伺服器逐鍵以白名單驗證，非法值回退預設，顏色必須為 `#RRGGBB`。

| 分類 | 欄位 | 可選值 |
| --- | --- | --- |
| 臉部 | `face` / `eyes` / `brow` / `nose` / `mouth` / `facialHair` | oval·round·square·heart·long／almond·round·sharp·sleepy·wide／natural·thick·thin·raised／button·straight·wide·small／smile·neutral·grin·pout／none·beard·mustache·goatee |
| 髮型 | `hair` | short·fade·buzz·curly·long·ponytail·bun·mohawk |
| 身型 | `body` / `height` | slim·average·athletic·heavy／short·normal·tall |
| 服裝 | `top` / `bottom` / `shoes` / `outer` | tee·shirt·hoodie·jacket·blazer·dress·tank／jeans·shorts·skirt·trousers·leggings／sneakers·boots·dress·sandals／none·coat·vest·apron |
| 配件 | `glasses` / `hat` / `accessory` | none·round·square·sun／none·cap·beanie·bucket·helmet／none·backpack·scarf·badge·headphones |
| 顏色 | `skin` / `hairColor` / `topColor` / `bottomColor` / `shoesColor` / `outerColor` / `hatColor` / `accessoryColor` | 任意 `#RRGGBB` |

舊欄位 `figure_color`／`figure_style` 由 `topColor` 與服裝自動推導，供既有查詢與未使用建構器的舊資料相容；若 `avatar_config` 為空，`publicUser` / `/api/citizens` 會依 `gender`、`figure_color`、`figure_style` 產生預設設定。


### 探索、任務與互動紀錄

| 資料表 | 主鍵 | 主要欄位 | 說明 |
| --- | --- | --- | --- |
| `discoveries` | `(user_id, landmark_id)` | `discovered_at` | 地標收藏（每人每地標一次） |
| `events` | `id` BIGSERIAL | `user_id, type, ref_id, xp, coins, created_at` | 所有獎勵事件；兼作每日任務計數與在線判定（30 分鐘內有事件視為在線） |
| `task_completions` | `(user_id, task_key, day)` | `xp, coins, created_at` | 每日任務去重與發獎紀錄 |

### 提案與投票

| 資料表 | 主鍵 | 主要欄位 | 說明 |
| --- | --- | --- | --- |
| `proposals` | `id` BIGSERIAL | `user_id, district_id, category, title, body, status, created_at` | 城市提案 |
| `proposal_votes` | `(proposal_id, user_id)` | `created_at` | 支持紀錄 |

### 建設沙盤與鄰里

| 資料表 | 主鍵 | 主要欄位 | 說明 |
| --- | --- | --- | --- |
| `user_buildings` | `id` BIGSERIAL，`UNIQUE(user_id, slot)` | `district_id, slot 0–11, building_type, vitality, created_at` | 每人 12 格建設；`vitality` 計入分區活力 |
| `sandbox_likes` | `(owner_id, liker_id)` | `created_at` | 鄰里點讚；`liker_id` 為按讚者 |
| `greets` | `id`，`UNIQUE(from_user_id, to_user_id, day)` | `day, created_at` | 打招呼；同時計入城市聲望 |
| `sandbox_visits` | `id`，`UNIQUE(visitor_id, host_id, day)` | `day, created_at` | 沙盤巡訪；好友巡訪計入任務 |

### 好友與社團

| 資料表 | 主鍵 | 主要欄位 | 說明 |
| --- | --- | --- | --- |
| `friendships` | `id` BIGSERIAL，`UNIQUE(requester_id, addressee_id)` | `status pending／accepted, created_at, responded_at` | 約束 `requester_id < addressee_id`，一對好友只有一列 |
| `guilds` | `id` BIGSERIAL | `name UNIQUE, icon, description, owner_id, created_at` | 社團 |
| `guild_members` | `(guild_id, user_id)`，`UNIQUE(user_id)` | `role owner／member, joined_at` | 每人僅可加入一個社團 |
| `guild_claims` | `(guild_id, week_start)` | `claimed_by, claimed_at` | 每週共同目標獎勵領取紀錄 |

### 私訊與城市活動

| 資料表 | 主鍵 | 主要欄位 | 說明 |
| --- | --- | --- | --- |
| `messages` | `id` BIGSERIAL | `from_user_id, to_user_id, body, read_at, created_at` | 一對一私訊；`CHECK(from_user_id <> to_user_id)`，讀取時寫入 `read_at` |
| `activities` | `id` BIGSERIAL | `title, category, description, district_id, location, start_at, end_at, capacity, reward_coins, reward_xp, status, created_by, created_at` | 活動主檔；`status` 為 `draft／published／cancelled／finished` |
| `activity_signups` | `(activity_id, user_id)` | `status going／cancelled, checked_in_at, created_at` | 報名與簽到；簽到即發獎並寫入 `events(type='activity')` |

### 關聯摘要

```
districts 1 ─ n landmarks
districts 1 ─ n users / proposals / user_buildings / activities
users 1 ─ n discoveries / events / task_completions / user_buildings / messages / activity_signups
users 1 ─ n proposals / sandbox_likes（owner、liker）/ greets（from、to）
users n ─ n users  friendships（requester / addressee）
guilds 1 ─ n guild_members、guild_claims
activities 1 ─ n activity_signups
```

### 常用查詢

```sql
-- 分區活力（建設活力 + 點讚×2 + 該區地標探索數）
SELECT d.id, d.name,
       COALESCE(SUM(b.vitality), 0)
     + (SELECT count(*) * 2 FROM sandbox_likes sl
          JOIN users u ON u.id = sl.owner_id
         WHERE u.district_id = d.id)
     + (SELECT count(*) FROM discoveries ds
          JOIN landmarks l ON l.id = ds.landmark_id
         WHERE l.district_id = d.id) AS vitality
  FROM districts d
  LEFT JOIN user_buildings b ON b.district_id = d.id
 GROUP BY d.id, d.name
 ORDER BY vitality DESC;

-- 未讀私訊數
SELECT count(*) FROM messages WHERE to_user_id = $1 AND read_at IS NULL;

-- 活動報名與簽到數
SELECT a.id, a.title,
       count(*) FILTER (WHERE s.status = 'going') AS going,
       count(*) FILTER (WHERE s.checked_in_at IS NOT NULL) AS checked
  FROM activities a LEFT JOIN activity_signups s ON s.activity_id = a.id
 GROUP BY a.id, a.title;
```

---

### 啟用 Google 登入

需在 Google Cloud Console 的 OAuth 用戶端（與 NexusSpin 共用）加入已授權的重新導向 URI：

```
https://city.nexuslinktech.com/api/auth/google/callback
```

加入後重新整理頁面即可登入。

---

## 升級日誌

> 每次修改／升級後在此補一筆，格式：`日期 · 版本 · 內容 · 影響檔案`。

### 2026-10-24 · v16 · 銷售工具包與 Landing Page
- 新增 `saleskit.md`：完整功能盤點、八項客戶痛點與對應解法、差異化比較、八個可落地商業場景（政府／旅遊／學校／商場／品牌／展館／媒體／ESG）、四級方案與參考報價、15 分鐘 Demo 腳本、異議處理、金句與社交貼文格式。
- 新增 `sales.html`：行銷用 Landing Page，含 Hero（3D 全景 + 浮動數據卡）、數據條、痛點卡片、五個功能模組（配實機截圖）、場景截圖區、遊戲循環、商業場景、方案卡、Demo 流程、FAQ、最終 CTA；桌面與手機（≤800px 單欄 + 固定底部 CTA）皆自適應，含進場動畫並支援 `prefers-reduced-motion`。
- 新增 `assets/sales/` 十一張行銷截圖（全部由線上版本實機截取）：全島全景、夜間橋樑、橋樑詳情卡（直向）、官方數據面板（直向）、詳情卡合成圖、煙花、輕軌視角、市民中心、官方數據合成圖、手機 HUD、手機彈出選單。
- 影響檔案：`saleskit.md`、`sales.html`、`assets/sales/*`、`README.md`。

### 2026-10-24 · v15 · HUD 重構：關於本站整合、暫停隱藏、手機彈出式分組選單
- 「關於本站」由右下角浮動藥丸移入底部 HUD「關於」分組，點擊即展開頁尾卡片（`aria-expanded` 同步）；卡片內容與意見表流程不變。
- 底部 HUD 新增「城市體驗／顯示與視角／關於」三個功能分組（`.hud-group`）；桌面以 `display: contents` 併回單一合併列，視覺與原本一致。
- 暫停按鈕（`#tog-pause`）加 `ui-hidden` 隱藏，保留既有事件綁定，日後可隨時恢復。
- 手機（≤800px）底部 HUD 改為彈出式面板：常駐精簡功能列（澳門時間＋「☰ 功能」），點擊後由底部彈出分組選單，按鈕以兩欄網格排列、禁止左右拖動（`overflow-x: hidden`）、可縱向捲動；點選任何功能、✕、遮罩或 Esc 均會自動收起。
- 清單／詳情卡開啟時同步收起功能列與選單；「關於本站」卡片在手機貼近底部，層級高於選單。
- 影響檔案：`3d_macao_3d_civic_island.html`、`README.md`。

### 2026-10-24 · v14 · 底部浮動頁尾與意見反映卡片
- 3D 主頁右下角新增浮動頁尾（HUD 上方），收起時為「關於本站」小藥丸，展開為頁尾卡片：製作團隊（Paul Chang → mailto:paul@ebeesnet.com，藍色粗體、不顯示電郵）、聯絡我哋（描述＋打開意見表按鈕）、置中版權「© 2026 NexusLink Tech · 澳門城市島 v1.0」。
- 新增意見反映 modal：深色遮罩、白色圓角卡片（max-width 480px、內容過高可捲動）、右上 ✕；支援點遮罩、Esc 關閉、Tab 焦點鎖定、關閉後焦點還原。
- 送出流程：按鈕禁用並顯示「傳送緊…」→ `fetch` POST JSON 至 `https://n8n.nexuslinktech.com/webhook/ebees_app_website_contact`；成功顯示「多謝你嘅意見！」、清空表單並 1.4 秒後自動收起；失敗顯示「傳送失敗，請稍後再試。」並恢復按鈕。
- Payload 欄位：`event`（feedback）、`app_name`、`name`／`userId`（電郵）、`content`（自動前置「【澳門城市島】」）、`timestamp`（ISO）。
- 手機版（≤720px）頁尾改為單欄、按鈕全寬，modal 貼底顯示且不超出視窗。
- 影響檔案：`3d_macao_3d_civic_island.html`（頁尾樣式、標記與原生 JS）、`README.md`；另保留 `web/footer-feedback.html` 作為獨立示範頁。

### 2026-10-24 · v13 · 公仔建構器（SimCity 式角色組合）
- 新增 `users.avatar_config JSONB`：16 個部位選項（臉型／眼／眉／鼻／嘴／鬍／髮型／身型／身高／上衣／下身／鞋／外套／眼鏡／帽／配件）＋ 8 組顏色，全部白名單驗證。
- 新增 `POST /api/avatar`；`/api/profile` 改為同時接受 `avatar` 並同步 `figure_color`／`figure_style`；`/api/me`、`/api/citizens` 回傳完整 `avatar`（舊資料自動推導預設值）。
- 「市民檔案」新增「🎨 打開公仔建構器」：左側 2D SVG 即時預覽，右側六大分頁晶片選項，支援隨機、重設、Escape 關閉、儲存後即時同步 3D。
- 3D `buildCitizenFigure` 重寫：逐項組合臉部五官、8 種髮型（前方留臉部開口避免遮擋）、4 種身型／3 種身高、7 種上衣＋5 種下身＋4 種鞋＋4 種外套、3 類配件（含眼鏡、帽、背包／頸巾／胸章／耳機）；材質與幾何全域快取，每位市民零件再按材質合併（約 40 件 → 約 12 次 draw call），避免 60 位市民造成記憶體與效能負擔。
- README 補 `avatar_config` 欄位規格、API 一覽與本升級日誌。
- 影響檔案：`server/src/schema.sql`、`server/src/index.js`、`3d_macao_3d_civic_island.html`、`web/social.js`、`web/social.css`、`README.md`。

### 2026-10-24 · v12 · 管理後台、個人化公仔、私訊與城市活動
- README 新增完整「資料庫結構」章節：20 張資料表的主鍵、欄位、關聯與常用查詢。
- 新增管理後台 `/admin.html`：概覽統計、市民管理（搜尋／封禁／權限／調整幣與 XP）、活動管理（建立／編輯／刪除／狀態／報名名單）；預設管理員 `paul.ccp@gmail.com`（可用 `ADMIN_EMAIL` 覆寫）。
- 新增 `POST /api/profile`：可自訂暱稱、性別、頭像 Emoji、公仔顏色與造型、居住分區、自我介紹；3D 公仔依性別／顏色／造型即時變化。
- 新增私訊系統：`messages` 表、會話列表（未讀數）、對話讀取自動已讀、好友列與沙盤頁可直接私訊。
- 新增城市活動系統：`activities`、`activity_signups` 表、六類活動、報名／取消／現場簽到發獎，並計入每日任務「參加 1 個城市活動」。
- 登入流程支援 `next` 參數（`/api/auth/google?next=/admin.html`），登入後回到指定頁面。
- 封禁市民會強制登出、取消未簽到報名，並從 3D 市民清單與私訊中排除。
- 影響檔案：`server/src/schema.sql`、`server/src/index.js`、`server/src/tasks.js`、`server/src/messages.js`、`server/src/activities.js`、`web/social.js`、`web/social.css`、`3d_macao_3d_civic_island.html`、`admin.html`、`README.md`。

### 2026-10-24 · v11 · 鄰里互動、城市聲望與節慶事件
- 新增「👋 打招呼」：好友列與市民沙盤頁可直接打招呼，每日 5 次上限，同一位鄰居每日一次；打招呼者 +4 幣／+5 XP，對方 +2 幣。
- 新增好友沙盤巡訪記錄：打開好友沙盤自動記錄，僅好友計入任務獎勵。
- 新增「城市聲望」＝ 點讚 × 2 ＋ 收到打招呼 ＋ 建設數 × 3，顯示於市民檔案、沙盤頁、排行榜與 3D 市民資料；排行榜新增「聲望」榜。
- 每日任務新增「向 3 位鄰居打招呼」「巡訪 3 位好友沙盤」。
- 新增節慶事件：依澳門日期判定元旦、勞動節、國慶日、回歸紀念日、聖誕節，當日載入自動施放旅遊塔煙花並顯示提示。
- 新增 `greets`、`sandbox_visits` 資料表；新增 `POST /api/greet/:userId`、`POST /api/sandbox/visit/:userId`、`GET /api/festival`。
- 影響檔案：`server/src/schema.sql`、`server/src/tasks.js`、`server/src/index.js`、`web/social.js`、`3d_macao_3d_civic_island.html`。

### 2026-10-24 · v10 · 名牌 LOD 與點擊體驗
- 市民名牌改為距離 LOD：遠景只留 9px 在線／離線圓點，拉近或 hover 才展開完整名牌，解決遮擋地圖與公仔問題。
- 精簡態放大小圓點點擊熱區（約 25px），方便手機操作。
- 未登入點擊市民改為打開市民中心登入卡（原本只閃一下，像沒反應）。
- 影響檔案：`3d_macao_3d_civic_island.html`、`web/social.js`。

### 2026-10-24 · v9 · 輕軌路網修正
- 移除錯誤的環線（誤經關閘、友誼大橋、橫琴、石排灣串成一圈）。
- 依真實路網分三線：氹仔線（媽閣—氹仔碼頭）、橫琴線（蓮花—橫琴）、石排灣線（蓮花—石排灣），各自往返行駛。
- 列車模型抽為 `buildLrtTrain()`，供三線共用。
- 影響檔案：`3d_macao_3d_civic_island.html`。

### 2026-10-24 · v8 · 介面精簡與真實市民
- 右側資訊欄預設收起；「市民」入口移入頂部工具列（市民／全景／清單／EN）。
- 官方數據入口整合到左上角品牌卡；獨立檔、說明、FPS、時間預設按鈕暫時隱藏。
- 分區名稱預設隱藏，底部新增「🏷 地區名」開關。
- 時間改為依澳門時間自動設定，移除手動時段切換。
- 隱藏全部 NPC（搬運／通勤小人與氣泡），只保留已註冊市民。
- 底部兩組 HUD 合併為單列；四條跨海、真實地理方格（含座標）、內港潮位、協作線、名牌按鈕一併隱藏。
- 影響檔案：`3d_macao_3d_civic_island.html`、`web/social.js`、`web/social.css`、`server/src/index.js`。

### 2026-10-24 · v7 · 市民 3D 與遊戲化效果
- 市民 3D 小人（含等級顏色、光環）、名牌、隨機互動氣泡。
- 分區活力光柱（前三名）與活力冠軍徽章；建設完成慶祝粒子與同區市民歡呼。
- 新增 `GET /api/citizens`，前端定時刷新世界狀態。
- 影響檔案：`3d_macao_3d_civic_island.html`、`web/social.js`、`server/src/index.js`。

### 2026-10-23 · v6 · 好友與社團
- 好友搜尋／邀請／接受／移除、好友沙盤一鍵參觀。
- 社團成立／加入／離開、每週共同目標與達標全員獎勵。
- 影響檔案：`server/src/community.js`、`server/src/schema.sql`、`web/social.js`、`web/social.css`。

### 2026-10-23 · v5 · 分區建設沙盤 3D 化
- 建設成果以立體模型渲染於所屬分區，支援點擊模型開啟詳情、參觀他人沙盤。
- 修正模型過小（放大 1.9 倍、格距加大）。
- 影響檔案：`3d_macao_3d_civic_island.html`、`web/social.js`。

### 2026-10-23 · v4 · 分區建設沙盤
- 12 格建設用地、10 種設施五級解鎖、扣費／拆除退 40%、分區活力値與排行榜。
- 影響檔案：`server/src/sandbox.js`、`server/src/index.js`、`web/social.js`。

### 2026-10-23 · v3 · 會員與社交系統上線
- Google OAuth、市民檔案、82 地標圖鑑、每日任務、城市幣／等級、提案牆、投票、排行榜。
- PostgreSQL 建庫、Nginx `/api/` 反向代理、systemd 服務、GitHub Actions 自動部署。
- 影響檔案：`server/`、`web/`、`.github/workflows/deploy.yml`。

### 2026-10-23 · v2 · 專案文檔與 GitHub
- 建立 README、公開倉庫與 `main` 分支。

### 2026-10-23 · v1 · 3D 城市島
- 單檔 Three.js 城市沙盤：23 分區、82 地標、7 橋樑、12 流線、日夜系統、官方數據面板、雙語與互動體驗。

---

## 資料覆蓋

| 類別 | 數量 | 說明 |
| --- | --- | --- |
| 地理分區 | 23 | 半島 11、新城 A 區與口岸人工島 2、氹仔 4、路氹與橫琴澳大 3、路環 3 |
| 地標與設施 | 82 | 口岸、公屋、世遺、學校、醫院、場館、公園、交通樞紐等 |
| 橋樑與通道 | 7 | 含四條跨海大橋、A 區橋群、港珠澳聯絡道、蓮花大橋 |
| 協作流線 | 12 | 跨區政策與服務協作關係，附證據等級 |
| 時段情境 | 6 | 清晨、上午、午間、午後、黃昏、夜間 |
| 官方數據來源 | 4 | DATA.GOV.MO、DSEC、SMG、DSOP |
| 開放數據集 | 1,377 | 官方統計基準 |
| 開放 API | 463 | 官方統計基準 |

### 23 個分區

**澳門半島（11）**
青洲山與青茂口岸、關閘與台山、黑沙環與祐漢、筷子基與林茂塘、高士德與紅街市、東望洋與外港、大三巴與內港北、議事亭前地與塔石、新口岸與科學館、媽閣與旅遊塔、南灣湖與主教山。

**新城 A 區與口岸（2）**
新城 A 區北（東區-2 公屋與學校村）、港珠澳大橋澳門口岸人工島。

**氹仔（4）**
海洋花園與西灣橋口、氹仔中心與奧體、氹仔舊城與龍環葡韻、北安碼頭與機場。

**路氹與橫琴（3）**
橫琴粵澳深度合作區（澳大校區與橫琴口岸）、路氹城西（金光大道）、路氹城東。

**路環（3）**
石排灣公屋與離島醫療綜合體（北京協和醫院）、路環市區漁村與荔枝碗船廠片區、黑沙海灘與九澳聖母村。

---

## 操作指南

### 滑鼠

- **左鍵拖曳**：旋轉視角
- **右鍵拖曳**：平移
- **滾輪**：縮放
- **點擊**：選取分區、地標、橋樑、輕軌、流線或搬運小人
- **點擊空白處**：取消選取

### 觸控

- **單指拖曳**：旋轉
- **雙指縮放**：縮放
- **雙指拖曳**：平移
- **點擊**：選取物件
- 手機底部面板可上下拖曳展開／收合

### 介面按鈕

- 左上品牌卡：點擊開啟官方數據中心。
- 頂部工具列：市民（市民中心）、全景、清單（右側資訊欄）、語言切換。
- 底部單列 HUD：旅遊塔煙花、輕軌跟車、大三巴光雕、時鐘、地區名、暫停、鳥瞰、日誌。
- 暫時隱藏：四條跨海、地理方格、潮位滑桿、協作線、名牌、獨立檔、說明、FPS、時間預設。


---

## 技術架構

```
3d_macao_3d_civic_island.html
├── HTML 結構
│   ├── WebGL 畫布容器
│   ├── CSS2D 標籤層
│   ├── 右側政策目錄與詳情卡
│   ├── 底部 HUD 與互動體驗列
│   ├── 官方數據中心彈窗
│   └── 操作說明彈窗
├── CSS
│   ├── 設計變數與主題色
│   ├── 桌機／手機自適應版面
│   ├── 底部抽屜與動畫
│   └── 無障礙焦點樣式
└── JavaScript（ES Module）
    ├── DATA：23 分區、82 地標、7 橋樑、12 流線、6 時段
    ├── 程序化建模：建築原型、樹木、地形、水面、天空、貼圖
    ├── 場景組裝：地理方格、橋樑、輕軌、互動地標
    ├── 流線系統：路徑尋路、搬運小人、證據材質、城市日誌
    ├── 互動系統：Raycast 拾取、相機飛行、詳情卡渲染
    ├── 日夜系統：燈光、天空、水色、窗光
    ├── 官方數據面板與即時狀態
    └── UI 綁定、雙語翻譯、匯出 HTML、動畫迴圈
```

### 主要依賴

| 套件 | 版本 | 用途 |
| --- | --- | --- |
| [Three.js](https://threejs.org/) | 0.160.0 | WebGL 3D 渲染 |
| OrbitControls | r160 | 相機旋轉、平移、縮放 |
| CSS2DRenderer | r160 | 3D 空間中的 HTML 標籤 |
| RoundedBoxGeometry | r160 | 圓角建築量體 |
| BufferGeometryUtils | r160 | 幾何合併與效能優化 |
| SimplexNoise | r160 | 程序化地形與自然紋理 |

依賴透過 CDN（jsDelivr）與 import map 載入，**首次開啟需連網**。

---

## 快速開始

### 方式一：直接開啟

在檔案總管雙擊 `3d_macao_3d_civic_island.html`，以 Chrome、Edge、Safari 或 Firefox 開啟即可。

### 方式二：本機伺服器（建議）

```bash
# 於專案目錄執行
python3 -m http.server 8080
```

然後瀏覽 `http://localhost:8080/3d_macao_3d_civic_island.html`。

> 建議使用支援 WebGL 2.0 的現代瀏覽器；若公司網路封鎖 CDN，請改用可連線的網路環境。

### 匯出獨立檔案

點擊左上角「💾 獨立檔」，瀏覽器會下載 `macao_policy_island_3d.html`。此檔案可在新分頁獨立開啟，避免外層網頁工具列或瀏覽器外掛造成的 Console 雜訊。

---

## 瀏覽器支援

| 瀏覽器 | 建議版本 |
| --- | --- |
| Chrome / Edge | 最新版 |
| Safari | 16.4 以上 |
| Firefox | 最新版 |

需支援 WebGL 2.0、ES Modules 與 Import Maps。手機建議使用 iOS Safari 16.4+ 或 Android Chrome。

---

## 專案結構

```
NexusIsland_MO/
├── README.md                      # 本說明文件
├── 3d_macao_3d_civic_island.html  # 單檔 3D 互動城市應用
├── admin.html                     # 管理後台（概覽／市民／活動）
├── sales.html                     # 行銷 Landing Page
├── saleskit.md                    # 銷售工具包（痛點／場景／方案／話術）
├── assets/sales/                  # 行銷截圖（9 張，線上實機截取）
├── web/
│   ├── social.css                 # 市民中心 overlay 樣式
│   └── social.js                  # 市民中心互動邏輯
├── server/
│   ├── package.json
│   ├── data/seed.json             # 23 分區 + 82 地標種子資料
│   └── src/
│       ├── index.js               # API、Google OAuth、管理員端點
│       ├── sandbox.js             # 建設目錄與分區活力計算
│       ├── community.js           # 好友與社團 API
│       ├── messages.js            # 私訊 API
│       ├── activities.js          # 城市活動與活動管理 API
│       ├── tasks.js               # 等級、任務、事件獎勵
│       ├── db.js
│       ├── migrate.js             # 建表與種子匯入
│       └── schema.sql
└── .github/workflows/deploy.yml   # 自動部署
```

---

## 行銷與銷售素材

- **Landing Page**：`/sales.html`（線上：<https://city.nexuslinktech.com/sales.html>），含實機截圖、痛點解法、商業場景、方案與 FAQ。
- **Sales Kit**：`saleskit.md`，內含功能盤點、八個可落地場景、報價區間、15 分鐘 Demo 腳本、異議處理與貼文格式。
- **截圖素材**：`assets/sales/`（9 張，全部由線上版本實機截取，可直接用於提案與社交貼文）。

---

## 數據來源與聲明

- 城市統計基準參考澳門特別行政區政府開放數據平台與相關部門公開資料：
  - [DATA.GOV.MO 開放數據平台](https://data.gov.mo/)
  - [DSEC 統計暨普查局](https://www.dsec.gov.mo/)
  - [SMG 地球物理氣象局](https://www.smg.gov.mo/)
  - [DSOP 公共建設局](https://www.dsop.gov.mo/)
- 面板中的氣溫、AQI、濕度與潮位為依目前時間與潮位滑桿產生的**模擬狀態**，用於互動演示，並非即時 API 資料。
- 本專案為獨立開發的展示與教學作品，**不代表澳門特別行政區政府官方立場**，亦非政府官方產品。
- 城市模型為程序化藝術化呈現，幾何形狀與位置為示意，不用於工程測量或導航。

---

## 部署與自動更新

- **線上網址**：<https://city.nexuslinktech.com/>（舊址：<http://43.156.106.40/macao/>）
- **伺服器**：騰訊雲 Ubuntu 24.04 + Nginx，網站根目錄 `/var/www/macao-3d-civic-island`
- **自動部署**：推送至 `main` 分支後，GitHub Actions 會透過 SSH 同步程式碼、安裝依賴、執行資料庫遷移並重啟 API，無需手動登入伺服器。
- **Workflow**：`.github/workflows/deploy.yml`
- **手動觸發**：在 GitHub Actions 頁面選擇 `Deploy to Tencent Cloud` → `Run workflow`。
- **後端服務**：systemd `macao-city.service`（`127.0.0.1:3100`），環境變數置於 `/etc/macao-city.env`。
- **資料庫**：PostgreSQL `macao_city`，首次部署由 `npm run seed` 自動建表與匯入分區／地標。

---

## 授權

本專案未附帶開源授權檔案。如需轉載、重用或商業使用，請先聯絡專案作者取得同意。

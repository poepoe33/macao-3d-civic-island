// 引擎層：從 src/main.js 拆出的純函式模組（打包後仍在同一作用域，見 scripts/build.mjs）。
// 外部資料載入失敗時要在頁面上講清楚：雙擊開啟沒有 console。
// 外部資料表載入失敗時要在頁面上講清楚（雙擊開啟時沒有 console 可看）
export function haltMissingExternalData(what, file) {
  const box = document.createElement("div");
  box.setAttribute("style", "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:28px;background:#211d1d;color:#fff8f4;font:600 16px/1.7 system-ui;z-index:9999;text-align:center");
  box.textContent = `${what}載入失敗：請確認 ${file} 與本檔案放在一起，或改用本地伺服器（npm run serve）。`;
  document.body.appendChild(box);
  throw new Error(`${what}未載入`);
}

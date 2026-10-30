// 通用工具模組（由 src/main.js 拆出）；打包後與 main 同一作用域，見 scripts/build.mjs。
// 語系與 URL 參數：?lang=en 決定 tr() 輸出，切換由 UI 寫 langState.current。
export const urlParams = new URLSearchParams(window.location.search);
export const langState = { current: urlParams.get("lang") === "en" ? "en" : "zh" };

export function tr(zh, en) {
  return langState.current === "en" ? (en || zh) : zh;
}


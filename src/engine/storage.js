// 通用工具模組（由 src/main.js 拆出）；打包後與 main 同一作用域，見 scripts/build.mjs。
// localStorage 在 iframe／沙箱裡可能直接拋錯，統一包一層。

export function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

export function safeStorageSet(key, val) {
  try {
    window.localStorage.setItem(key, val);
  } catch (e) {
    // ignore sandbox storage error
  }
}

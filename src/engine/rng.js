// 引擎層：從 src/main.js 拆出的純函式模組（打包後仍在同一作用域，見 scripts/build.mjs）。
// =========================================================================
// 固定種子 PRNG (mulberry32) 與雙語工具
// =========================================================================
export function mulberry32(a) {
  const fn = function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  fn.random = fn;
  return fn;
}

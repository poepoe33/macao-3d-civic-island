// 引擎層：從 src/main.js 拆出的純函式模組（打包後仍在同一作用域，見 scripts/build.mjs）。
// 世界規格與零件表載入點：兩份 JSON 由 <script src> 掛成 globalThis（file:// 下 import 會被 CORS 擋）。
import { haltMissingExternalData } from "./halt.js";

// 世界規格：src/world/world.spec.json（要改分區／地標請改 JSON，再跑 node scripts/extract-data.mjs）
// 保持「雙擊就能開」：file:// 下 import 外部模組會被 CORS 擋掉，
// 所以由下方 <script src> 傳統指令碼把規格掛到 globalThis.__NI_WORLD__。

export const DATA = globalThis.__NI_WORLD__;
if (!DATA || !Array.isArray(DATA.islands) || DATA.islands.length === 0) {
  haltMissingExternalData("世界規格", "src/world/world.spec.generated.js");
}

// 建物與樹種零件表：src/world/archetypes.json + trees.json（改樣式改 JSON，再跑 node scripts/gen-archetypes.mjs）
export const ARCHETYPE_LIB = globalThis.__NI_ARCHETYPES__;
if (!ARCHETYPE_LIB || !ARCHETYPE_LIB.meta || !ARCHETYPE_LIB.models || !ARCHETYPE_LIB.trees) {
  haltMissingExternalData("零件表", "src/world/archetypes.generated.js");
}

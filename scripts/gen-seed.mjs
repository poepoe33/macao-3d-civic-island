#!/usr/bin/env node
// 單一真相：server/data/seed.json 由 src/world/world.spec.json 產生。
// node scripts/gen-seed.mjs            → 寫入 server/data/seed.json
// node scripts/gen-seed.mjs --check    → 只比對，不一致就紅燈退出（給 npm run check 用）
// 欄位對應取自 server/src/migrate.js 的 seed() INSERT 清單，順序也照它，
// 這樣 diff 只會在真的改了文案時出現，不會被 key 順序噪音淹掉。
import fs from "node:fs";

const SPEC = "src/world/world.spec.json";
const OUT = "server/data/seed.json";
const check = process.argv.includes("--check");

const spec = JSON.parse(fs.readFileSync(SPEC, "utf8"));

const districts = spec.islands.map((isl) => ({
  id: isl.id,
  code: isl.code,
  name: isl.name,
  name_en: isl.nameEn,
  parish: isl.parish,
  macro_region: isl.macroRegion,
  macro_region_en: isl.macroRegionEn,
  landmass: isl.landmass,
  icon: isl.icon,
  color: isl.color,
  population: isl.population,
  area_km2: isl.areaKm2,
  summary: isl.summary,
  summary_en: isl.summaryEn,
  lat: isl.lat,
  lng: isl.lng
}));

const landmarks = [];
for (const isl of spec.islands) {
  (isl.items || []).forEach((it, i) => {
    landmarks.push({
      id: it.id,
      district_id: isl.id,
      name: it.name,
      name_en: it.nameEn,
      description: it.desc,
      description_en: it.descEn,
      facts: it.facts,
      facts_en: it.factsEn,
      model: it.model,
      schedule: it.schedule,
      sort_order: i + 1
    });
  });
}

const json = JSON.stringify({ districts, landmarks }, null, 2);

if (check) {
  let prev = "";
  try {
    prev = fs.readFileSync(OUT, "utf8");
  } catch {
    console.error(`❌ 找不到 ${OUT}`);
    process.exit(1);
  }
  if (prev.replace(/\n+$/, "") === json.replace(/\n+$/, "")) {
    console.log(`✅ seed.json 與 world.spec.json 一致（分區 ${districts.length}／地標 ${landmarks.length}）。`);
    process.exit(0);
  }
  console.error(`❌ ${OUT} 已落後於 ${SPEC}，請跑 npm run gen:seed`);
  process.exit(1);
}

// 不加尾換行：與現況 committed 檔 byte-identical，`git diff` 證明「同一份真相」而非重排。
fs.writeFileSync(OUT, json);
console.log(`寫入 ${OUT}：分區 ${districts.length}／地標 ${landmarks.length}`);

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await query(schema);
  console.log('[migrate] schema ok');
}

async function seed() {
  const raw = await fs.readFile(path.join(__dirname, '..', 'data', 'seed.json'), 'utf8');
  const { districts, landmarks } = JSON.parse(raw);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const d of districts) {
      await client.query(
        `INSERT INTO districts (id, code, name, name_en, parish, macro_region, macro_region_en,
           landmass, icon, color, population, area_km2, summary, summary_en, lat, lng)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (id) DO UPDATE SET
           code=$2, name=$3, name_en=$4, parish=$5, macro_region=$6, macro_region_en=$7,
           landmass=$8, icon=$9, color=$10, population=$11, area_km2=$12,
           summary=$13, summary_en=$14, lat=$15, lng=$16`,
        [d.id, d.code, d.name, d.name_en, d.parish, d.macro_region, d.macro_region_en,
          d.landmass, d.icon, d.color, d.population, d.area_km2, d.summary, d.summary_en, d.lat, d.lng]
      );
    }
    for (const l of landmarks) {
      await client.query(
        `INSERT INTO landmarks (id, district_id, name, name_en, description, description_en,
           facts, facts_en, model, schedule, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET
           district_id=$2, name=$3, name_en=$4, description=$5, description_en=$6,
           facts=$7, facts_en=$8, model=$9, schedule=$10, sort_order=$11`,
        [l.id, l.district_id, l.name, l.name_en, l.description, l.description_en,
          JSON.stringify(l.facts), JSON.stringify(l.facts_en), l.model, l.schedule, l.sort_order]
      );
    }
    await client.query('COMMIT');
    console.log(`[seed] ${districts.length} districts, ${landmarks.length} landmarks`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

try {
  await migrate();
  if (process.argv.includes('--seed')) await seed();
} finally {
  await pool.end();
}

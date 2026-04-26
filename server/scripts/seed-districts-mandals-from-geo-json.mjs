/**
 * Idempotent seed: districts + mandals from census geo JSON (AP, TS, KA, TN).
 * Run: cd server && npm run seed:geo
 * Also invoked from prisma/seed.mjs so `npm run db:seed` / `db:setup` load full mandal lists.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../src/config/db.js';
import {
  resolveStateGeoJsonPath,
  jsonDistrictToDbName,
  STATES_WITH_GEO_JSON,
} from '../src/config/geoSources.js';

export async function seedGeoMandalsFromJson() {
  for (const state of STATES_WITH_GEO_JSON) {
    const abs = resolveStateGeoJsonPath(state);
    if (!abs) {
      console.warn('[seed:geo] Skip (no file):', state);
      continue;
    }
    const { districts } = JSON.parse(readFileSync(abs, 'utf8'));
    if (!Array.isArray(districts)) continue;
    console.log(`[seed:geo] ${state}: ${districts.length} districts…`);
    for (const d of districts) {
      const name = jsonDistrictToDbName(state, d.district);
      await db.execute(
        `INSERT INTO districts (name, state) VALUES (?, ?) ON CONFLICT (name, state) DO NOTHING`,
        [name, state]
      );
      const [rows] = await db.execute(
        `SELECT id FROM districts WHERE name = ? AND state = ? LIMIT 1`,
        [name, state]
      );
      const row = rows[0];
      if (!row) {
        console.warn('[seed:geo] No district id for', name, state);
        continue;
      }
      const districtId = row.id;
      for (const sd of d.subDistricts || []) {
        await db.execute(
          `INSERT INTO mandals (name, district_id) VALUES (?, ?) ON CONFLICT (name, district_id) DO NOTHING`,
          [sd.subDistrict, districtId]
        );
      }
    }
  }
  console.log('[seed:geo] Districts + mandals from geo JSON finished.');
}

const thisFile = path.resolve(fileURLToPath(import.meta.url));
const invokedDirect = process.argv[1] && path.resolve(process.argv[1]) === thisFile;

if (invokedDirect) {
  const hasDb =
    process.env.DATABASE_URL ||
    (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME != null);
  if (!hasDb) {
    console.error('Set DATABASE_URL or DB_HOST, DB_USER, DB_NAME (and DB_PASS if needed) in server/.env');
    process.exit(1);
  }
  seedGeoMandalsFromJson()
    .then(() => db.end())
    .then(() => console.log('Done.'))
    .catch((e) => {
      console.error(e);
      db.end().finally(() => process.exit(1));
    });
}

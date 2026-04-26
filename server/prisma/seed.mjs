/**
 * Prisma `db seed` entrypoint (see `migrations.seed` in `prisma.config.mjs`).
 * Uses the same `pg` pool as the API (`src/config/db.js`).
 *
 * After the small sample mandal rows (legacy / schema parity), loads every mandal
 * from `server/data/geo/*.json` so dropdowns match census sub-districts (e.g. all Anantapur mandals).
 */
import 'dotenv/config';
import db from '../src/config/db.js';
import { seedGeoMandalsFromJson } from '../scripts/seed-districts-mandals-from-geo-json.mjs';

/** bcryptjs cost 10 for password `admin123` (must match README / schema.sql). */
const ADMIN_PASSWORD_HASH =
  '$2b$10$cIQTIun.iNRJfFCRzRtncOybMZhfai92iFp84D5jxM73fkC6JADYq';

const AP_DISTRICTS = [
  ['Anantapur', 'Andhra Pradesh'],
  ['Chittoor', 'Andhra Pradesh'],
  ['East Godavari', 'Andhra Pradesh'],
  ['Guntur', 'Andhra Pradesh'],
  ['Krishna', 'Andhra Pradesh'],
  ['Kurnool', 'Andhra Pradesh'],
  ['Nellore', 'Andhra Pradesh'],
  ['Prakasam', 'Andhra Pradesh'],
  ['Srikakulam', 'Andhra Pradesh'],
  ['Visakhapatnam', 'Andhra Pradesh'],
  ['Vizianagaram', 'Andhra Pradesh'],
  ['West Godavari', 'Andhra Pradesh'],
  ['YSR Kadapa', 'Andhra Pradesh'],
];

const TS_DISTRICTS = [
  ['Adilabad', 'Telangana'],
  ['Hyderabad', 'Telangana'],
  ['Karimnagar', 'Telangana'],
  ['Khammam', 'Telangana'],
  ['Mahabubnagar', 'Telangana'],
  ['Medak', 'Telangana'],
  ['Nalgonda', 'Telangana'],
  ['Nizamabad', 'Telangana'],
  ['Rangareddy', 'Telangana'],
  ['Warangal', 'Telangana'],
];

/** [mandalName, districtName, state] — mirrors `server/schema.sql`. */
const MANDAL_ROWS = [
  ['Penukonda', 'Anantapur', 'Andhra Pradesh'],
  ['Gooty', 'Anantapur', 'Andhra Pradesh'],
  ['Dharmavaram', 'Anantapur', 'Andhra Pradesh'],
  ['Kalyandurg', 'Anantapur', 'Andhra Pradesh'],
  ['Rapthadu', 'Anantapur', 'Andhra Pradesh'],
  ['Kurnool Rural', 'Kurnool', 'Andhra Pradesh'],
  ['Nandyal', 'Kurnool', 'Andhra Pradesh'],
  ['Adoni', 'Kurnool', 'Andhra Pradesh'],
  ['Pattikonda', 'Kurnool', 'Andhra Pradesh'],
  ['Kodumur', 'Kurnool', 'Andhra Pradesh'],
  ['Chittoor Rural', 'Chittoor', 'Andhra Pradesh'],
  ['Tirupati Urban', 'Chittoor', 'Andhra Pradesh'],
  ['Madanapalle', 'Chittoor', 'Andhra Pradesh'],
  ['Palamaner', 'Chittoor', 'Andhra Pradesh'],
  ['Punganur', 'Chittoor', 'Andhra Pradesh'],
  ['Guntur Rural', 'Guntur', 'Andhra Pradesh'],
  ['Tenali', 'Guntur', 'Andhra Pradesh'],
  ['Mangalagiri', 'Guntur', 'Andhra Pradesh'],
  ['Bapatla', 'Guntur', 'Andhra Pradesh'],
  ['Ponnur', 'Guntur', 'Andhra Pradesh'],
  ['Warangal Urban', 'Warangal', 'Telangana'],
  ['Hanamkonda', 'Warangal', 'Telangana'],
  ['Jangaon', 'Warangal', 'Telangana'],
  ['Narsampet', 'Warangal', 'Telangana'],
  ['Wardhannapet', 'Warangal', 'Telangana'],
];

async function main() {
  const hasDb =
    process.env.DATABASE_URL ||
    (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME != null);
  if (!hasDb) {
    throw new Error('Set DATABASE_URL or DB_HOST, DB_USER, DB_PASS, DB_NAME in server/.env (same as the API).');
  }

  try {
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [
      'anand@sharanya.com',
    ]);
    if (!existing.length) {
      await db.execute(
        `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')`,
        ['Anand', 'anand@sharanya.com', ADMIN_PASSWORD_HASH]
      );
    }
    // Fix drift / bad hashes from older seeds so dev login matches README.
    await db.execute(`UPDATE users SET password_hash = ? WHERE email = ?`, [
      ADMIN_PASSWORD_HASH,
      'anand@sharanya.com',
    ]);

    for (const [name, state] of [...AP_DISTRICTS, ...TS_DISTRICTS]) {
      await db.execute(
        `INSERT INTO districts (name, state) VALUES (?, ?) ON CONFLICT (name, state) DO NOTHING`,
        [name, state]
      );
    }

    for (const [mName, dName, dState] of MANDAL_ROWS) {
      await db.execute(
        `INSERT INTO mandals (name, district_id)
         SELECT ?, d.id FROM districts d WHERE d.name = ? AND d.state = ? LIMIT 1
         ON CONFLICT (name, district_id) DO NOTHING`,
        [mName, dName, dState]
      );
    }

    await seedGeoMandalsFromJson();
  } finally {
    await db.end();
  }
}

main()
  .then(() => {
    console.log('Seed finished.');
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

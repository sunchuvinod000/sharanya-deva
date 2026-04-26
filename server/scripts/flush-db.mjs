/**
 * Clear database data.
 *
 * Default: TRUNCATE requests + farmers (keeps users, districts, mandals).
 * --all: TRUNCATE all tables, re-insert seed admin, then run geo seed for districts/mandals.
 *
 *   cd server && node scripts/flush-db.mjs
 *   cd server && node scripts/flush-db.mjs --all
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';
import db from '../src/config/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = join(__dirname, '..');

const ALL = process.argv.includes('--all');

/** Same hash as server/schema.sql seed (password: admin123) */
const ADMIN_SEED = [
  'Anand',
  'anand@sharanya.com',
  '$2b$10$7grsz/FHeQvvvumTV7qQ8eq3awDHrtJ7CvYsFvm3FxuCH.owZvCr6',
  'admin',
];

async function main() {
  const hasDb =
    process.env.DATABASE_URL ||
    (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME != null);
  if (!hasDb) {
    console.error('Set DATABASE_URL or DB_HOST, DB_USER, DB_PASS, DB_NAME in server/.env');
    process.exit(1);
  }

  try {
    if (ALL) {
      await db.execute(
        'TRUNCATE TABLE requests, farmers, mandals, districts, users RESTART IDENTITY CASCADE'
      );
    } else {
      await db.execute('TRUNCATE TABLE requests, farmers RESTART IDENTITY CASCADE');
    }

    if (ALL) {
      await db.execute(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        ADMIN_SEED
      );
      console.log('Admin user restored: anand@sharanya.com / admin123');
    }
  } finally {
    await db.end();
  }

  if (ALL) {
    console.log('Seeding districts & mandals from geo JSON…');
    const r = spawnSync(process.execPath, ['scripts/seed-districts-mandals-from-geo-json.mjs'], {
      cwd: SERVER_ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }

  console.log(
    ALL ? 'Full flush completed.' : 'Farmers and requests cleared (users & geography unchanged).'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

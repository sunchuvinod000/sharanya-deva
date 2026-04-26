/**
 * Recovery wipe for CockroachDB (incl. Serverless): cannot `DROP SCHEMA public CASCADE` on many clusters.
 * Drops app tables, Prisma's migration history table, then Prisma enums so `npm run db:migrate` can apply cleanly.
 *
 *   cd server && npm run db:reset-crdb-public
 *
 * Then: npm run db:migrate && npm run db:seed
 */
import 'dotenv/config';
import pg from 'pg';
import { buildConnectionString } from '../src/config/db.js';

/** Order: children before parents; enums after tables. */
const statements = [
  'DROP TABLE IF EXISTS "requests" CASCADE',
  'DROP TABLE IF EXISTS "farmers" CASCADE',
  'DROP TABLE IF EXISTS "mandals" CASCADE',
  'DROP TABLE IF EXISTS "districts" CASCADE',
  'DROP TABLE IF EXISTS "users" CASCADE',
  'DROP TABLE IF EXISTS "_prisma_migrations" CASCADE',
  // CockroachDB: DROP TYPE CASCADE is not implemented; drop types after tables are gone.
  'DROP TYPE IF EXISTS "RequestPriority"',
  'DROP TYPE IF EXISTS "RequestStatus"',
  'DROP TYPE IF EXISTS "UserRole"',
];

async function main() {
  const client = new pg.Client({ connectionString: buildConnectionString() });
  await client.connect();
  try {
    for (const q of statements) {
      await client.query(q);
    }
    console.log('Cockroach app objects + _prisma_migrations cleared. Run: npm run db:migrate');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { resolveDbPort } from './src/config/dbEnv.js';

/**
 * Prisma 7: URL lives in prisma.config (not schema).
 * Use `postgresql://` (Cockroach Cloud often uses port 26257 + `sslmode=verify-full`; local Postgres usually 5432).
 * DB SQL port: `DB_PORT` or `db_port` only — never `PORT` (that is the HTTP server).
 */
function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER || 'root';
  const pass = process.env.DB_PASS ?? '';
  const db = process.env.DB_NAME || 'defaultdb';
  const port = resolveDbPort();
  const enc = (s) => encodeURIComponent(s);
  const ssl = process.env.DB_SSL === 'false' ? '' : '?sslmode=require';
  return `postgresql://${enc(user)}:${enc(pass)}@${host}:${port}/${enc(db)}${ssl}`;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: resolveDatabaseUrl(),
  },
  migrations: {
    seed: 'node prisma/seed.mjs',
  },
});

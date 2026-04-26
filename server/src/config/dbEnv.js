/**
 * Database TCP port only.
 * Never read `PORT` here — that is reserved for the HTTP server (Express).
 * Accept `DB_PORT` or `db_port`; default 5432 (typical Postgres); use 26257 for Cockroach Cloud when using DB_* instead of DATABASE_URL.
 */
export function resolveDbPort() {
  const raw = process.env.DB_PORT ?? process.env.db_port;
  if (raw != null && String(raw).trim() !== '' && !Number.isNaN(Number(raw))) {
    return Number(raw);
  }
  return 5432;
}

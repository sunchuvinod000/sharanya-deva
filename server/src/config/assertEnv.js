/**
 * Fail fast on missing required configuration (called before listening).
 * Database: set **`DATABASE_URL`** (e.g. Cockroach Cloud) *or* **`DB_HOST` / `DB_USER` / `DB_NAME`**.
 */
export function assertRequiredEnv() {
  const missing = [];
  if (!process.env.JWT_SECRET?.trim()) missing.push('JWT_SECRET');
  if (!process.env.JWT_REFRESH_SECRET?.trim()) missing.push('JWT_REFRESH_SECRET');
  const hasDbUrl = Boolean(process.env.DATABASE_URL?.trim());
  if (!hasDbUrl) {
    if (!process.env.DB_HOST?.trim()) missing.push('DB_HOST');
    if (!process.env.DB_USER?.trim()) missing.push('DB_USER');
    if (process.env.DB_NAME == null || String(process.env.DB_NAME).trim() === '') {
      missing.push('DB_NAME');
    }
  }
  // DB_PASS may be intentionally empty for local dev
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'Set JWT_* and DATABASE_URL (or DB_HOST, DB_USER, DB_NAME) in the environment.'
    );
  }
}

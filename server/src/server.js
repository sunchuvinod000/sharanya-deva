import 'dotenv/config';
import { assertRequiredEnv } from './config/assertEnv.js';
import app from './app.js';

assertRequiredEnv();

if (process.env.VERCEL && !process.env.CORS_ORIGIN?.trim()) {
  console.warn(
    '[env] CORS_ORIGIN is unset — browser requests from your UI will get 403 (set to the frontend origin, e.g. https://your-app.vercel.app).'
  );
}

/** Local Node listens on `PORT`; Vercel invokes this module as one serverless app (`export default`). */
if (!process.env.VERCEL) {
  /** HTTP API port only (`PORT`). Database port is `DB_PORT` / `db_port` — see `src/config/dbEnv.js`. */
  const port = Number(process.env.PORT) || 5000;
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

export default app;

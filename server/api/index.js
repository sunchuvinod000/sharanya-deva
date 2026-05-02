/**
 * Vercel serverless entry — Express app (see vercel.json rewrites → /api).
 * Local dev uses `src/server.js` instead.
 */
import 'dotenv/config';
import { assertRequiredEnv } from '../src/config/assertEnv.js';
import app from '../src/app.js';

assertRequiredEnv();

export default app;

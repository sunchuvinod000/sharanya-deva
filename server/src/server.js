import 'dotenv/config';
import { assertRequiredEnv } from './config/assertEnv.js';
import app from './app.js';

assertRequiredEnv();

/** HTTP API port only (`PORT`). Database port is `DB_PORT` / `db_port` — see `src/config/dbEnv.js`. */
const port = Number(process.env.PORT) || 5000;

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

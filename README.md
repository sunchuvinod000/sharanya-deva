# Shri Satya Shaneswara — Farmer Borewell Queue

Admin-only web app for managing farmer borewell requests.

## Prerequisites

- Node.js 18+
- [CockroachDB](https://www.cockroachlabs.com/docs/stable/) (cloud or self-hosted; PostgreSQL wire protocol)

## Database

Prisma uses **`provider = "cockroachdb"`** and **`prisma migrate deploy`** (see `npm run db:migrate` / `npm run db:push`). Avoid raw **`prisma db push`** on CockroachDB Cloud: Prisma can try to drop the internal **`crdb_internal_region`** enum and fail ([upstream issue](https://github.com/prisma/prisma/issues/25696)). This repo ships an initial SQL migration under `server/prisma/migrations/`. The Node API uses **`pg`** and `postgresql://` URLs. Set **`DATABASE_URL`** or **`DB_*`** + **`DB_PORT`** — see `server/.env.example`. For **local vanilla Postgres** only, you can temporarily switch the datasource in `prisma/schema.prisma` to `postgresql` with `@default(autoincrement())` on ids.

If you omit `DATABASE_URL`, `prisma.config.mjs` and `src/config/db.js` build one from **`DB_HOST`**, **`DB_USER`**, **`DB_PASS`**, **`DB_NAME`**, optional **`DB_PORT`** (default **`5432`**, typical local Postgres; use **`26257`** for a local Cockroach node if needed), and **`DB_SSL`** (default adds `sslmode=require`; set **`DB_SSL=false`** for local Postgres without TLS). **`PORT`** (no `DB_` prefix) is only the Express HTTP port, not the database.

From the repo:

```bash
cd server
cp .env.example .env
# Edit .env: DATABASE_URL (or DB_*) and JWT_*.
npm install
npm run db:setup
```

- `db:setup` runs **`prisma migrate deploy`** then **`prisma db seed`** (admin user, districts, sample mandals, then **full mandal lists** from `server/data/geo/*.json` for Andhra Pradesh, Telangana, Karnataka, Tamil Nadu).
- If migrations fail after experiments, **`npm run db:reset-crdb-public`** drops app tables, enums, and `_prisma_migrations` (Cockroach cannot always `DROP SCHEMA public` on Serverless), then run **`npm run db:migrate`** again.
- Idempotent geo load only: `cd server && npm run seed:geo`
- `postinstall` runs `prisma generate`.

Clear app data (optional): `npm run flush-db` or `npm run flush-db:all` (see `server/scripts/flush-db.mjs`).

Legacy **`server/schema.sql`** / **`server/migrations/*.sql`** were for older MySQL setups; new environments should rely on Prisma only.

## Server

```bash
cd server
cp .env.example .env
# Edit .env with DATABASE_URL (or DB_*) and JWT_*.
npm install
npm run dev
```

API runs at `http://localhost:5000`.

## Client

```bash
cd client
npm install
npm run dev
```

App runs at `http://localhost:5173` (or `http://127.0.0.1:5173`). Vite proxies `/api` to the API; default target is **`http://127.0.0.1:5000`** (override with **`API_PROXY_TARGET`** or **`VITE_API_PROXY_TARGET`** in `client/.env` if your server uses another host/port).

Production / preview: set **`VITE_API_URL`** to the full API root **including `/api`** (e.g. `https://your-host.onrender.com/api`). If you omit `/api`, the client appends it automatically.

**Seed login:** `anand@sharanya.com` / `admin123`

## Deployment (hosted API + static UI + CockroachDB)

Use the **same Cockroach** cluster you already seeded (or run `npm run db:setup` once against prod from a trusted machine). The API needs a **`postgresql://` / `postgres://` `DATABASE_URL`** (Cockroach’s connection string).

### Backend — Vercel (deploy this project first)

1. **New Vercel project** → import this repo → set **Root Directory** to **`server`**.
2. **Environment variables** (Production; also use Preview if you run preview DB migrations):

   | Name | Notes |
   |------|--------|
   | `DATABASE_URL` | Required at **build** time too (`npm run build` runs migrations). |
   | `JWT_SECRET` | Long random string. |
   | `JWT_REFRESH_SECRET` | Different long random string. |
   | `CORS_ORIGIN` | After the UI is deployed, set to the **exact** frontend origin (e.g. `https://your-app.vercel.app`). You can redeploy the API once the UI URL is known. |
   | `NODE_ENV` | `production` |

3. **Deploy:** Vercel runs **`npm run build`** (`prisma generate` + **`prisma migrate deploy`**) then deploys the serverless handler in **`api/index.js`**. All HTTP traffic is rewritten to that function (`server/vercel.json`).
4. Copy the deployment URL (e.g. `https://server-xxxxx.vercel.app`). Health check: **`GET https://<api>/api/health`**.

Local long-running server (non-Vercel): from **`server/`**, **`npm install`**, **`npm run db:setup`** or migrate as needed, then **`npm start`** on **`PORT`**.

### Frontend — Vercel (after the API URL exists)

1. **Second Vercel project** → same repo → **Root Directory:** **`client`**.
2. **Environment variables** (Production): **`VITE_API_URL`** = `https://<your-api-deployment>.vercel.app/api` (must end with **`/api`**). Use the **same** value for Preview if you test against the same API.
3. Build is **`npm run build`**; output **`dist`** (`client/vercel.json`).

Redeploy the client whenever **`VITE_API_URL`** changes (it is baked in at build time).

### After both are live

- **`CORS_ORIGIN`** on the API must match the **exact** browser origin of the UI (scheme + host; watch **`www`**).
- Smoke-test: **`GET https://<api-host>/api/health`** → `{ "status": "ok" }`; open the UI and log in.

### Backend — other Node hosts

From **`server/`**: **`npm install`**, **`npx prisma migrate deploy`** (and seed if needed), **`npm start`**. Set **`PORT`** in the environment if the host does not inject it.

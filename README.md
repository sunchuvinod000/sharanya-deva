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

## Deployment (Railway API + Vercel UI + CockroachDB)

Use the **same Cockroach** cluster you already seeded (or run `npm run db:setup` once against prod from a trusted machine). The API only needs a **`postgresql://` / `postgres://` `DATABASE_URL`** (Cockroach’s connection string).

### Backend — Railway

1. **New project** → **Deploy from GitHub** → pick this repo.
2. **Root Directory:** leave as **repo root** (default). The repo includes **`railway.json`** at the root so Railpack runs **`cd server && npm ci`** and starts the API from **`server/`**. Alternatively you can set Root Directory to **`server`** and rely on **`server/railway.json`** only.
3. **Variables** (service → Variables):

   | Name | Value |
   |------|--------|
   | `DATABASE_URL` | Cockroach connection URL (TLS params as required by your host). |
   | `JWT_SECRET` | Long random string. |
   | `JWT_REFRESH_SECRET` | Different long random string. |
   | `CORS_ORIGIN` | Your Vercel URL, e.g. `https://your-app.vercel.app` (comma-separate multiple origins). |
   | `NODE_ENV` | `production` |

   Do **not** set `PORT` yourself unless you know what you’re doing — Railway injects it.

4. **Deploy:** Root **`railway.json`** runs **`cd server && npx prisma migrate deploy`** as **pre-deploy** and **`cd server && npm start`** for the web process. Health: **`GET /api/health`**.
5. Copy the service **public HTTPS URL** (e.g. `https://xxx.up.railway.app`) for the client.

### Frontend — Vercel

1. **New project** → same repo → **Root Directory:** `client`.
2. **Environment variables** (Production): **`VITE_API_URL`** = `https://<your-railway-host>/api` (must end with `/api`).
3. Build: **`npm run build`** (default), output **`dist`**.

Redeploy the client when `VITE_API_URL` changes (it is baked in at build time).

### After deploy

- Set **`CORS_ORIGIN`** on Railway to the **exact** browser origin Vercel uses (no mismatch on `www`).
- Smoke-test: `GET https://<railway>/api/health` → `{ "status": "ok" }`; open the Vercel app and log in.

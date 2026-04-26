import pg from 'pg';
import { resolveDbPort } from './dbEnv.js';

const { Pool } = pg;

// BIGINT (OID 20) → number so Express `res.json()` never throws on BigInt.
pg.types.setTypeParser(20, (val) => (val == null ? null : Number(val)));

export function buildConnectionString() {
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

function toPgText(sql) {
  let i = 0;
  return String(sql).replace(/\?/g, () => `$${++i}`);
}

function isSelectLikeSql(sql) {
  return /^\s*(select|with)\b/i.test(String(sql));
}

function adaptResult(sql, r) {
  if (isSelectLikeSql(sql)) {
    return [r.rows];
  }
  const meta = { affectedRows: r.rowCount ?? 0, insertId: null };
  if (Array.isArray(r.rows) && r.rows.length > 0 && r.rows[0].id != null) {
    meta.insertId = Number(r.rows[0].id);
  }
  return [meta];
}

const innerPool = new Pool({
  connectionString: buildConnectionString(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});

async function runQuery(client, sql, params = []) {
  const text = toPgText(sql);
  const values = params ?? [];
  return client.query(text, values);
}

async function executeOn(client, sql, params) {
  const r = await runQuery(client, sql, params);
  return adaptResult(sql, r);
}

/** MySQL-style `pool.execute(sql, params)` → `[rows]` for SELECT, `[{ insertId, affectedRows }]` for writes. */
async function execute(sql, params) {
  return executeOn(innerPool, sql, params);
}

async function getConnection() {
  const client = await innerPool.connect();
  return {
    execute(sql, params) {
      return executeOn(client, sql, params);
    },
    beginTransaction() {
      return client.query('BEGIN');
    },
    commit() {
      return client.query('COMMIT');
    },
    rollback() {
      return client.query('ROLLBACK');
    },
    release() {
      client.release();
    },
  };
}

export default {
  execute,
  getConnection,
  end: () => innerPool.end(),
};

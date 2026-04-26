import pool from '../config/db.js';

export async function findByEmail(email) {
  const [rows] = await pool.execute(
    'SELECT id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  return rows[0] ?? null;
}

export async function findById(id) {
  const [rows] = await pool.execute(
    'SELECT id, name, email, password_hash, role FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] ?? null;
}

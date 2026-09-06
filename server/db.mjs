import pg from 'pg';
import { readFile } from 'node:fs/promises';
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  randomUUID,
} from 'node:crypto';
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function verifyPassword(password, hash) {
  try {
    const [salt, value] = hash.split(':');
    const a = Buffer.from(value, 'hex'),
      b = scryptSync(password, salt, 64);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
export function database(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 8000,
    statement_timeout: 15000,
  });
  return {
    query: (...args) => pool.query(...args),
    end: () => pool.end(),
    tx: async (fn) => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const result = await fn(c);
        await c.query('COMMIT');
        return result;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
  };
}
export async function initialize(db) {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  if (!process.env.APP_USER || !process.env.APP_PASSWORD)
    throw Error('Credenciais iniciais não configuradas.');
  await db.tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(1492026)');
    await c.query(sql);
    await c.query(
      'INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT(username) DO NOTHING',
      [
        randomUUID(),
        process.env.APP_USER,
        'Administrador da unidade',
        hashPassword(process.env.APP_PASSWORD),
        'admin',
      ],
    );
  });
}
export async function audit(c, user, action, type, id, detail = {}) {
  await c.query(
    'INSERT INTO audit(actor,action,entity_type,entity_id,detail) VALUES($1,$2,$3,$4,$5)',
    [user.id, action, type, id, JSON.stringify(detail)],
  );
}

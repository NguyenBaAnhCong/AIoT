import pg from 'pg';

export const db = new pg.Pool({ connectionTimeoutMillis: 5000 });
db.on('error', error => console.error('PostgreSQL:', error.message));

export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

export const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export const validDate = date => typeof date === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date) &&
  new Date(`${date}T00:00:00Z`).toJSON()?.slice(0, 10) === date;

export async function transaction(pool, run, { preview = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query(preview ? 'ROLLBACK' : 'COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Identity for the localhost demo. The team's authenticated routes should supply their session user.
export async function actor(client) {
  const { rows: [user] } = await client.query(
    'SELECT user_id FROM iam.users WHERE username = $1', [process.env.TV5_USERNAME || 'researcher01'],
  );
  if (!user) fail(409, 'Chưa tìm thấy tài khoản TV5_USERNAME trong database.');
  await client.query("SELECT set_config('app.user_id', $1, true)", [user.user_id]);
  return user.user_id;
}

import pg from 'pg';
import { env } from './env.js';

// NUMERIC mặc định pg trả về chuỗi; ép thành số để API trả JSON số.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// BIGINT (count(*)) trả về chuỗi; ép thành số (đủ an toàn cho quy mô đồ án).
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => console.error('Lỗi kết nối PostgreSQL không mong đợi:', err.message));

/** Truy vấn đơn giản, không cần transaction. */
export const query = (text, params) => pool.query(text, params);

/**
 * Chạy fn trong MỘT transaction và đặt ngữ cảnh người dùng cho trigger audit.
 * Mọi thao tác GHI dữ liệu nên dùng hàm này để audit.audit_logs biết ai đã sửa.
 *
 *   await withUserTx(req.user?.id, async (client) => {
 *     await client.query('UPDATE ... ');
 *   }, { reason: 'Sửa tay theo yêu cầu' });
 */
export async function withUserTx(userId, fn, { reason } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // set_config(..., true) = SET LOCAL: chỉ có hiệu lực trong transaction này
    if (userId) await client.query("SELECT set_config('app.user_id', $1, true)", [String(userId)]);
    if (reason) await client.query("SELECT set_config('app.change_reason', $1, true)", [reason]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

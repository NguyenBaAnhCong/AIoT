import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { env, isProd } from '../config/env.js';

/**
 * Chỉ ở môi trường phát triển: user demo trong seed chưa có mật khẩu (password_hash rỗng)
 * nên không ai đăng nhập được. Hàm này đặt mật khẩu mặc định cho các user đó.
 * Không bao giờ chạy khi NODE_ENV=production.
 */
export async function ensureDevPasswords() {
  if (isProd || !env.seedDevPasswords) return;
  const hash = await bcrypt.hash(env.devDefaultPassword, 10);
  const { rows } = await query(
    `UPDATE iam.users SET password_hash = $1 WHERE password_hash IS NULL RETURNING username`, [hash]
  );
  if (rows.length) {
    console.log(`[dev] Đã đặt mật khẩu mặc định cho: ${rows.map((r) => r.username).join(', ')}  (mật khẩu: ${env.devDefaultPassword})`);
  }
}

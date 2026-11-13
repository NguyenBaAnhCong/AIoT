import bcrypt from 'bcryptjs';
import { AppError } from '../../utils/AppError.js';
import { withUserTx } from '../../config/db.js';
import { signAccess, signRefresh, verifyRefresh, accessTtlSeconds } from '../../lib/tokens.js';
import { getUserContext, invalidateUser } from '../../lib/userCache.js';
import { findUserForLogin, insertAccessLog } from './auth.queries.js';

// Hash giả để so sánh khi không tìm thấy user, giữ thời gian phản hồi gần như nhau
// (tránh lộ "tài khoản này có tồn tại không" qua độ trễ).
const DUMMY_HASH = bcrypt.hashSync('khong-ton-tai', 10);

export const publicUser = (ctx) => ({
  id: ctx.user_id,
  username: ctx.username,
  email: ctx.email,
  fullName: ctx.full_name,
  roles: ctx.roles,
  permissions: ctx.permissions,
});

export const hashPassword = (plain) => bcrypt.hash(plain, 10);

export async function login({ username, password }, meta) {
  const user = await findUserForLogin(username);
  const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);

  if (!user || !user.password_hash || !user.is_active || !ok) {
    await insertAccessLog({ userId: user?.user_id ?? null, action: 'LOGIN_FAILED', resource: `username=${username}`.slice(0, 200), ...meta, status: 401 }).catch(() => {});
    throw AppError.unauthorized('Sai tên đăng nhập hoặc mật khẩu');
  }

  const ctx = await getUserContext(user.user_id);
  await insertAccessLog({ userId: user.user_id, action: 'LOGIN', ...meta, status: 200 }).catch(() => {});
  return {
    accessToken: signAccess(user.user_id),
    refreshToken: signRefresh(user.user_id),
    expiresIn: accessTtlSeconds(),
    user: publicUser(ctx),
  };
}

export async function refresh(refreshToken) {
  const { sub } = verifyRefresh(refreshToken);
  const ctx = await getUserContext(sub);
  if (!ctx || !ctx.is_active) throw AppError.unauthorized('Tài khoản không tồn tại hoặc đã bị khóa');
  return { accessToken: signAccess(sub), expiresIn: accessTtlSeconds(), user: publicUser(ctx) };
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const ctx = await getUserContext(userId);
  const user = await findUserForLogin(ctx.username);
  const ok = user?.password_hash && (await bcrypt.compare(currentPassword, user.password_hash));
  if (!ok) throw AppError.badRequest('Mật khẩu hiện tại không đúng', [{ field: 'currentPassword', message: 'Không đúng' }]);

  const hash = await hashPassword(newPassword);
  await withUserTx(userId, (c) => c.query('UPDATE iam.users SET password_hash = $1 WHERE user_id = $2', [hash, userId]), {
    reason: 'Người dùng tự đổi mật khẩu',
  });
  invalidateUser(userId);
}

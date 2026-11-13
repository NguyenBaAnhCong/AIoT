// =====================================================================
// Xác thực + phân quyền thật (JWT + iam.permissions).
//
//   import { protect } from '../../middleware/auth.js';
//   router.get('/plots',  protect('farm.read'),  handler);   // cần đăng nhập + quyền farm.read
//   router.post('/plots', protect('farm.write'), handler);
//   router.get('/me-only', protect(), handler);              // chỉ cần đăng nhập
//
// Truyền nhiều mã quyền = chỉ cần MỘT trong số đó:  protect('lab.write', 'lab.approve')
// Sau khi qua, req.user = { id, username, fullName, roles[], permissions[] }.
// =====================================================================
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccess } from '../lib/tokens.js';
import { getUserContext } from '../lib/userCache.js';

/** Yêu cầu đăng nhập hợp lệ (header Authorization: Bearer <accessToken>). */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const match = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match) throw AppError.unauthorized();

  const { sub } = verifyAccess(match[1]);
  const ctx = await getUserContext(sub);
  if (!ctx || !ctx.is_active) throw AppError.unauthorized('Tài khoản không tồn tại hoặc đã bị khóa');

  req.user = {
    id: ctx.user_id,
    username: ctx.username,
    fullName: ctx.full_name,
    roles: ctx.roles,
    permissions: ctx.permissions,
  };
  next();
});

/** Yêu cầu có ít nhất một trong các quyền. Phải đặt SAU requireAuth. */
export const requirePermission = (...codes) => (req, res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (codes.some((c) => req.user.permissions.includes(c))) return next();
  next(AppError.forbidden(`Thiếu quyền: ${codes.join(' hoặc ')}`));
};

/** Gộp requireAuth + requirePermission. protect() không tham số = chỉ cần đăng nhập. */
export const protect = (...codes) => (codes.length ? [requireAuth, requirePermission(...codes)] : [requireAuth]);

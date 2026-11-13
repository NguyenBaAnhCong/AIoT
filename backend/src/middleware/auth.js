// =====================================================================
// BẢN TẠM (tuần 1): cho các thành viên khác có sẵn tên hàm để import.
// Tuần 2 sẽ thay phần bên trong bằng JWT + kiểm tra iam.permissions thật.
// Chữ ký hàm giữ nguyên, nên code của cả nhóm KHÔNG phải sửa khi nâng cấp.
// =====================================================================
import { isProd } from '../config/env.js';

/** Yêu cầu đăng nhập. Hiện tại: bỏ qua, gắn người dùng giả khi dev. */
export function requireAuth(req, res, next) {
  req.user = { id: null, username: 'dev', permissions: ['*'] };
  if (isProd) console.warn('CẢNH BÁO: requireAuth đang là bản tạm!');
  next();
}

/** Yêu cầu có quyền, ví dụ requirePermission('lab.approve'). Hiện tại: luôn cho qua. */
export const requirePermission = (/* code */) => (req, res, next) => next();

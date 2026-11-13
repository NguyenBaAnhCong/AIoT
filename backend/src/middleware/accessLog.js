import { insertAccessLog } from '../modules/auth/auth.queries.js';

/**
 * Ghi audit.access_logs cho các request đã xác thực (người dùng hoặc API key):
 *   - mọi thao tác GHI (POST/PUT/PATCH/DELETE)
 *   - mọi request bị từ chối (401/403) khi đã biết danh tính
 * Không ghi các GET thành công để tránh phình bảng khi dashboard tự làm mới liên tục.
 * Ghi sau khi phản hồi xong, lỗi ghi log không ảnh hưởng người dùng.
 */
export function accessLog(req, res, next) {
  res.on('finish', () => {
    const identified = req.user || req.apiKey;
    if (!identified || req.path === '/auth/login') return;
    const isWrite = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
    if (!isWrite && res.statusCode < 400) return;

    insertAccessLog({
      userId: req.user?.id ?? null,
      apiKeyId: req.apiKey?.id ?? null,
      action: 'API_CALL',
      resource: req.originalUrl.split('?')[0].slice(0, 300),
      method: req.method,
      status: res.statusCode,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    }).catch((err) => console.error('Không ghi được access_logs:', err.message));
  });
  next();
}

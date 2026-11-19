import { insertAccessLog } from '../modules/auth/auth.queries.js';

/**
 * Ghi audit.access_logs cho các request đã xác thực (người dùng hoặc API key).
 *
 * NGƯỜI DÙNG: ghi mọi thao tác GHI (POST/PUT/PATCH/DELETE) và mọi request bị từ chối (401/403/...).
 *             Không ghi các GET thành công (dashboard tự làm mới liên tục sẽ làm phình bảng).
 * API KEY (thiết bị): gateway gửi bản tin liên tục (3 node x mỗi 15 giây ≈ 17.000 lần/ngày), nên LẤY MẪU:
 *   - request thành công: tối đa 1 dòng / key / SAMPLE_SECONDS (mặc định 300 giây)
 *   - request lỗi: tối đa 1 dòng / key / mã trạng thái / 60 giây, nhưng KHÔNG bao giờ bỏ qua hẳn
 * Nhờ vậy vẫn biết "key nào đang hoạt động, lần cuối khi nào, đang lỗi gì" mà không đầy bảng.
 */
const SAMPLE_SECONDS = Number(process.env.ACCESS_LOG_API_KEY_SAMPLE_SECONDS || 300);
const ERROR_SAMPLE_SECONDS = 60;

const lastLogged = new Map(); // "keyId|loại" -> thời điểm (ms) đã ghi lần gần nhất

/** Có nên ghi request này không? Tách riêng để kiểm thử được (truyền `now` để giả lập thời gian). */
export function shouldLog({ method, status, userId, apiKeyId }, now = Date.now()) {
  if (!userId && !apiKeyId) return false;                       // chưa biết danh tính
  const isWrite = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  if (!isWrite && status < 400) return false;                   // GET thành công: bỏ qua

  if (userId) return true;                                      // người dùng: giữ nguyên quy tắc trên

  const failed = status >= 400;
  const key = `${apiKeyId}|${failed ? status : 'ok'}`;
  const window = (failed ? ERROR_SAMPLE_SECONDS : SAMPLE_SECONDS) * 1000;
  const last = lastLogged.get(key);
  if (last !== undefined && now - last < window) return false;
  lastLogged.set(key, now);
  return true;
}

/** Chỉ dùng trong test: xóa bộ nhớ lấy mẫu. */
export const resetSampler = () => lastLogged.clear();

export function accessLog(req, res, next) {
  res.on('finish', () => {
    if (req.path === '/auth/login') return;
    const info = { method: req.method, status: res.statusCode, userId: req.user?.id ?? null, apiKeyId: req.apiKey?.id ?? null };
    if (!shouldLog(info)) return;

    insertAccessLog({
      userId: info.userId,
      apiKeyId: info.apiKeyId,
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

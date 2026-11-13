import { AppError } from '../utils/AppError.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(req, res, next) {
  next(AppError.notFound(`Không có đường dẫn ${req.method} ${req.originalUrl}`));
}

// Một số mã lỗi PostgreSQL thường gặp -> lỗi HTTP dễ hiểu
const PG_ERRORS = {
  '23505': [409, 'CONFLICT', 'Dữ liệu bị trùng (vi phạm ràng buộc duy nhất)'],
  '23503': [409, 'FK_VIOLATION', 'Dữ liệu tham chiếu không tồn tại hoặc đang được sử dụng'],
  '23502': [400, 'VALIDATION_ERROR', 'Thiếu dữ liệu bắt buộc'],
  '23514': [400, 'VALIDATION_ERROR', 'Giá trị không thỏa ràng buộc kiểm tra'],
  '22P02': [400, 'VALIDATION_ERROR', 'Định dạng dữ liệu không hợp lệ'],
};

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = 500, code = 'INTERNAL_ERROR', message = 'Lỗi hệ thống', details;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err?.code && PG_ERRORS[err.code]) {
    [status, code, message] = PG_ERRORS[err.code];
    details = isProd ? undefined : { constraint: err.constraint, detail: err.detail };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400; code = 'VALIDATION_ERROR'; message = 'JSON gửi lên không hợp lệ';
  } else {
    console.error(err);
  }

  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

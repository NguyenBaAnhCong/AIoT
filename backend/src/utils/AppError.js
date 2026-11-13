/** Lỗi nghiệp vụ có mã HTTP và mã lỗi riêng. Ném lỗi này từ service/controller. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  static badRequest(message = 'Dữ liệu không hợp lệ', details) { return new AppError(400, 'VALIDATION_ERROR', message, details); }
  static unauthorized(message = 'Chưa đăng nhập hoặc phiên đã hết hạn') { return new AppError(401, 'UNAUTHORIZED', message); }
  static forbidden(message = 'Bạn không có quyền thực hiện thao tác này') { return new AppError(403, 'FORBIDDEN', message); }
  static notFound(message = 'Không tìm thấy dữ liệu') { return new AppError(404, 'NOT_FOUND', message); }
  static conflict(message = 'Dữ liệu đã tồn tại', details) { return new AppError(409, 'CONFLICT', message, details); }
}

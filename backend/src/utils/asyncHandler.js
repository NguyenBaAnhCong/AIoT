/** Bọc controller async để lỗi tự chuyển sang middleware xử lý lỗi (Express 4 không tự làm). */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

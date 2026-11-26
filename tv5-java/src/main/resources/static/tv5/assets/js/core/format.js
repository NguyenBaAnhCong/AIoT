export const viTime = value => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
}).format(new Date(value));
export const labels = {
  OPEN: 'Đang mở', ACK: 'Đã xác nhận', RESOLVED: 'Đã giải quyết',
  PROPOSED: 'Chờ quyết định', ACCEPTED: 'Đã chấp nhận', REJECTED: 'Đã từ chối', DONE: 'Hoàn thành',
  READY: 'Sẵn sàng', FAILED: 'Lỗi', QUEUED: 'Đang chờ', GENERATING: 'Đang tạo',
  LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', CRITICAL: 'Khẩn cấp',
  SENSOR: 'Cảm biến', SQI: 'Chỉ số sức khỏe đất', ML: 'Mô hình AI', DEVICE: 'Thiết bị',
  DATA_QUALITY: 'Chất lượng dữ liệu',
};

export const healthClasses = { VERY_GOOD: 'Rất tốt', GOOD: 'Tốt', FAIR: 'Trung bình', POOR: 'Kém' };
export function paintSqiClass(badge, value) {
  const code = Object.keys(healthClasses).find(key => key === value || healthClasses[key] === value);
  badge.textContent = healthClasses[code] ?? value ?? '—';
  badge.dataset.tone = code ?? '';
  return badge;
}
export const conditionLabels = {
  LT: 'Thấp hơn ngưỡng', GT: 'Cao hơn ngưỡng', OUTSIDE: 'Nằm ngoài khoảng cho phép',
  CLASS_IN: 'Thuộc nhóm phân loại đã chọn', ANOMALY: 'Phát hiện bất thường', OFFLINE: 'Mất kết nối',
};
export const evidenceNumber = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 });

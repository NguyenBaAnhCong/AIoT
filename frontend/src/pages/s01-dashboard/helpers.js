const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
export const num = (v, digits) => (v === null || v === undefined ? '—' : digits === undefined ? nf.format(v) : Number(v).toFixed(digits).replace('.', ','));

/** "5 phút trước", "3 giờ trước"… từ chuỗi ISO. */
export function ago(iso, now = Date.now()) {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}
export const isStale = (iso, minutes = 60, now = Date.now()) => !iso || now - new Date(iso).getTime() > minutes * 60_000;

export const fullTime = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

// Hạng sức khỏe đất (bảng sqi.sqi_classes)
export const HEALTH = {
  VERY_GOOD: { label: 'Rất tốt', tone: 'ok' },
  GOOD: { label: 'Tốt', tone: 'ok' },
  FAIR: { label: 'Trung bình', tone: 'warn' },
  POOR: { label: 'Kém', tone: 'bad' },
};

// 12 KPI nghiệm thu chia 3 nhóm theo tiền tố mã
export const KPI_GROUPS = [
  { id: 'data', title: 'Thu thập và chất lượng dữ liệu', match: (c) => /^(DATA_|ERROR_|MISSING_|TIMESTAMP_|VALID_)/.test(c) },
  { id: 'ml', title: 'Mô hình Embedded ML', match: (c) => c.startsWith('ML_') },
  { id: 'ota', title: 'Cập nhật OTA', match: (c) => c.startsWith('OTA_') },
];

export const UNIT_LABEL = { obs: 'quan sát' };
export const unitText = (u) => (u ? ` ${UNIT_LABEL[u] ?? u}` : '');
export const CMP = { GTE: '≥', LTE: '≤', GT: '>', LT: '<', EQ: '=' };

/** Tỷ lệ lấp đầy thanh tiến độ (0–100): so giá trị hiện tại với chỉ tiêu. */
export function progress(k) {
  if (k.current_value == null || !k.target_value) return 0;
  return Math.max(0, Math.min(100, (k.current_value / k.target_value) * 100));
}

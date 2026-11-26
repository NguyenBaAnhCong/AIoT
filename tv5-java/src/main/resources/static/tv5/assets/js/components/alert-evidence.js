import { el } from './ui.js';
import { labels, healthClasses, conditionLabels, evidenceNumber, viTime } from '../core/format.js';
const evidenceLabels = {
  n: 'Số mẫu', min: 'Giá trị thấp nhất', max: 'Giá trị cao nhất', window_min: 'Cửa sổ đánh giá',
  sqi: 'Điểm SQI', class: 'Phân loại', period_start: 'Bắt đầu kỳ đo', coverage_pct: 'Độ phủ',
  prediction: 'Dự đoán', confidence: 'Độ tin cậy', anomaly_score: 'Điểm bất thường',
  last_seen_at: 'Lần kết nối cuối', node_code: 'Mã thiết bị',
};
export function recommendationReason(reason) {
  const match = /^Luật\s+(\S+)\s+\(([A-Z_]+)\)$/.exec(reason);
  if (!match) return reason;
  const [, code, condition] = match;
  if (!Object.hasOwn(conditionLabels, condition)) return reason;
  if (condition === 'OUTSIDE' && code === 'PH_OUT') return 'Lý do: pH nằm ngoài khoảng cho phép.';
  return `Lý do: ${conditionLabels[condition].toLocaleLowerCase('vi-VN')}.`;
}

export function evidenceValue(key, value) {
  if (value == null) return '—';
  if (Array.isArray(value)) {
    if (!value.length) return '—';
    const list = el('ul');
    for (const item of value) {
      const entry = el('li');
      entry.append(evidenceValue(key, item));
      list.append(entry);
    }
    return list;
  }
  if (typeof value === 'object') return evidenceList(value);
  if (typeof value === 'number') {
    const unit = key === 'window_min' ? ' phút' : key === 'coverage_pct' ? '%' : '';
    return evidenceNumber.format(value) + unit;
  }
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (['period_start', 'last_seen_at'].includes(key) && Number.isFinite(Date.parse(value))) return viTime(value);
  return Object.hasOwn(healthClasses, value) ? healthClasses[value] : value;
}

export function evidenceList(evidence) {
  const list = el('dl');
  list.className = 'alert-evidence';
  for (const [key, value] of Object.entries(evidence)) {
    const item = el('div');
    const description = el('dd');
    description.append(evidenceValue(key, value));
    const title = Object.hasOwn(evidenceLabels, key) ? evidenceLabels[key] : key.replaceAll('_', ' ');
    item.append(el('dt', title), description);
    list.append(item);
  }
  return list;
}

export function alertBadge(code) {
  const badge = el('span', labels[code] || code);
  badge.className = 'alert-badge';
  badge.dataset.tone = code;
  return badge;
}

export function lightbulbIcon() {
  // Lucide Lightbulb, rendered locally as an inline SVG.
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const attributes = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' };
  for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
  for (const d of ['M9 18h6', 'M10 22h4', 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5a6 6 0 0 0-12 0c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5']) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

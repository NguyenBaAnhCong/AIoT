export const get = id => document.getElementById(id);
export const el = (tag, text) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  return node;
};
export const viTime = value => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
}).format(new Date(value));
export async function api(path, method = 'GET', data) {
  const response = await fetch(path, data === undefined ? { method } : {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
export function table(headings, rows) {
  const node = el('table');
  const header = node.createTHead().insertRow();
  for (const text of headings) header.append(el('th', text));
  const body = node.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const value of row) {
      const cell = tr.insertCell();
      if (value instanceof Node) cell.append(value);
      else cell.textContent = value ?? '—';
    }
  }
  return node;
}
export async function task(button, status, run) {
  button.disabled = true;
  status.textContent = 'Đang xử lý…';
  try { status.textContent = await run() || ''; }
  catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
}
export function action(label, status, run) {
  const button = el('button', label);
  button.type = 'button';
  button.addEventListener('click', () => void task(button, status, run));
  return button;
}

const labels = {
  OPEN: 'Đang mở', ACK: 'Đã xác nhận', RESOLVED: 'Đã giải quyết',
  PROPOSED: 'Chờ quyết định', ACCEPTED: 'Đã chấp nhận', REJECTED: 'Đã từ chối', DONE: 'Hoàn thành',
  READY: 'Sẵn sàng', FAILED: 'Lỗi', QUEUED: 'Đang chờ', GENERATING: 'Đang tạo',
  LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', CRITICAL: 'Khẩn cấp',
  SENSOR: 'Cảm biến', SQI: 'Chỉ số sức khỏe đất', ML: 'Mô hình AI', DEVICE: 'Thiết bị',
  DATA_QUALITY: 'Chất lượng dữ liệu',
};

const evidenceLabels = {
  n: 'Số mẫu', min: 'Giá trị thấp nhất', max: 'Giá trị cao nhất', window_min: 'Cửa sổ đánh giá',
  sqi: 'Điểm SQI', class: 'Phân loại', period_start: 'Bắt đầu kỳ đo', coverage_pct: 'Độ phủ',
  prediction: 'Dự đoán', confidence: 'Độ tin cậy', anomaly_score: 'Điểm bất thường',
  last_seen_at: 'Lần kết nối cuối', node_code: 'Mã thiết bị',
};
const healthClasses = { VERY_GOOD: 'Rất tốt', GOOD: 'Tốt', FAIR: 'Trung bình', POOR: 'Kém' };
export function paintSqiClass(badge, value) {
  const code = Object.keys(healthClasses).find(key => key === value || healthClasses[key] === value);
  badge.textContent = healthClasses[code] ?? value ?? '—';
  badge.dataset.tone = code ?? '';
  return badge;
}
const conditionLabels = {
  LT: 'Thấp hơn ngưỡng', GT: 'Cao hơn ngưỡng', OUTSIDE: 'Nằm ngoài khoảng cho phép',
  CLASS_IN: 'Thuộc nhóm phân loại đã chọn', ANOMALY: 'Phát hiện bất thường', OFFLINE: 'Mất kết nối',
};
const evidenceNumber = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 });

function recommendationReason(reason) {
  const match = /^Luật\s+(\S+)\s+\(([A-Z_]+)\)$/.exec(reason);
  if (!match) return reason;
  const [, code, condition] = match;
  if (!Object.hasOwn(conditionLabels, condition)) return reason;
  if (condition === 'OUTSIDE' && code === 'PH_OUT') return 'Lý do: pH nằm ngoài khoảng cho phép.';
  return `Lý do: ${conditionLabels[condition].toLocaleLowerCase('vi-VN')}.`;
}

function evidenceValue(key, value) {
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

function evidenceList(evidence) {
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

function alertBadge(code) {
  const badge = el('span', labels[code] || code);
  badge.className = 'alert-badge';
  badge.dataset.tone = code;
  return badge;
}

function lightbulbIcon() {
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

function alertPage() {
  const filters = get('alert-filters');
  const status = get('alert-feedback');
  const ruleStatus = get('rule-feedback');
  const form = get('rule-form');
  const field = name => form.elements.namedItem(name);
  const choice = get('rule-choice');
  const availableConditions = {
    SENSOR: ['LT','GT','OUTSIDE'], SQI: ['LT','GT','OUTSIDE','CLASS_IN'],
    ML: ['ANOMALY'], DEVICE: ['OFFLINE'],
  };
  let rules = [];

  function previewRule() {
    const value = name => field(name).value;
    const severity = labels[value('severity')]?.toLocaleUpperCase('vi-VN');
    const source = value('source');
    const window = value('windowMinutes');
    const subject = source === 'SENSOR'
      ? `giá trị trung bình của ${field('parameter').selectedOptions[0]?.textContent || 'chỉ tiêu đã chọn'}`
      : 'điểm sức khỏe đất';
    const low = value('low');
    const high = value('high');
    const threshold = number => number === '' ? 'ngưỡng chưa nhập' : evidenceNumber.format(Number(number));
    const classes = value('classes').split(',').map(code => code.trim()).filter(Boolean)
      .map(code => healthClasses[code] || code).join(', ');
    const conditions = {
      LT: `${subject} thấp hơn ${threshold(low)}`,
      GT: `${subject} cao hơn ${threshold(high)}`,
      OUTSIDE: `${subject} nằm ngoài khoảng từ ${threshold(low)} đến ${threshold(high)}`,
      CLASS_IN: `sức khỏe đất thuộc nhóm ${classes || 'chưa chọn'}`,
      ANOMALY: `điểm bất thường của mô hình AI từ ${threshold(high || '0.5')} trở lên`,
      OFFLINE: `thiết bị mất kết nối quá ${window || '…'} phút`,
    };
    const condition = value('condition');
    const period = condition === 'OFFLINE' ? '' : ` trong ${window || '…'} phút`;
    const sqiPeriod = window ? Math.max(2880, Number(window)) : '…';
    const scope = source === 'SQI' ? ` (xét điểm gần nhất trong ${sqiPeriod} phút)` : period;
    get('rule-preview').textContent = severity && conditions[condition]
      ? `Cảnh báo mức ${severity} nếu ${conditions[condition]}${scope}.`
      : 'Chọn mức độ và điều kiện để xem trước luật.';
    const cooldown = value('cooldownMinutes');
    get('rule-preview-cooldown').textContent = !field('active').checked
      ? 'Luật đang tắt.'
      : cooldown === '' ? '' : `Chờ ${evidenceNumber.format(Number(cooldown))} phút trước khi cảnh báo lặp lại.`;
    const recommendation = value('recommendation').trim();
    get('rule-preview-recommendation').textContent = recommendation ? `Khuyến nghị: ${recommendation}` : '';
  }

  function showRuleFields() {
    const source = field('source').value;
    const condition = field('condition').value;
    const visible = {
      parameter: source === 'SENSOR',
      low: ['LT', 'OUTSIDE'].includes(condition),
      high: ['GT', 'OUTSIDE', 'ANOMALY'].includes(condition),
      classes: condition === 'CLASS_IN',
    };
    for (const [name, show] of Object.entries(visible)) {
      field(name).closest('label').hidden = !show;
      field(name).disabled = !show;
    }
    field('low').required = visible.low;
    field('high').required = visible.high && condition !== 'ANOMALY';
    field('classes').required = visible.classes;
    previewRule();
  }

  function setConditions(value) {
    const source = field('source').value;
    field('condition').replaceChildren(...availableConditions[source].map(code => new Option(conditionLabels[code], code)));
    if (value) field('condition').value = value;
    showRuleFields();
  }

  function selectRule() {
    const rule = rules.find(row => row.rule_id === choice.value);
    const values = {
      code: rule?.rule_code, name: rule?.name, source: rule?.source || 'SENSOR',
      parameter: rule?.parameter_code || 'PH', low: rule?.threshold_low, high: rule?.threshold_high,
      classes: rule?.class_values?.join(', '), windowMinutes: rule?.window_minutes ?? 60,
      cooldownMinutes: rule?.cooldown_minutes ?? 360, severity: rule?.severity || 'MEDIUM',
      recommendation: rule?.recommendation_template,
    };
    if (!availableConditions[values.source]) {
      ruleStatus.textContent = 'Nguồn luật này chưa được hỗ trợ chỉnh sửa.';
      get('rule-save').disabled = true;
      return;
    }
    get('rule-save').disabled = false;
    const critical = get('rule-critical');
    critical.hidden = values.severity !== 'CRITICAL';
    critical.querySelector('input').disabled = critical.hidden;
    for (const [name, value] of Object.entries(values)) field(name).value = value ?? '';
    field('active').checked = rule?.is_active ?? true;
    setConditions(rule?.condition);
  }
  async function loadRules(id) {
    rules = await api('/alert-rules');
    choice.replaceChildren(new Option('Tạo luật mới', ''), ...rules.map(rule =>
      new Option(`${rule.rule_code} · ${rule.is_active ? 'Đang bật' : 'Đã tắt'}`, rule.rule_id)));
    if (id) choice.value = id;
    selectRule();
  }

  function card(alert) {
    const node = el('article');
    node.className = 'record';
    node.dataset.severity = alert.severity;
    const metadata = el('div');
    metadata.className = 'alert-metadata';
    const time = el('time', viTime(alert.created_at));
    time.dateTime = alert.created_at;
    metadata.append(alertBadge(alert.severity), alertBadge(alert.source), alertBadge(alert.status), time);
    node.append(el('h3', alert.message), metadata);
    if (alert.acknowledged_by && alert.acknowledged_at) {
      node.append(el('p', `Xác nhận bởi ${alert.acknowledged_by} · ${viTime(alert.acknowledged_at)}`));
    }
    if (alert.resolved_by && alert.resolved_at) {
      node.append(el('p', `Giải quyết bởi ${alert.resolved_by} · ${viTime(alert.resolved_at)}`));
    }
    if (alert.resolution_note) node.append(el('p', alert.resolution_note));
    if (alert.evidence && Object.keys(alert.evidence).length) {
      const details = el('details');
      details.append(el('summary', 'Xem bằng chứng'), evidenceList(alert.evidence));
      node.append(details);
    }
    async function change(next, note) {
      await api(`/alerts/${alert.alert_id}`, 'PATCH', { status: next, note });
      await loadAlerts();
      return labels[next];
    }
    if (alert.status === 'OPEN') node.append(action('Xác nhận', status, () => change('ACK')));
    if (alert.status === 'ACK') {
      const note = el('textarea');
      note.placeholder = 'Nhập ghi chú xử lý';
      note.setAttribute('aria-label', 'Ghi chú xử lý');
      note.maxLength = 2000;
      node.append(note, action('Giải quyết', status, () => change('RESOLVED', note.value)));
    }
    const callout = el('div');
    callout.className = 'reco-box';
    const heading = el('h4', 'Khuyến nghị');
    heading.className = 'reco-title';
    heading.prepend(lightbulbIcon());
    callout.append(heading);
    for (const reco of alert.recommendations) {
      const item = el('div');
      item.className = 'reco-item';
      item.append(el('p', reco.action), alertBadge(reco.status));
      if (reco.rationale) item.append(el('small', recommendationReason(reco.rationale)));
      if (reco.decidedBy && reco.decidedAt) item.append(el('small', `${reco.decidedBy} · ${viTime(reco.decidedAt)}`));
      const controls = el('div');
      controls.className = 'actions';
      const options = reco.status === 'PROPOSED' ? [['Chấp nhận','ACCEPTED'],['Từ chối','REJECTED']]
        : reco.status === 'ACCEPTED' ? [['Hoàn thành','DONE']] : [];
      for (const [caption, next] of options) {
        const button = action(caption, status, async () => {
          await api(`/recommendations/${reco.id}`, 'PATCH', { status: next });
          await loadAlerts();
          return labels[next];
        });
        if (next === 'REJECTED') button.className = 'secondary-action';
        controls.append(button);
      }
      if (options.length) item.append(controls);
      callout.append(item);
    }
    if (alert.recommendations.length) node.append(callout);
    return node;
  }

  async function loadAlerts() {
    const query = new URLSearchParams(new FormData(filters));
    const rows = await api(`/alerts?${query}`);
    get('alert-list').replaceChildren(...(rows.length ? rows.map(card) : [el('p', 'Không có cảnh báo phù hợp.')]));
    const feedback = get('kpi-feedback');
    try {
      const summary = await api('/alerts/summary');
      for (const key of ['open', 'urgent', 'resolved']) {
        get(`kpi-${key}`).textContent = summary[key].toLocaleString('vi-VN');
      }
      feedback.textContent = '';
    } catch {
      for (const key of ['open', 'urgent', 'resolved']) get(`kpi-${key}`).textContent = '—';
      feedback.textContent = 'Chưa tải được số liệu tổng quan.';
    }
  }
  filters.addEventListener('submit', event => {
    event.preventDefault();
    void task(event.submitter, status, loadAlerts);
  });
  get('evaluate').addEventListener('submit', event => {
    event.preventDefault();
    void task(event.submitter, get('evaluate-feedback'), async () => {
      const value = new FormData(event.target).get('at');
      const result = await api('/alerts/evaluate', 'POST', { at: value ? `${value}:00+07:00` : null });
      await loadAlerts();
      return `Đã tạo ${result.created} cảnh báo.`;
    });
  });
  choice.addEventListener('change', () => { ruleStatus.textContent = ''; selectRule(); });
  field('source').addEventListener('change', () => setConditions());
  field('condition').addEventListener('change', showRuleFields);
  form.addEventListener('input', previewRule);
  form.addEventListener('change', previewRule);
  form.addEventListener('submit', event => {
    event.preventDefault();
    void task(event.submitter, ruleStatus, async () => {
      const data = Object.fromEntries(new FormData(form));
      for (const key of ['low','high','windowMinutes','cooldownMinutes']) {
        data[key] = data[key] == null || data[key] === '' ? null : Number(data[key]);
      }
      data.classes = (data.classes || '').split(',').map(text => text.trim()).filter(Boolean);
      data.active = field('active').checked;
      const id = choice.value;
      const result = await api(id ? `/alert-rules/${id}` : '/alert-rules', id ? 'PUT' : 'POST', data);
      await loadRules(result.rule_id);
      return 'Đã lưu luật.';
    });
  });
  setConditions();
  loadAlerts().catch(error => { status.textContent = error.message; });
  loadRules().catch(error => { ruleStatus.textContent = error.message; });
}

function reportPage() {
  const form = get('report-form');
  const status = get('report-feedback');
  const historyFilter = get('report-history-filter');
  const historyFeedback = get('report-history-feedback');
  const field = name => form.elements.namedItem(name);
  let options = {};
  let history = [];
  function scope() {
    const experiment = field('experiment').value;
    const treatments = (options.treatments || []).filter(item => item.experiment_id === experiment);
    const seasons = (options.seasons || []).filter(item => item.experiment_id === experiment);
    field('treatment').replaceChildren(new Option('Tất cả', ''), ...treatments.map(item =>
      new Option(`${item.treatment_code} · ${item.name}`, item.treatment_id)));
    field('season').replaceChildren(new Option('Tất cả', ''), ...seasons.map(item =>
      new Option(`${item.season_code} · ${item.plot_code}`, item.crop_season_id)));
  }
  function reportIcon(name) {
    const ns = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(ns, 'svg');
    icon.setAttribute('class', 'report-icon');
    icon.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(ns, 'use');
    use.setAttribute('href', `#report-icon-${name}`);
    icon.append(use);
    return icon;
  }
  function renderHistory() {
    const type = historyFilter.value;
    const rows = history.filter(row => !type || row.report_type === type);
    const display = rows.map(row => {
      const name = el('span');
      name.className = 'report-file-name';
      name.dataset.format = row.file_format || '';
      name.append(reportIcon(row.file_format === 'XLSX' ? 'sheet' : 'document'), el('span', row.title));
      const format = el('span', row.file_format || '—');
      format.className = 'report-format';
      format.dataset.format = row.file_format || '';
      const pill = el('span', labels[row.status] || row.status);
      pill.className = 'report-state';
      pill.dataset.state = row.status;
      const state = el('div');
      state.append(pill);
      if (row.error) {
        const message = el('small', row.error);
        message.className = 'report-error';
        state.append(message);
      }
      const link = el('a', 'Tải tệp');
      link.className = 'report-download';
      link.prepend(reportIcon('download'));
      link.href = `/reports/${row.report_id}/file`;
      link.setAttribute('aria-label', `Tải ${row.title} (${row.file_format})`);
      return [name, viTime(row.created_at), format, state, row.status === 'READY' ? link : '—'];
    });
    const empty = el('p', type ? 'Chưa có báo cáo thuộc loại đã chọn.' : 'Chưa có báo cáo.');
    empty.className = 'report-empty';
    get('report-list').replaceChildren(rows.length
      ? table(['Báo cáo','Thời điểm','Định dạng','Trạng thái','Tệp'], display) : empty);
  }
  async function loadReports() {
    history = await api('/reports');
    renderHistory();
    historyFeedback.textContent = '';
  }
  historyFilter.addEventListener('change', renderHistory);
  field('experiment').addEventListener('change', scope);
  field('type').addEventListener('change', () => {
    const visible = field('type').value === 'TECHNICAL';
    get('report-from').hidden = get('report-to').hidden = !visible;
    field('from').disabled = field('to').disabled = !visible;
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    void task(event.submitter, status, async () => {
      const data = Object.fromEntries(new FormData(form));
      for (const key of ['treatment','season','from','to']) data[key] ||= null;
      const result = await api('/reports', 'POST', data);
      if (historyFilter.value) historyFilter.value = data.type;
      await loadReports();
      return result.status === 'READY' ? 'Đã tạo báo cáo. Bấm Tải tệp trong lịch sử.' : 'Tạo báo cáo thất bại.';
    });
  });
  field('from').disabled = field('to').disabled = true;
  api('/reports/options').then(data => {
    options = data;
    field('experiment').replaceChildren(...(options.experiments || []).map(item =>
      new Option(`${item.experiment_code} · ${item.title}`, item.experiment_id)));
    form.querySelector('button').disabled = !field('experiment').value;
    if (!field('experiment').value) status.textContent = 'Chưa có thí nghiệm để tạo báo cáo.';
    scope();
  }).catch(error => { status.textContent = error.message; });
  loadReports().catch(error => { historyFeedback.textContent = error.message; });
}

if (get('alerts-page')) alertPage();
if (get('reports-page')) reportPage();

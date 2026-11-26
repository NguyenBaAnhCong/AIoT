import { can } from '../api/auth-api.js';
import { alertApi } from '../api/alert-api.js';
import { get, el, table, pager, task, action } from '../components/ui.js';
import { labels, healthClasses, conditionLabels, evidenceNumber, viTime } from '../core/format.js';
import { alertBadge, evidenceList, lightbulbIcon, recommendationReason } from '../components/alert-evidence.js';
export function initAlerts() {
  let pageNumber = 1;
  let listRequest = 0;
  const writable = can('alert.write');
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
  let selectedAlert;

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
    get('rule-save').disabled = !writable;
    const critical = get('rule-critical');
    critical.hidden = values.severity !== 'CRITICAL';
    critical.querySelector('input').disabled = critical.hidden;
    for (const [name, value] of Object.entries(values)) field(name).value = value ?? '';
    if (get('rule-severity-picker')) get('rule-severity-picker').value = values.severity;
    field('active').checked = rule?.is_active ?? true;
    setConditions(rule?.condition);
  }
  async function loadRules(id) {
    rules = await alertApi.rules();
    choice.replaceChildren(new Option('Tạo luật mới', ''), ...rules.map(rule =>
      new Option(`${rule.rule_code} · ${rule.is_active ? 'Đang bật' : 'Đã tắt'}`, rule.rule_id)));
    if (id) choice.value = id;
    selectRule();
    const list = get('rule-list');
    if (list) {
      list.replaceChildren(table(['Mã luật', 'Tên luật', 'Nguồn', 'Điều kiện', 'Mức độ', 'Trạng thái', 'Chi tiết'],
        rules.map(rule => {
          const edit = el('button', writable ? 'Chỉnh sửa' : 'Xem'); edit.type = 'button';
          edit.addEventListener('click', () => {
            choice.value = rule.rule_id; selectRule(); form.hidden = false;
            form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          });
          return [rule.rule_code, rule.name, labels[rule.source] || rule.source,
            conditionLabels[rule.condition] || rule.condition, labels[rule.severity] || rule.severity,
            rule.is_active ? 'Đang bật' : 'Đã tắt', edit];
        })));
    }
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
      await alertApi.change(alert.alert_id, { status: next, note });
      await loadAlerts();
      return labels[next];
    }
    if (writable && alert.status === 'OPEN') node.append(action('Xác nhận', status, () => change('ACK')));
    if (writable && alert.status === 'ACK') {
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
      const options = !writable ? [] : reco.status === 'PROPOSED' ? [['Chấp nhận','ACCEPTED'],['Từ chối','REJECTED']]
        : reco.status === 'ACCEPTED' ? [['Hoàn thành','DONE']] : [];
      for (const [caption, next] of options) {
        const button = action(caption, status, async () => {
          await alertApi.decide(reco.id, { status: next });
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
    const current = ++listRequest;
    const query = new URLSearchParams(new FormData(filters));
    query.set('page', pageNumber);
    query.set('limit', 20);
    const { data: rows, meta } = await alertApi.list(query);
    if (current !== listRequest) return;
    const navigation = pager(meta, async page => {
      pageNumber = page;
      try { await loadAlerts(); } catch (error) { status.textContent = error.message; }
    });
    const detail = get('alert-detail');
    const renderDetail = () => {
      const selected = rows.find(row => row.alert_id === selectedAlert);
      detail.replaceChildren(...(selected ? [card(selected)] : []));
    };
    const list = rows.length ? table(['Cảnh báo', 'Ô đất', 'Thời điểm', 'Mức độ', 'Trạng thái'], rows.map(row => {
      const select = el('button', row.message); select.type = 'button'; select.className = 'alert-select';
      select.addEventListener('click', () => { selectedAlert = row.alert_id; renderDetail(); });
      return [select, row.plot_code || '—', viTime(row.created_at), alertBadge(row.severity), labels[row.status] || row.status];
    })) : el('p', 'Không có cảnh báo phù hợp.');
    get('alert-list').replaceChildren(list, navigation);
    renderDetail();
    const feedback = get('kpi-feedback');
    try {
      const summary = await alertApi.summary();
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
    pageNumber = 1;
    selectedAlert = undefined;
    void task(event.submitter, status, loadAlerts);
  });
  get('evaluate').addEventListener('submit', event => {
    event.preventDefault();
    void task(event.submitter, get('evaluate-feedback'), async () => {
      const value = new FormData(event.target).get('at');
      const result = await alertApi.evaluate( { at: value ? `${value}:00+07:00` : null });
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
      const result = await alertApi.saveRule(id, data);
      await loadRules(result.rule_id);
      if (get('rule-list')) form.hidden = true;
      return 'Đã lưu luật.';
    });
  });
  setConditions();
  if (!writable) {
    for (const element of [...form.elements, ...get('evaluate').elements]) element.disabled = true;
  }
  loadAlerts().catch(error => { status.textContent = error.message; });
  loadRules().catch(error => { ruleStatus.textContent = error.message; });
}

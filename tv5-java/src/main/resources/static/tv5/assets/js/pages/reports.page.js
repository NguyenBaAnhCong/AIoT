import { can } from '../api/auth-api.js';
import { reportApi } from '../api/report-api.js';
import { get, el, table, pager, task } from '../components/ui.js';
import { labels, viTime } from '../core/format.js';
import { saveBlob } from '../components/files.js';
export function initReports() {
  const form = get('report-form');
  const status = get('report-feedback');
  const historyFilter = get('report-history-filter');
  const historyFeedback = get('report-history-feedback');
  const field = name => form.elements.namedItem(name);
  let options = {};
  let history = [];
  let pageNumber = 1;
  let reportMeta;
  let historyRequest = 0;
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
      link.addEventListener('click', event => {
        event.preventDefault();
        if (link.dataset.busy) return;
        link.dataset.busy = 'true';
        void reportApi.download(row.report_id)
          .then(blob => saveBlob(blob, `${row.report_id}.${row.file_format.toLowerCase()}`))
          .catch(error => { historyFeedback.textContent = error.message; })
          .finally(() => { delete link.dataset.busy; });
      });
      link.setAttribute('aria-label', `Tải ${row.title} (${row.file_format})`);
      return [name, viTime(row.created_at), format, state, row.status === 'READY' ? link : '—'];
    });
    const empty = el('p', type ? 'Chưa có báo cáo thuộc loại đã chọn.' : 'Chưa có báo cáo.');
    empty.className = 'report-empty';
    get('report-list').replaceChildren(rows.length
      ? table(['Báo cáo','Thời điểm','Định dạng','Trạng thái','Tệp'], display) : empty);
    if (reportMeta) get('report-list').append(pager(reportMeta, async page => {
      pageNumber = page;
      try { await loadReports(); } catch (error) { historyFeedback.textContent = error.message; }
    }));
  }
  async function loadReports() {
    const current = ++historyRequest;
    const query = new URLSearchParams({ page: pageNumber, limit: 20, type: historyFilter.value });
    const result = await reportApi.list(query);
    if (current !== historyRequest) return;
    history = result.data;
    reportMeta = result.meta;
    renderHistory();
    historyFeedback.textContent = '';
  }
  historyFilter.addEventListener('change', () => {
    pageNumber = 1;
    loadReports().catch(error => { historyFeedback.textContent = error.message; });
  });
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
      const result = await reportApi.create(data);
      if (historyFilter.value) historyFilter.value = data.type;
      pageNumber = 1;
      await loadReports();
      return result.status === 'READY' ? 'Đã tạo báo cáo. Bấm Tải tệp trong lịch sử.' : 'Tạo báo cáo thất bại.';
    });
  });
  field('from').disabled = field('to').disabled = field('type').value !== 'TECHNICAL';
  if (can('reporting.write')) reportApi.options().then(data => {
    options = data;
    field('experiment').replaceChildren(...(options.experiments || []).map(item =>
      new Option(`${item.experiment_code} · ${item.title}`, item.experiment_id)));
    form.querySelector('button').disabled = !field('experiment').value;
    if (!field('experiment').value) status.textContent = 'Chưa có thí nghiệm để tạo báo cáo.';
    scope();
  }).catch(error => { status.textContent = error.message; });
  else form.hidden = true;
  loadReports().catch(error => { historyFeedback.textContent = error.message; });
  reportApi.kpis().then(rows => {
    const format = value => value == null ? '—' : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 4 });
    get('report-kpis').replaceChildren(table(
      ['Chỉ tiêu', 'Mục tiêu', 'Hiện tại', 'Kết quả', 'Kết quả lưu gần nhất'],
      rows.map(row => [row.name_vi, `${format(row.target_value)} ${row.unit ?? ''}`,
        format(row.current_value), row.passed == null ? '—' : row.passed ? 'Đạt' : 'Chưa đạt', format(row.measured_value)]),
    ));
  }).catch(error => { get('kpi-status').textContent = error.message; });
}

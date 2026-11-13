import { el, paintSqiClass } from './workspace.js';

const get = id => document.getElementById(id);
const plot = get('plot');
const definition = get('definition');
const from = get('from');
const to = get('to');
const day = get('day');
const chart = get('chart');
const chartRegion = get('chart-region');
const tooltip = get('chart-tooltip');
const format = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 });
const number = value => value == null ? '—' : format.format(value);
const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'UTC' });
const millis = date => Date.parse(date + 'T00:00:00Z');
const displayDate = date => dateFormat.format(millis(date));
let catalog = [];
let scores = [];
let points = [];
let scoresRequest;
let detailRequest;

async function read(path, signal) {
  const response = await fetch(path, { signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function dates() {
  const row = catalog.find(row => row.plot_id === plot.value && row.definition_id === definition.value);
  from.value = row.first_day;
  to.value = row.last_day;
}

function definitions() {
  definition.replaceChildren(...catalog.filter(row => row.plot_id === plot.value)
    .map(row => new Option(row.version_code, row.definition_id)));
  dates();
}

function svg(tag, attributes, text) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text) element.textContent = text;
  return element;
}

function draw() {
  const width = chart.clientWidth;
  const height = chart.clientHeight;
  if (!scores.length || !width || !height) return;
  const left = 37;
  const right = width - 14;
  const bottom = height - 28;
  const top = 12;
  chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const defs = svg('defs', {});
  const gradient = svg('linearGradient', { id: 'sqi-area-fill', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
  gradient.append(svg('stop', { offset: '0%', 'stop-color': '#0D9488', 'stop-opacity': '.28' }),
    svg('stop', { offset: '100%', 'stop-color': '#0D9488', 'stop-opacity': '.025' }));
  defs.append(gradient);
  chart.replaceChildren(defs);
  for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
    const y = bottom - tick * (bottom - top);
    chart.append(svg('text', { x: 0, y: y + 4, fill: '#475569', 'font-size': 11 }, number(tick)),
      svg('line', { x1: left, y1: y, x2: right, y2: y, stroke: '#E2E8F0' }));
  }
  const first = millis(scores[0].day);
  const span = millis(scores.at(-1).day) - first;
  points = scores.map(row => ({
    x: span ? left + (millis(row.day) - first) / span * (right - left) : (left + right) / 2,
    y: bottom - Number(row.sqi_value) * (bottom - top),
  }));
  const start = points[0];
  const end = points.at(-1);
  let line = `M${start.x},${start.y}`;
  for (let index = 1; index < points.length; index++) {
    const before = points[index - 1];
    const next = points[index];
    const center = (before.x + next.x) / 2;
    line += ` C${center},${before.y} ${center},${next.y} ${next.x},${next.y}`;
  }
  chart.append(svg('path', { d: `${line} L${end.x},${bottom} H${start.x} Z`, fill: 'url(#sqi-area-fill)' }),
    svg('path', { d: line, fill: 'none', stroke: '#0D9488', 'stroke-width': 2.5 }));
  const ticks = Math.min(scores.length, width < 450 ? 2 : 5);
  for (let tick = 0; tick < ticks; tick++) {
    const index = ticks === 1 ? 0 : Math.round(tick * (scores.length - 1) / (ticks - 1));
    const anchor = ticks === 1 ? 'middle' : tick === 0 ? 'start' : tick === ticks - 1 ? 'end' : 'middle';
    chart.append(svg('text', { x: points[index].x, y: height - 6, fill: '#475569',
      'font-size': 11, 'text-anchor': anchor }, displayDate(scores[index].day)));
  }
  const selected = points[day.selectedIndex];
  chart.append(svg('line', { x1: selected.x, y1: top, x2: selected.x, y2: bottom, stroke: '#5EEAD4', 'stroke-dasharray': '4 4' }),
    svg('circle', { cx: selected.x, cy: selected.y, r: 5, fill: '#0D9488', stroke: '#fff', 'stroke-width': 2 }));
}

function pointAt(event) {
  if (!points.length) return -1;
  const x = event.clientX - chart.getBoundingClientRect().left;
  return points.reduce((best, point, index) =>
    Math.abs(point.x - x) < Math.abs(points[best].x - x) ? index : best, 0);
}

function indicatorScore(score) {
  if (score == null) return '—';
  const value = Number(score);
  const cell = el('span');
  cell.className = 'indicator-score';
  const track = el('span');
  track.className = 'indicator-track';
  track.setAttribute('aria-hidden', 'true');
  const fill = el('span');
  fill.className = 'indicator-fill';
  fill.dataset.tone = value < 0.3 ? 'low' : value > 0.7 ? 'high' : 'medium';
  fill.style.width = `${Math.min(1, Math.max(0, value)) * 100}%`;
  track.append(fill);
  cell.append(track, el('span', number(value)));
  return cell;
}

async function detail() {
  detailRequest?.abort();
  const controller = new AbortController();
  detailRequest = controller;
  const row = scores[day.selectedIndex];
  if (!row) return;
  const indicators = get('indicators');
  get('details').hidden = false;
  get('selected-score').hidden = false;
  get('selected-date').textContent = displayDate(row.day);
  get('selected-value').textContent = number(row.sqi_value);
  paintSqiClass(get('selected-class'), row.health_class);
  get('summary').textContent = `${displayDate(row.day)} · Độ phủ ${number(row.coverage_pct)}%`;
  get('detail-status').textContent = 'Đang tải chi tiết…';
  indicators.replaceChildren();
  draw();
  try {
    const result = await read(`/sqi/scores/${row.sqi_score_id}`, controller.signal);
    if (controller.signal.aborted) return;
    get('detail-status').textContent = result.indicators.length ? '' : 'Điểm này chưa có chi tiết chỉ tiêu.';
    for (const item of result.indicators) {
      const tr = indicators.insertRow();
      const value = item.raw_value == null ? '—' : `${number(item.raw_value)} ${item.unit}`;
      const badge = el('span', item.source === 'LAB' ? 'Phòng thí nghiệm' : 'Cảm biến');
      badge.className = 'sqi-badge';
      badge.dataset.tone = item.source;
      for (const content of [item.name, badge, value, indicatorScore(item.score), number(item.weight), number(item.weighted_score)]) {
        tr.insertCell().append(content);
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) get('detail-status').textContent = error.message;
  }
}

async function loadScores() {
  scoresRequest?.abort();
  detailRequest?.abort();
  const controller = new AbortController();
  scoresRequest = controller;
  const status = get('status');
  scores = [];
  points = [];
  chartRegion.hidden = tooltip.hidden = get('selected-score').hidden = get('day-label').hidden = get('details').hidden = true;
  status.textContent = 'Đang tải điểm SQI…';
  const query = new URLSearchParams({
    plotId: plot.value, definitionId: definition.value, from: from.value, to: to.value,
  });
  document.dispatchEvent(new CustomEvent('sqi-selection', { detail: definition.value }));
  try {
    const result = await read(`/sqi/scores?${query}`, controller.signal);
    if (controller.signal.aborted) return;
    scores = result;
    status.textContent = scores.length ? '' : 'Không có điểm SQI trong khoảng ngày đã chọn.';
    if (!scores.length) return;
    day.replaceChildren(...scores.map(row => new Option(`${displayDate(row.day)} · ${number(row.sqi_value)}`, row.sqi_score_id)));
    day.selectedIndex = scores.length - 1;
    chartRegion.hidden = get('day-label').hidden = false;
    await detail();
  } catch (error) {
    if (!controller.signal.aborted) status.textContent = error.message;
  }
}

get('filters').addEventListener('submit', event => {
  event.preventDefault();
  void loadScores();
});
plot.addEventListener('change', () => { definitions(); void loadScores(); });
definition.addEventListener('change', () => { dates(); void loadScores(); });
day.addEventListener('change', detail);
chart.addEventListener('click', event => {
  const index = pointAt(event);
  if (index < 0 || index === day.selectedIndex) return;
  day.selectedIndex = index;
  void detail();
});
chart.addEventListener('pointermove', event => {
  const index = pointAt(event);
  const row = scores[index];
  if (!row) return;
  tooltip.textContent = `${displayDate(row.day)} · SQI ${number(row.sqi_value)} · ${row.health_class}`;
  tooltip.hidden = false;
  tooltip.style.left = `${Math.max(0, Math.min(points[index].x + 10, chart.clientWidth - tooltip.offsetWidth))}px`;
  tooltip.style.top = `${Math.max(0, points[index].y - tooltip.offsetHeight - 10)}px`;
});
chart.addEventListener('pointerleave', () => { tooltip.hidden = true; });
new ResizeObserver(draw).observe(chart);

const tabs = [get('monitor-tab'), get('config-tab')];
function showTab(selected) {
  tooltip.hidden = true;
  for (const tab of tabs) {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    get(tab.getAttribute('aria-controls')).hidden = !active;
  }
  if (selected === tabs[0]) draw();
}
for (const tab of tabs) {
  tab.addEventListener('click', () => showTab(tab));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs.find(item => item !== tab);
    showTab(target);
    target.focus();
  });
}

async function loadCatalog() {
  try {
    const selectedPlot = plot.value;
    const selectedDefinition = definition.value;
    catalog = await read('/sqi/plots');
    if (catalog.length) {
      const options = new Map(catalog.map(row => [row.plot_id, `${row.site_code} / ${row.plot_code}`]));
      plot.replaceChildren(...Array.from(options, ([id, label]) => new Option(label, id)));
      if (options.has(selectedPlot)) plot.value = selectedPlot;
      definitions();
      if (Array.from(definition.options).some(option => option.value === selectedDefinition)) {
        definition.value = selectedDefinition;
        dates();
      }
      get('submit').disabled = false;
      await loadScores();
    } else {
      get('status').textContent = 'Database chưa có điểm SQI. Nạp dữ liệu demo hoặc chạy job tính SQI.';
    }
  } catch (error) {
    get('status').textContent = error.message;
  }
}
document.addEventListener('sqi-reload', () => void loadCatalog());
await loadCatalog();


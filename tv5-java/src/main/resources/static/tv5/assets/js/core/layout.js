import { can, logout } from '../api/auth-api.js';
import { sharedTheme } from '../theme/shared-theme.js';
import { presentation } from '../theme/presentation.js';

// Match the group dashboard without requiring React for TV5 pages.
const navigation = [
  ['Tổng quan', '/', 'Dashboard', 'reporting.read'],
  ['Giám sát', '/map', 'Bản đồ khu thí nghiệm', 'iot.read'],
  ['Giám sát', '/monitoring', 'Monitoring cảm biến', 'iot.read'],
  ['Nông học', '/experiments', 'Thí nghiệm & nghiệm thức', 'experiment.read'],
  ['Nông học', '/biochar', 'Biochar & làm giàu', 'biochar.read'],
  ['Nông học', '/laboratory', 'Dữ liệu phòng thí nghiệm', 'laboratory.read'],
  ['Dữ liệu & AI', '/data-quality', 'Data Quality & Audit', 'data_quality.read'],
  ['Dữ liệu & AI', '/dataset', 'Dataset & Labeling', 'dataset.read'],
  ['Dữ liệu & AI', '/tv5/sqi', 'Sức khỏe đất – SQI', 'sqi.read'],
  ['Dữ liệu & AI', '/ml', 'Embedded ML', 'ml.read'],
  ['Vận hành', '/ota', 'OTA & Edge Gateway', 'ota.read'],
  ['Vận hành', '/tv5/alerts', 'Cảnh báo & quyết định', 'alert.read'],
  ['Vận hành', '/tv5/reports', 'Báo cáo', 'reporting.read'],
  ['Quản trị', '/admin', 'Quản trị hệ thống', 'iam.read'],
];
function node(tag, className, text) {
  const result = document.createElement(tag); result.className = className || '';
  if (text) result.textContent = text;
  return result;
}
function tabs(header, items) {
  const bar = node('div', 'page-tabs'); bar.setAttribute('role', 'tablist');
  for (const [text, panels] of items) {
    const button = node('button', 'btn', text);
    button.type = 'button'; button.setAttribute('role', 'tab');
    button.addEventListener('click', () => {
      for (const child of bar.children) {
        const selected = child === button;
        child.classList.toggle('btn-primary', selected);
        child.setAttribute('aria-selected', String(selected)); child.tabIndex = selected ? 0 : -1;
      }
      for (const [, sections] of items) for (const section of sections) section.hidden = !panels.includes(section);
    });
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...bar.children];
      const target = event.key === 'Home' ? buttons[0] : event.key === 'End' ? buttons.at(-1) : buttons.find(item => item !== button);
      target.click(); target.focus();
    });
    bar.append(button);
  }
  header.append(bar); bar.firstElementChild.click();
}
export function mount(user, screen, title, markup) {
  const style = node('style'); style.textContent = sharedTheme + presentation; document.head.append(style);
  const shell = node('div', 'shell'); const sidebar = node('aside', 'sidebar');
  const brand = node('a', 'brand'); brand.href = '/';
  const brandText = node('span');
  brandText.append(node('strong', '', 'Edge-AIoT'), node('small', '', 'Sức khỏe đất · Biochar'));
  brand.append(node('span', 'brand-mark', '🌱'), brandText); sidebar.append(brand);
  const menu = node('nav'); menu.setAttribute('aria-label', 'Điều hướng dự án');
  for (const group of [...new Set(navigation.map(item => item[0]))]) {
    const entries = navigation.filter(item => item[0] === group && can(item[3]));
    if (!entries.length) continue;
    const section = node('div', 'nav-group'); section.append(node('div', 'nav-group-title', group));
    for (const [, path, text] of entries) {
      const active = path === '/tv5/' + screen;
      const link = node('a', 'nav-item' + (active ? ' active' : ''), text); link.href = path;
      if (active) link.setAttribute('aria-current', 'page'); section.append(link);
    }
    menu.append(section);
  }
  sidebar.append(menu);
  const main = node('div', 'main'); const topbar = node('header', 'topbar');
  const userBox = node('div', 'user-box'); const profile = node('a', 'user-link'); profile.href = '/account';
  const userText = node('span');
  userText.append(node('strong', '', user.fullName || user.username), node('small', '', user.roles?.join(', ') || 'Chưa có vai trò'));
  profile.append(node('span', 'avatar', (user.fullName || user.username).trim().charAt(0).toUpperCase()), userText);
  const signOut = node('button', 'btn btn-sm', 'Đăng xuất'); signOut.addEventListener('click', logout);
  userBox.append(profile, signOut); topbar.append(node('div'), userBox);
  const content = node('div', 'content'); const template = node('template'); template.innerHTML = markup;
  content.append(template.content.cloneNode(true));
  const page = content.querySelector('main'); page.className = 'tv5-page';
  const header = page.querySelector(':scope > header'); header.className = 'page-header';
  header.querySelector('h1').textContent = title; header.querySelector('nav')?.remove();
  for (const svg of page.querySelectorAll('h2 svg')) svg.remove();
  for (const element of page.querySelectorAll('.sqi-card, .alert-panel, .report-card')) element.classList.add('card');
  if (screen === 'sqi') restoreSqi(page, header);
  if (screen === 'alerts') restoreAlerts(page, header);
  if (screen === 'reports') restoreReports(page);
  main.append(topbar, content); shell.append(sidebar, main); document.body.append(shell);
}
function restoreSqi(page, header) {
  header.append(page.querySelector('.sqi-tabs'));
  for (const [id, text] of [['monitor-tab', 'Giám sát'], ['config-tab', 'Cấu hình SQI']]) page.querySelector('#' + id).textContent = text;
  const filters = page.querySelector('#filters');
  const selection = node('section', 'card'); selection.append(node('h2', '', 'Chọn ô đất và phiên bản'));
  const choices = node('div', 'grid-2');
  for (const id of ['plot', 'definition']) choices.append(page.querySelector('#' + id).closest('label'));
  selection.append(choices); filters.before(selection);
  const chartCard = page.querySelector('#chart-region').closest('section');
  chartCard.querySelector('h2').textContent = 'Diễn biến SQI theo ngày';
  filters.className = 'tv5-date-range'; page.querySelector('#submit').textContent = 'Áp dụng';
  chartCard.querySelector('h2').parentElement.after(filters);
  filters.after(page.querySelector('#selected-score'));
  const chartLayout = node('div', 'tv5-chart-layout'); const chart = page.querySelector('#chart-region');
  chart.before(chartLayout); chartLayout.append(chart, page.querySelector('#details'));
  page.querySelector('#details').classList.remove('card', 'sqi-card');
  page.querySelector('#comparison').closest('section').querySelector('h2').textContent = 'So sánh theo nghiệm thức';
}
function restoreAlerts(page, header) {
  const summary = page.querySelector('[aria-label="Tổng quan cảnh báo"]'); summary.className = 'grid-3';
  for (const [index, card] of [...summary.querySelectorAll('article')].entries()) {
    card.className = 'stat' + (index === 1 ? ' stat-warn' : index === 2 ? ' stat-ok' : '');
    card.firstElementChild.className = 'stat-label'; card.lastElementChild.className = 'stat-value';
  }
  const listCard = page.querySelector('#alert-list').closest('section');
  const evaluate = page.querySelector('#evaluate').closest('section');
  const rules = page.querySelector('#rule-form').closest('section'); rules.classList.add('card');
  const listPanel = node('div'); listPanel.id = 'alert-list-panel';
  const rulePanel = node('div'); rulePanel.id = 'alert-rules-panel';
  page.append(listPanel, rulePanel); listPanel.append(summary, listCard); rulePanel.append(evaluate, rules);
  const oldGrid = [...page.children].find(item => item.tagName === 'DIV' && item.classList.contains('grid'));
  oldGrid?.remove();
  const detail = node('div'); detail.id = 'alert-detail'; listPanel.append(detail);
  const ruleTable = node('div'); ruleTable.id = 'rule-list';
  rules.querySelector('h2').textContent = 'Luật cảnh báo'; rules.querySelector('h2').after(ruleTable);
  const editor = page.querySelector('#rule-form'); editor.hidden = true;
  restoreRuleEditor(editor);
  const add = node('button', 'btn', 'Thêm luật'); add.type = 'button'; add.hidden = !can('alert.write');
  add.addEventListener('click', () => {
    const choice = page.querySelector('#rule-choice'); choice.value = ''; choice.dispatchEvent(new Event('change')); editor.hidden = false;
  });
  ruleTable.before(add);
  tabs(header, [['Danh sách cảnh báo', [listPanel]], ['Luật cảnh báo', [rulePanel]]]);
}
function restoreRuleEditor(form) {
  const field = name => form.elements.namedItem(name);
  const fields = node('div', 'grid-3');
  for (const name of ['code', 'name', 'source', 'condition', 'parameter', 'low', 'high', 'classes', 'windowMinutes', 'cooldownMinutes']) {
    fields.append(field(name).closest('label'));
  }
  const severityRadios = field('severity');
  const severity = node('select'); severity.id = 'rule-severity-picker';
  for (const [value, title] of [['LOW', 'Thấp'], ['MEDIUM', 'Trung bình'], ['HIGH', 'Cao'], ['CRITICAL', 'Khẩn cấp']]) severity.add(new Option(title, value));
  const severityLabel = node('label', '', 'Mức độ'); severityLabel.append(severity); fields.append(severityLabel);
  severity.addEventListener('change', () => { severityRadios.value = severity.value; form.dispatchEvent(new Event('input')); });
  const retained = node('div'); retained.hidden = true;
  retained.append(field('rule')?.closest('label') || form.querySelector('#rule-choice').closest('label'));
  for (const radio of [...severityRadios]) retained.append(radio.closest('label'));
  for (const id of ['rule-preview', 'rule-preview-cooldown', 'rule-preview-recommendation']) retained.append(form.querySelector('#' + id));
  const recommendation = field('recommendation').closest('label');
  const active = field('active').closest('label'); active.className = 'check';
  const save = form.querySelector('#rule-save');
  const feedback = form.querySelector('#rule-feedback');
  const controls = node('fieldset'); controls.disabled = !can('alert.write'); controls.append(fields, recommendation, active, save);
  const heading = node('div', 'card-head'); heading.append(node('h3', '', 'Thiết lập luật cảnh báo'));
  const close = node('button', 'btn', 'Đóng'); close.type = 'button'; close.addEventListener('click', () => { form.hidden = true; });
  heading.append(close);
  form.replaceChildren(heading, controls, retained, feedback);
}
function restoreReports(page) {
  const grid = page.querySelector(':scope > div'); if (grid) grid.replaceWith(...grid.children);
  page.querySelector('header p').textContent = 'Tổng hợp kết quả thí nghiệm và theo dõi KPI.';
  page.querySelector('[name="type"]').value = 'TECHNICAL';
  for (const id of ['report-from', 'report-to']) { page.querySelector('#' + id).hidden = false; page.querySelector('#' + id + ' input').disabled = false; }
  page.querySelector('#report-form button').textContent = 'Tạo báo cáo';
  page.querySelector('#report-form fieldset legend').textContent = 'Định dạng tệp';
}

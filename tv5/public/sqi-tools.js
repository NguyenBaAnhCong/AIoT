import { action, api, el, get, paintSqiClass, table, task } from './workspace.js';

const feedback = get('sqi-feedback');
const comparisonStatus = get('comparison-status');
const comparisonTable = get('comparison');
let comparisonRequest = 0;

async function compare(id) {
  if (!id) return;
  const request = ++comparisonRequest;
  comparisonStatus.textContent = 'Đang tải so sánh…';
  comparisonTable.replaceChildren();
  try {
    const rows = await api(`/sqi/comparison?definitionId=${id}`);
    if (request !== comparisonRequest) return;
    comparisonStatus.textContent = rows.length ? '' : 'Phiên bản này chưa có điểm theo nghiệm thức.';
    if (rows.length) {
      const best = Math.max(...rows.map(row => Number(row.mean_sqi)));
      const grid = table(
        ['Nghiệm thức','Liều biochar (kg/m²)','Số ô-ngày','SQI trung bình','Thấp nhất','Cao nhất','Lớp phổ biến'],
        rows.map(row => {
          const badge = el('span');
          badge.className = 'sqi-badge';
          return [`${row.treatment_code} · ${row.treatment_name}`, row.biochar_dose_kg_m2,
            row.n_days, row.mean_sqi, row.min_sqi, row.max_sqi, paintSqiClass(badge, row.dominant_class)];
        }),
      );
      rows.forEach((row, index) => {
        if (Number(row.mean_sqi) === best) grid.tBodies[0].rows[index].className = 'sqi-best-row';
      });
      comparisonTable.append(grid);
    }
  } catch (error) {
    if (request === comparisonRequest) comparisonStatus.textContent = error.message;
  }
}
document.addEventListener('sqi-selection', event => void compare(event.detail));
void compare(get('definition').value);

function label(text, field) {
  const node = el('label', text);
  node.append(field);
  return node;
}
function input(type) {
  const field = el('input');
  field.type = type;
  field.required = true;
  return field;
}
function numberField(value, min, max) {
  const field = input('number');
  field.step = 'any';
  field.value = value ?? '';
  if (min != null) field.min = min;
  if (max != null) field.max = max;
  return field;
}

function selectField(items, value) {
  const field = el('select');
  field.required = true;
  field.append(new Option('Chọn…', ''), ...items.map(({ code, name }) => new Option(name, code)));
  field.value = value ?? '';
  return field;
}

const sources = [
  { code: 'SENSOR', name: 'Cảm biến' },
  { code: 'LAB', name: 'Phòng thí nghiệm' },
];
const methods = [
  { code: 'MORE_IS_BETTER', name: 'Càng cao càng tốt' },
  { code: 'LESS_IS_BETTER', name: 'Càng thấp càng tốt' },
  { code: 'OPTIMUM', name: 'Tốt nhất trong khoảng' },
];

function indicatorFields(value, parameters) {
  return [
    ['parameter_code', 'Chỉ tiêu', selectField(parameters, value.parameter_code)],
    ['source', 'Nguồn', selectField(sources, value.source ?? 'SENSOR')],
    ['scoring_function', 'Cách tính điểm', selectField(methods, value.scoring_function ?? 'MORE_IS_BETTER')],
    ['weight', 'Trọng số', numberField(value.weight, 0.0001, 1)],
    ['lower_limit', 'Giới hạn dưới', numberField(value.lower_limit)],
    ['upper_limit', 'Giới hạn trên', numberField(value.upper_limit)],
    ['optimum_low', 'Tối ưu từ', numberField(value.optimum_low)],
    ['optimum_high', 'Tối ưu đến', numberField(value.optimum_high)],
  ];
}

function classFields(value, labels) {
  return [
    ['class_code', 'Mức sức khỏe đất', selectField(labels, value.class_code)],
    ['min_value', 'Từ điểm (bao gồm)', numberField(value.min_value, 0, 1)],
    ['max_value', 'Đến điểm (cận trên)', numberField(value.max_value, 0, 1.0001)],
  ];
}

function editor(heading, addLabel, removeLabel, fieldsFor, limit) {
  const field = el('fieldset');
  field.className = 'sqi-editor';
  const list = el('div');
  list.className = 'sqi-editor-list';
  const add = el('button', addLabel);
  add.type = 'button';
  add.className = 'sqi-secondary';
  const rows = new Map();
  const sync = () => {
    add.disabled = rows.size >= limit;
    for (const { remove } of rows.values()) remove.disabled = rows.size === 1;
  };
  function append(value = {}) {
    const row = el('details');
    row.className = 'sqi-editor-row';
    const fields = fieldsFor(value);
    const choice = fields[0][2];
    const title = el('summary');
    const updateTitle = () => {
      title.textContent = choice.value ? choice.selectedOptions[0].textContent : 'Chọn mục để cấu hình';
    };
    choice.addEventListener('change', updateTitle);
    updateTitle();
    const grid = el('div');
    grid.className = 'rule-fields';
    for (const [, title, control] of fields) grid.append(label(title, control));
    const controls = Object.fromEntries(fields.map(([key, , control]) => [key, control]));
    if (controls.scoring_function) {
      const toggleOptimum = () => {
        const show = controls.scoring_function.value === 'OPTIMUM';
        for (const control of [controls.optimum_low, controls.optimum_high]) {
          control.closest('label').hidden = !show;
          control.disabled = !show;
        }
      };
      controls.scoring_function.addEventListener('change', toggleOptimum);
      toggleOptimum();
    }
    const remove = el('button', removeLabel);
    remove.type = 'button';
    remove.className = 'sqi-secondary';
    remove.addEventListener('click', () => {
      rows.delete(row);
      row.remove();
      sync();
      add.focus();
    });
    const content = el('div');
    content.className = 'sqi-editor-content';
    content.append(grid, remove);
    row.append(title, content);
    rows.set(row, { fields, remove });
    list.append(row);
    sync();
    return { row, choice };
  }
  add.addEventListener('click', () => {
    const { row, choice } = append();
    row.open = true;
    choice.focus();
  });
  field.append(el('legend', heading), list, add);
  return {
    field,
    set(values) {
      rows.clear();
      list.replaceChildren();
      for (const value of values.length ? values : [{}]) append(value);
    },
    read() {
      return [...rows.values()].map(({ fields }) => Object.fromEntries(fields.map(([key, , control]) => [
        key, control.disabled ? null : control.type === 'number' ? control.valueAsNumber : control.value,
      ])));
    },
  };
}

async function show(preferred) {
  const config = await api('/sqi/configuration');
  const { definitions, datasets } = config;
  // A browser can load this script before the running server has been restarted.
  const catalogFromDefinitions = (list, key) => [...new Set(
    definitions.flatMap(item => (item[list] || []).map(entry => entry[key])),
  )].map(code => ({ code, name: code }));
  const parameters = config.parameters ?? catalogFromDefinitions('indicators', 'parameter_code');
  const labels = config.labels ?? catalogFromDefinitions('classes', 'class_code');
  const definition = el('select');
  const dataset = el('select');
  definition.replaceChildren(...definitions.map(item => new Option(
    `${item.version_code} · ${item.status}`, item.definition_id,
  )));
  dataset.replaceChildren(...datasets.map(item => new Option(
    `${item.dataset_code} v${item.version_no} · ${item.status}`, item.dataset_version_id,
  )));
  if (preferred) definition.value = preferred;
  const labelData = el('input');
  labelData.type = 'checkbox';
  const labelField = label('Gán nhãn dataset', labelData);
  labelField.className = 'check';
  const run = action('Tính điểm', feedback, async () => {
    const result = await api('/sqi/calculate', 'POST', {
      definition: definition.value, dataset: dataset.value, label: labelData.checked,
    });
    document.dispatchEvent(new Event('sqi-reload'));
    return `Đã tính ${result.scores} điểm${result.labels == null ? '' : `, gán ${result.labels} nhãn`}.`;
  });
  const activate = action('Kích hoạt phiên bản nháp', feedback, async () => {
    await api(`/sqi/definitions/${definition.value}/activate`, 'POST', {});
    await show(definition.value);
    document.dispatchEvent(new Event('sqi-reload'));
    return 'Đã kích hoạt phiên bản SQI.';
  });
  const actions = el('form');
  actions.className = 'sqi-panel-body';
  actions.addEventListener('submit', event => event.preventDefault());
  const runFields = el('div');
  runFields.className = 'rule-fields';
  runFields.append(label('Phiên bản để tính', definition), label('Dataset đã build', dataset), labelField);
  const runButtons = el('div');
  runButtons.className = 'actions sqi-panel-actions';
  runButtons.append(run, activate);
  actions.append(runFields, runButtons);
  const create = el('form');
  create.className = 'sqi-panel-body';
  create.addEventListener('invalid', event => {
    const row = event.target.closest('.sqi-editor-row');
    if (row) row.open = true;
  }, true);
  const code = input('text');
  code.maxLength = 32;
  const name = input('text');
  name.maxLength = 255;
  const coverage = input('number');
  coverage.min = 0;
  coverage.max = 100;
  coverage.step = '0.01';
  const indicators = editor('Chỉ tiêu và trọng số', 'Thêm chỉ tiêu', 'Xóa chỉ tiêu',
    value => indicatorFields(value, parameters), 50);
  const classes = editor('Ngưỡng phân loại', 'Thêm mức', 'Xóa mức',
    value => classFields(value, labels), Math.max(1, labels.length));
  classes.field.append(el('small', 'Đặt cận trên của mức cuối là 1,0001 để bao gồm điểm 1.'));
  const save = el('button', 'Tạo phiên bản nháp');
  const info = el('fieldset');
  info.className = 'grid gap-2';
  const infoFields = el('div');
  infoFields.className = 'rule-fields';
  infoFields.append(label('Mã phiên bản mới', code), label('Tên phiên bản mới', name),
    label('Độ phủ tối thiểu (%)', coverage));
  const infoTitle = el('legend', 'Thông tin phiên bản mới');
  infoTitle.className = 'mb-2 text-sm font-semibold text-slate-700';
  info.append(infoTitle, infoFields);
  const createGrid = el('div');
  createGrid.className = 'sqi-create-grid';
  createGrid.append(indicators.field, classes.field);
  const saveRow = el('div');
  saveRow.className = 'actions sqi-panel-actions';
  saveRow.append(save);
  create.append(info, createGrid, saveRow);
  function fill() {
    const current = definitions.find(item => item.definition_id === definition.value);
    const target = datasets.find(item => item.dataset_version_id === dataset.value);
    labelData.disabled = current?.status !== 'ACTIVE' || target?.status !== 'BUILT';
    if (labelData.disabled) labelData.checked = false;
    run.disabled = !current || !target || current.status === 'RETIRED';
    activate.disabled = current?.status !== 'DRAFT';
  }
  function copy() {
    const current = definitions.find(item => item.definition_id === definition.value);
    coverage.value = current?.min_indicator_coverage_pct ?? 70;
    indicators.set(current?.indicators || []);
    classes.set(current?.classes || []);
    fill();
  }
  definition.addEventListener('change', copy);
  dataset.addEventListener('change', fill);
  copy();
  create.addEventListener('submit', event => {
    event.preventDefault();
    void task(save, feedback, async () => {
      const result = await api('/sqi/definitions', 'POST', {
        code: code.value, name: name.value, coverage: Number(coverage.value),
        indicators: indicators.read(), classes: classes.read(),
      });
      await show(result.definition_id);
      return 'Đã tạo phiên bản nháp. Chọn dataset và tính điểm trước khi kích hoạt.';
    });
  });
  const options = el('section');
  options.className = 'sqi-card';
  options.append(el('h2', 'Tạo phiên bản mới'), create);
  const calculation = el('section');
  calculation.className = 'sqi-card';
  calculation.append(el('h2', 'Tính điểm, gán nhãn và kích hoạt'), actions);
  get('sqi-tools').replaceChildren(calculation, options);
}
show().catch(error => { feedback.textContent = error.message; });

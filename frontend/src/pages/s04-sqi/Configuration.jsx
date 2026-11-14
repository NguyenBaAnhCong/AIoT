import { useState } from 'react';
import DataTable from '../../components/DataTable';
import { Button, Card, Field } from '../../components/ui';
import { api } from '../../lib/api';
import { apiRoot, columns, Options } from '../tv5/shared';

const sqi = apiRoot + '/sqi';
const numberFields = [
  ['lower_limit', 'Cận dưới'], ['upper_limit', 'Cận trên'], ['weight', 'Trọng số'],
  ['optimum_low', 'Tối ưu từ'], ['optimum_high', 'Tối ưu đến'],
];
const scoring = [['MORE_IS_BETTER', 'Càng cao càng tốt'], ['LESS_IS_BETTER', 'Càng thấp càng tốt'], ['OPTIMUM', 'Khoảng tối ưu']];
let nextRowKey = 0;
const withId = rows => (rows ?? []).map(row => ({ ...row, key: ++nextRowKey }));

function DefinitionForm({ version, data, action, refresh }) {
  const [indicators, setIndicators] = useState(() => withId(version?.indicators));
  const [classes, setClasses] = useState(() => withId(version?.classes));
  const update = (setRows, key, field, value) => setRows(rows => rows.map(row => row.key === key ? { ...row, [field]: value } : row));
  const remove = (setRows, key) => setRows(rows => rows.filter(row => row.key !== key));
  return <Card title="Tạo phiên bản SQI nháp">
    <form onSubmit={event => {
      event.preventDefault();
      const { code, name, coverage } = Object.fromEntries(new FormData(event.currentTarget));
      action.run(async () => {
        await api.post(sqi + '/definitions', { code, name, coverage: Number(coverage), indicators, classes });
        await refresh();
        return 'Đã tạo phiên bản nháp.';
      });
    }}>
      <div className="grid-3">
        <Field label="Mã phiên bản mới"><input name="code" required maxLength={32} /></Field>
        <Field label="Tên phiên bản mới"><input name="name" required maxLength={255} /></Field>
        <Field label="Độ phủ tối thiểu (%)"><input name="coverage" type="number" required min="0" max="100" step="any" defaultValue={version?.min_indicator_coverage_pct ?? 70} /></Field>
      </div>
      <fieldset><legend>Chỉ tiêu và trọng số</legend>
        {indicators.map(row => <div className="grid-3" key={row.key}>
          <Field label="Chỉ tiêu"><select required value={row.parameter_code ?? ''} onChange={e => update(setIndicators, row.key, 'parameter_code', e.target.value)}>
            <Options blank="Chọn chỉ tiêu" values={data.parameters.map(p => [p.code, p.name])} />
          </select></Field>
          <Field label="Nguồn"><select value={row.source} onChange={e => update(setIndicators, row.key, 'source', e.target.value)}><Options values={[[ 'SENSOR', 'Cảm biến' ], ['LAB', 'Phòng thí nghiệm']]} /></select></Field>
          <Field label="Cách chấm"><select value={row.scoring_function} onChange={e => update(setIndicators, row.key, 'scoring_function', e.target.value)}><Options values={scoring} /></select></Field>
          {numberFields.filter(([key]) => !key.startsWith('optimum') || row.scoring_function === 'OPTIMUM').map(([key, label]) =>
            <Field label={label} key={key}><input required type="number" step="any" value={row[key] ?? ''} onChange={e => update(setIndicators, row.key, key, e.target.value === '' ? null : e.target.valueAsNumber)} /></Field>)}
          <div><Button type="button" onClick={() => remove(setIndicators, row.key)}>Xóa chỉ tiêu</Button></div>
        </div>)}
        <Button type="button" disabled={indicators.length >= 50} onClick={() => setIndicators(rows => [...rows, ...withId([{ source: 'SENSOR', scoring_function: 'MORE_IS_BETTER' }])])}>Thêm chỉ tiêu</Button>
      </fieldset>
      <fieldset><legend>Ngưỡng phân loại</legend>
        <p className="muted">Đặt cận trên của mức cuối là 1,0001 để bao gồm điểm 1.</p>
        {classes.map(row => <div className="grid-3" key={row.key}>
          <Field label="Phân loại"><select required value={row.class_code ?? ''} onChange={e => update(setClasses, row.key, 'class_code', e.target.value)}>
            <Options blank="Chọn phân loại" values={data.labels.map(p => [p.code, p.name])} />
          </select></Field>
          {[['min_value', 'Từ'], ['max_value', 'Đến']].map(([key, label]) => <Field label={label} key={key}>
            <input type="number" required step="any" value={row[key] ?? ''} onChange={e => update(setClasses, row.key, key, e.target.value === '' ? null : e.target.valueAsNumber)} />
          </Field>)}
          <div><Button type="button" onClick={() => remove(setClasses, row.key)}>Xóa mức</Button></div>
        </div>)}
        <Button type="button" disabled={classes.length >= data.labels.length} onClick={() => setClasses(rows => [...rows, ...withId([{}])])}>Thêm mức</Button>
      </fieldset>
      <Button variant="primary" loading={action.busy} disabled={!indicators.length || !classes.length}>Tạo phiên bản nháp</Button>
    </form>
  </Card>;
}

export default function Configuration({ data, action, can, refresh }) {
  const [definition, setDefinition] = useState('');
  const [dataset, setDataset] = useState('');
  const version = data.definitions.find(row => row.definition_id === definition) ?? data.definitions[0];
  const target = data.datasets.find(row => row.dataset_version_id === dataset);
  const canLabel = can('dataset.write') && version?.status === 'ACTIVE' && target?.status === 'BUILT';
  return <>
    <Card title="Phiên bản SQI">
      <Field label="Phiên bản"><select value={version?.definition_id ?? ''} onChange={e => setDefinition(e.target.value)}>
        <Options values={data.definitions.map(row => [row.definition_id, row.version_code + ' · ' + row.status])} />
      </select></Field>
      <DataTable rows={version?.indicators} rowKey="parameter_code" columns={columns([
        ['parameter_code', 'Chỉ tiêu'], ['source', 'Nguồn'], ['scoring_function', 'Cách chấm'], ['weight', 'Trọng số'],
      ])} />
      {can('sqi.write') && version && <form onSubmit={event => {
        event.preventDefault();
        const label = canLabel && new FormData(event.currentTarget).has('label');
        action.run(async () => {
          const result = await api.post(sqi + '/calculate', { definition: version.definition_id, dataset, label });
          await refresh();
          return 'Đã tính ' + result.scores + ' điểm.' + (label ? ' Đã gán ' + result.labels + ' nhãn.' : '');
        });
      }}>
        <Field label="Dataset"><select required value={dataset} onChange={e => setDataset(e.target.value)}>
          <Options blank="Chọn dataset" values={data.datasets.map(row => [row.dataset_version_id, row.dataset_code + ' v' + row.version_no + ' · ' + row.status])} />
        </select></Field>
        {canLabel && <label><input type="checkbox" name="label" /> Gán nhãn sức khỏe đất</label>}
        <div className="page-actions">
          <Button variant="primary" loading={action.busy} disabled={!target || version.status === 'RETIRED'}>Tính SQI</Button>
          {version.status === 'DRAFT' && <Button type="button" disabled={action.busy} onClick={() => action.run(async () => {
            await api.post(sqi + '/definitions/' + version.definition_id + '/activate', {});
            await refresh();
            return 'Đã kích hoạt phiên bản SQI.';
          })}>Kích hoạt</Button>}
        </div>
      </form>}
    </Card>
    {can('sqi.write') && <DefinitionForm key={version?.definition_id} version={version} data={data} action={action} refresh={refresh} />}
  </>;
}

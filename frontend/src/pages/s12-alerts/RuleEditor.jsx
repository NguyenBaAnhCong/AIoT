import { useState } from 'react';
import { Button, Card, Field } from '../../components/ui';
import { Options } from '../tv5/shared';

const conditions = {
  SENSOR: ['LT', 'GT', 'OUTSIDE'], SQI: ['LT', 'GT', 'OUTSIDE', 'CLASS_IN'],
  ML: ['ANOMALY'], DEVICE: ['OFFLINE'],
};
const conditionNames = {
  LT: 'Thấp hơn ngưỡng', GT: 'Cao hơn ngưỡng', OUTSIDE: 'Ngoài khoảng', CLASS_IN: 'Thuộc nhóm phân loại',
  ANOMALY: 'Bất thường', OFFLINE: 'Mất kết nối',
};

export default function RuleEditor({ row, sources, severities, writable, close, action, save }) {
  const [source, setSource] = useState(row.source ?? 'SENSOR');
  const [condition, setCondition] = useState(row.condition ?? conditions[source][0]);
  const low = ['LT', 'OUTSIDE'].includes(condition);
  const high = ['GT', 'OUTSIDE'].includes(condition);
  return <Card title={row.rule_id ? row.name : 'Thêm luật cảnh báo'} actions={<Button onClick={close}>Đóng</Button>}>
    <form onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const body = {
        code: form.get('code'), name: form.get('name'), source, condition, severity: form.get('severity'),
        parameter: form.get('parameter'), low: low ? Number(form.get('low')) : null,
        high: high ? Number(form.get('high')) : null,
        classes: condition === 'CLASS_IN' ? form.getAll('classes') : null,
        windowMinutes: Number(form.get('window')), cooldownMinutes: Number(form.get('cooldown')),
        recommendation: form.get('recommendation'), active: form.has('active'),
      };
      action.run(async () => { await save(body); return 'Đã lưu luật cảnh báo.'; });
    }}>
      <fieldset disabled={!writable || action.busy}>
        <div className="grid-3">
          <Field label="Mã luật"><input name="code" required maxLength={32} defaultValue={row.rule_code} /></Field>
          <Field label="Tên luật"><input name="name" required maxLength={255} defaultValue={row.name} /></Field>
          <Field label="Nguồn"><select name="source" value={source} onChange={e => { setSource(e.target.value); setCondition(conditions[e.target.value][0]); }}><Options values={sources} /></select></Field>
          <Field label="Điều kiện"><select value={condition} onChange={e => setCondition(e.target.value)}><Options values={conditions[source].map(code => [code, conditionNames[code]])} /></select></Field>
          <Field label="Mức độ"><select name="severity" defaultValue={row.severity ?? 'MEDIUM'}><Options values={severities} /></select></Field>
          {source === 'SENSOR' && <Field label="Thông số"><select name="parameter" defaultValue={row.parameter_code ?? 'PH'}><Options values={['PH', 'EC', 'MOISTURE', 'N', 'P', 'K', 'SOIL_TEMP'].map(value => [value])} /></select></Field>}
          {low && <Field label="Ngưỡng dưới"><input name="low" type="number" step="any" required defaultValue={row.threshold_low} /></Field>}
          {high && <Field label="Ngưỡng trên"><input name="high" type="number" step="any" required defaultValue={row.threshold_high} /></Field>}
          {condition === 'CLASS_IN' && <Field label="Nhóm phân loại"><select name="classes" multiple required defaultValue={row.class_values ?? []}>
            <Options values={[[ 'VERY_GOOD', 'Rất tốt' ], ['GOOD', 'Tốt'], ['FAIR', 'Trung bình'], ['POOR', 'Kém']]} />
          </select></Field>}
          <Field label="Cửa sổ đánh giá (phút)"><input name="window" type="number" min="1" required defaultValue={row.window_minutes ?? 60} /></Field>
          <Field label="Thời gian chờ giữa các cảnh báo (phút)"><input name="cooldown" type="number" min="0" required defaultValue={row.cooldown_minutes ?? 60} /></Field>
        </div>
        <Field label="Khuyến nghị"><textarea name="recommendation" maxLength={2000} defaultValue={row.recommendation_template} /></Field>
        <label><input type="checkbox" name="active" defaultChecked={row.is_active ?? true} /> Bật luật</label>
        {writable && <div><Button variant="primary" loading={action.busy}>Lưu luật</Button></div>}
      </fieldset>
    </form>
  </Card>;
}

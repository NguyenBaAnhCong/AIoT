import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import { Badge, Button, Card, Field, PageHeader } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { apiRoot, columns, formatDate, formatNumber, Load, Options, useAction } from '../tv5/shared';

const reports = apiRoot + '/reports';
const types = [['TECHNICAL', 'Kỹ thuật'], ['ECONOMIC', 'Kinh tế'], ['ENVIRONMENTAL', 'Môi trường']];

function ReportForm({ options, action, reload }) {
  const [experiment, setExperiment] = useState('');
  const [type, setType] = useState('TECHNICAL');
  return <form onSubmit={event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
    action.run(async () => {
      const result = await api.post(reports, body);
      await reload();
      if (result.status !== 'READY') throw new Error('Không tạo được tệp. Xem trạng thái trong lịch sử báo cáo.');
      return 'Đã tạo báo cáo. Tệp có trong lịch sử bên dưới.';
    });
  }}>
    <div className="grid-3">
      <Field label="Loại báo cáo"><select name="type" value={type} onChange={e => setType(e.target.value)}><Options values={types} /></select></Field>
      <Field label="Định dạng"><select name="format"><Options values={[[ 'XLSX', 'Excel' ], ['PDF', 'PDF']]} /></select></Field>
      <Field label="Thí nghiệm"><select name="experiment" required value={experiment} onChange={e => setExperiment(e.target.value)}>
        <Options blank="Chọn thí nghiệm" values={(options.experiments ?? []).map(row => [row.experiment_id, row.title])} />
      </select></Field>
      <Field label="Nghiệm thức"><select name="treatment" key={experiment + '-treatment'}>
        <Options blank="Tất cả" values={(options.treatments ?? []).filter(row => row.experiment_id === experiment).map(row => [row.treatment_id, row.name])} />
      </select></Field>
      <Field label="Mùa vụ"><select name="season" key={experiment + '-season'}>
        <Options blank="Tất cả" values={(options.seasons ?? []).filter(row => row.experiment_id === experiment).map(row => [row.crop_season_id, row.season_code + ' · ' + row.plot_code])} />
      </select></Field>
      {type === 'TECHNICAL' && <>
        <Field label="Từ ngày"><input name="from" type="date" /></Field>
        <Field label="Đến ngày"><input name="to" type="date" /></Field>
      </>}
    </div>
    <Button variant="primary" loading={action.busy}>Tạo báo cáo</Button>
  </form>;
}

export default function Page() {
  const { can } = useAuth();
  const history = useApi(() => api.get(reports));
  const options = useApi(() => can('reporting.write') ? api.get(reports + '/options') : null);
  const kpis = useApi(() => api.get(reports + '/kpis'));
  const action = useAction();
  return <div className="tv5-page">
    <PageHeader title="Báo cáo" subtitle="Tổng hợp kết quả thí nghiệm và theo dõi KPI." />
    {can('reporting.write') && <Card title="Tạo báo cáo">
      <Load request={options}>{data => <ReportForm options={data} action={action} reload={history.reload} />}</Load>
    </Card>}
    {action.feedback}
    <Card title="Lịch sử báo cáo">
      <Load request={history}>{rows => <DataTable rows={rows} rowKey="report_id" columns={columns([
        ['title', 'Tên báo cáo'], ['created_at', 'Thời điểm', row => formatDate(row.created_at)],
        ['file_format', 'Định dạng'], ['status', 'Trạng thái', row => <><Badge tone={row.status === 'FAILED' ? 'bad' : 'neutral'}>{row.status}</Badge>{row.error && <p>{row.error}</p>}</>],
        ['file', 'Tệp', row => row.status === 'READY' && <Button size="sm" disabled={action.busy} onClick={() => action.run(async () => {
          await api.download(reports + '/' + row.report_id + '/file', row.report_id + '.' + row.file_format.toLowerCase());
        })}>Tải tệp</Button>],
      ])} />}</Load>
    </Card>
    <Card title="KPI nghiệm thu">
      <Load request={kpis}>{rows => <DataTable rows={rows} rowKey="kpi_code" columns={columns([
        ['name_vi', 'Chỉ tiêu'], ['target_value', 'Mục tiêu', row => formatNumber(row.target_value) + ' ' + (row.unit ?? '')],
        ['current_value', 'Giá trị hiện tại', row => formatNumber(row.current_value)],
        ['passed', 'Kết quả', row => row.passed == null ? '—' : <Badge tone={row.passed ? 'ok' : 'warn'}>{row.passed ? 'Đạt' : 'Chưa đạt'}</Badge>],
        ['measured_value', 'Kết quả lưu gần nhất', row => formatNumber(row.measured_value)],
      ])} />}</Load>
    </Card>
  </div>;
}

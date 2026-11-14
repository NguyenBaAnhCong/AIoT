import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import { Badge, Button, Card, Field, PageHeader } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { apiRoot, columns, formatNumber, Load, Options, useAction } from '../tv5/shared';
import Configuration from './Configuration';

const sqi = apiRoot + '/sqi';

function ScoreDetail({ id }) {
  const detail = useApi(() => api.get(sqi + '/scores/' + id), [id]);
  return <Card title="Chi tiết chỉ tiêu">
    <Load request={detail}>{data => <DataTable rows={data.indicators} columns={columns([
      ['name', 'Chỉ tiêu'], ['source', 'Nguồn'], ['raw_value', 'Giá trị', row => formatNumber(row.raw_value) + ' ' + (row.unit ?? '')],
      ['score', 'Điểm', row => formatNumber(row.score)], ['weight', 'Trọng số', row => formatNumber(row.weight)],
      ['weighted_score', 'Điểm có trọng số', row => formatNumber(row.weighted_score)],
    ])} />}</Load>
  </Card>;
}

function History({ plot, definitionId, firstDay, lastDay }) {
  const [range, setRange] = useState({ from: firstDay, to: lastDay });
  const [selected, setSelected] = useState('');
  const scores = useApi(() => api.get(sqi + '/scores', { plotId: plot, definitionId, ...range }), [range]);
  const comparison = useApi(() => api.get(sqi + '/comparison', { definitionId }));
  return <>
    <Card title="Diễn biến SQI theo ngày">
      <form className="grid-3" onSubmit={event => {
        event.preventDefault();
        setSelected('');
        setRange(Object.fromEntries(new FormData(event.currentTarget)));
      }}>
        <Field label="Từ ngày"><input name="from" type="date" required defaultValue={firstDay} /></Field>
        <Field label="Đến ngày"><input name="to" type="date" required defaultValue={lastDay} /></Field>
        <div><Button disabled={scores.loading}>Áp dụng</Button></div>
      </form>
      <Load request={scores}>{rows => {
        const day = value => Date.parse(value + 'T00:00:00Z');
        const first = day(rows[0]?.day);
        const span = day(rows.at(-1)?.day) - first;
        const points = rows.filter(row => row.sqi_value != null).map(row => ({
          ...row, x: span ? 28 + 564 * (day(row.day) - first) / span : 310,
          y: 168 - 144 * Number(row.sqi_value),
        }));
        return <>
          {points.length > 0 && <svg viewBox="0 0 620 192" width="100%" style={{ display: 'block', maxHeight: 270 }} role="img" aria-label="Biểu đồ SQI theo ngày, thang điểm từ 0 đến 1">
            <path d="M28 24V168H592" stroke="currentColor" fill="none" />
            <text x="10" y="28">1</text><text x="10" y="172">0</text>
            <polyline points={points.map(point => [point.x, point.y].join(',')).join(' ')} stroke="#2a7552" fill="none" strokeWidth="2" />
            {points.map(point => <circle key={point.sqi_score_id} cx={point.x} cy={point.y} r="4" fill={selected === point.sqi_score_id ? '#92400e' : '#2a7552'} style={{ cursor: 'pointer' }} onClick={() => setSelected(point.sqi_score_id)}>
              <title>{point.day} · {formatNumber(point.sqi_value)}</title>
            </circle>)}
          </svg>}
          <DataTable rows={rows} rowKey="sqi_score_id" columns={columns([
            ['day', 'Ngày', row => <Button size="sm" onClick={() => setSelected(row.sqi_score_id)}>{row.day}</Button>],
            ['sqi_value', 'Điểm', row => formatNumber(row.sqi_value)],
            ['health_class', 'Phân loại', row => <Badge>{row.health_class ?? '—'}</Badge>],
            ['coverage_pct', 'Độ phủ (%)', row => formatNumber(row.coverage_pct)],
            ['n_observations', 'Số mẫu'], ['treatment_code', 'Nghiệm thức'],
          ])} />
        </>;
      }}</Load>
    </Card>
    {selected && <ScoreDetail key={selected} id={selected} />}
    <Card title="So sánh theo nghiệm thức">
      <Load request={comparison}>{rows => <DataTable rows={rows} rowKey="treatment_code" columns={columns([
        ['treatment_code', 'Nghiệm thức'], ['n_days', 'Số ngày'], ['mean_sqi', 'SQI trung bình', row => formatNumber(row.mean_sqi)],
      ])} />}</Load>
    </Card>
  </>;
}

function Monitor({ rows }) {
  const [plotId, setPlot] = useState('');
  const [definitionId, setDefinition] = useState('');
  const plot = rows.find(row => row.plot_id === plotId)?.plot_id ?? rows[0]?.plot_id ?? '';
  const versions = rows.filter(row => row.plot_id === plot);
  const active = versions.find(row => row.definition_id === definitionId) ?? versions[0];
  const plots = new Map(rows.map(row => [row.plot_id, row.site_code + ' · ' + row.plot_code]));
  return <>
    <Card title="Chọn ô đất và phiên bản">
      <div className="grid-2">
        <Field label="Ô đất"><select value={plot} onChange={e => { setPlot(e.target.value); setDefinition(''); }}><Options values={[...plots]} blank={plots.size ? undefined : 'Chưa có điểm SQI'} /></select></Field>
        <Field label="Phiên bản SQI"><select value={active?.definition_id ?? ''} onChange={e => setDefinition(e.target.value)}><Options values={versions.map(row => [row.definition_id, row.version_code])} /></select></Field>
      </div>
    </Card>
    {active && <History key={[plot, active.definition_id, active.last_day].join('/')} plot={plot} definitionId={active.definition_id} firstDay={active.first_day} lastDay={active.last_day} />}
  </>;
}

export default function Page() {
  const { can } = useAuth();
  const plots = useApi(() => api.get(sqi + '/plots'));
  const config = useApi(() => api.get(sqi + '/configuration'));
  const [tab, setTab] = useState('monitor');
  const action = useAction();
  return <>
    <PageHeader title="Sức khỏe đất – SQI" actions={<>
      <Button variant={tab === 'monitor' ? 'primary' : 'default'} onClick={() => setTab('monitor')}>Giám sát</Button>
      <Button variant={tab === 'configuration' ? 'primary' : 'default'} onClick={() => setTab('configuration')}>Cấu hình SQI</Button>
    </>} />
    {action.feedback}
    {tab === 'monitor' ? <Load request={plots}>{rows => <Monitor rows={rows} />}</Load>
      : <Load request={config}>{data => <Configuration data={data} action={action} can={can} refresh={async () => {
        await Promise.all([config.reload(), plots.reload()]);
      }} />}</Load>}
  </>;
}

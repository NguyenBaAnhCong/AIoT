import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import { Badge, Button, Card, Field, PageHeader } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { apiRoot, columns, formatNumber, Load, Options, useAction } from '../tv5/shared';
import Configuration from './Configuration';

const sqi = apiRoot + '/sqi';
const date = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const time = day => Date.parse(day + 'T00:00:00Z');
const shortDate = day => date.format(time(day));

function ScoreDetail({ id, day }) {
  const detail = useApi(() => api.get(sqi + '/scores/' + id), [id]);
  return <aside className="tv5-chart-detail" aria-label="Chi tiết chỉ tiêu"><h3>Chi tiết chỉ tiêu · {shortDate(day)}</h3>
    <Load request={detail}>{data => <DataTable rows={data.indicators} columns={columns([
      ['name', 'Chỉ tiêu'], ['source', 'Nguồn'], ['raw_value', 'Giá trị', row => formatNumber(row.raw_value) + ' ' + (row.unit ?? '')],
      ['score', 'Điểm', row => formatNumber(row.score)], ['weight', 'Trọng số', row => formatNumber(row.weight)],
      ['weighted_score', 'Điểm có trọng số', row => formatNumber(row.weighted_score)],
    ])} />}</Load>
  </aside>;
}

function History({ plot, definitionId, firstDay, lastDay }) {
  const [range, setRange] = useState({ from: firstDay, to: lastDay });
  const [selected, setSelected] = useState('');
  const scores = useApi(() => api.get(sqi + '/scores', { plotId: plot, definitionId, ...range }), [range]);
  const comparison = useApi(() => api.get(sqi + '/comparison', { definitionId }));
  return <>
    <Card title="Diễn biến SQI theo ngày">
      <form className="tv5-date-range" onSubmit={event => {
        event.preventDefault();
        setSelected('');
        setRange(Object.fromEntries(new FormData(event.currentTarget)));
      }}>
        <Field label="Từ ngày"><input name="from" type="date" required defaultValue={firstDay} /></Field>
        <Field label="Đến ngày"><input name="to" type="date" required defaultValue={lastDay} /></Field>
        <Button variant="primary" disabled={scores.loading}>Áp dụng</Button>
      </form>
      <Load request={scores}>{rows => {
        const first = time(rows[0]?.day);
        const span = time(rows.at(-1)?.day) - first;
        const points = rows.filter(row => row.sqi_value != null).map(row => ({
          ...row, x: span ? 58 + 650 * (time(row.day) - first) / span : 383,
          y: 204 - 182 * Number(row.sqi_value),
        }));
        const active = rows.find(row => row.sqi_score_id === selected);
        const latest = points.at(-1);
        const trend = points.map(point => [point.x, point.y].join(',')).join(' ');
        const ticks = [...new Set([0, .25, .5, .75, 1].map(fraction => Math.round((rows.length - 1) * fraction)))];
        return <>
          {latest && <div className="tv5-chart-summary">
            <span>Điểm {active ? shortDate(active.day) : 'gần nhất'}</span>
            <strong>{formatNumber(active ? active.sqi_value : latest.sqi_value)}</strong>
            <Badge tone="ok">{(active ?? latest).health_class ?? '—'}</Badge>
            <span>{points.length} ngày có điểm</span>
          </div>}
          <div className={active ? 'tv5-chart-layout has-selection' : 'tv5-chart-layout'}>
            {latest && <svg className="tv5-chart" viewBox="0 0 748 242" role="group" aria-label="Biểu đồ SQI theo ngày, thang điểm từ 0 đến 1">
              <defs>
                <linearGradient id="tv5-sqi-fill" x2="0%" y2="100%">
                  <stop stopColor="var(--primary)" stopOpacity=".21" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity=".02" />
                </linearGradient>
              </defs>
              {[1, .75, .5, .25, 0].map(value => {
                const y = 204 - value * 182;
                return <g key={value}>
                  <line x1="58" x2="708" y1={y} y2={y} stroke="#dfe9e3" />
                  <text x="45" y={y + 4} textAnchor="end">{formatNumber(value)}</text>
                </g>;
              })}
              {ticks.map(index => <text key={index} x={span ? 58 + 650 * (time(rows[index].day) - first) / span : 383} y="228" textAnchor="middle">{shortDate(rows[index].day)}</text>)}
              <polygon points={points[0].x + ',204 ' + trend + ' ' + latest.x + ',204'} fill="url(#tv5-sqi-fill)" />
              <polyline points={trend} stroke="var(--primary)" fill="none" strokeWidth="2.5" strokeLinejoin="round" />
              {points.map(point => {
                const chosen = point.sqi_score_id === selected;
                const select = () => setSelected(point.sqi_score_id);
                return <circle key={point.sqi_score_id} cx={point.x} cy={point.y} r={chosen ? 5.5 : 3.5} fill={chosen ? 'var(--primary-dark)' : 'white'} stroke="var(--primary)" strokeWidth="2"
                  role="button" tabIndex="0" aria-pressed={chosen} aria-label={shortDate(point.day) + ' · SQI ' + formatNumber(point.sqi_value)}
                  onClick={select} onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
                  }}>
                  <title>{point.day} · {formatNumber(point.sqi_value)}</title>
                </circle>;
              })}
            </svg>}
            {active && <ScoreDetail key={selected} id={selected} day={active.day} />}
          </div>
          <details open={!latest}>
            <summary>Dữ liệu theo ngày</summary>
          <DataTable rows={rows} rowKey="sqi_score_id" columns={columns([
            ['day', 'Ngày', row => <Button size="sm" onClick={() => setSelected(row.sqi_score_id)}>{row.day}</Button>],
            ['sqi_value', 'Điểm', row => formatNumber(row.sqi_value)],
            ['health_class', 'Phân loại', row => <Badge>{row.health_class ?? '—'}</Badge>],
            ['coverage_pct', 'Độ phủ (%)', row => formatNumber(row.coverage_pct)],
            ['n_observations', 'Số mẫu'], ['treatment_code', 'Nghiệm thức'],
          ])} />
          </details>
        </>;
      }}</Load>
    </Card>
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
  return <div className="tv5-page">
    <PageHeader title="Sức khỏe đất – SQI" actions={<>
      <Button variant={tab === 'monitor' ? 'primary' : 'default'} onClick={() => setTab('monitor')}>Giám sát</Button>
      <Button variant={tab === 'configuration' ? 'primary' : 'default'} onClick={() => setTab('configuration')}>Cấu hình SQI</Button>
    </>} />
    {action.feedback}
    {tab === 'monitor' ? <Load request={plots}>{rows => <Monitor rows={rows} />}</Load>
      : <Load request={config}>{data => <Configuration data={data} action={action} can={can} refresh={async () => {
        await Promise.all([config.reload(), plots.reload()]);
      }} />}</Load>}
  </div>;
}

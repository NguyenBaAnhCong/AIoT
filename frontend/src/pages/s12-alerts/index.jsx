import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import { Badge, Button, Card, Field, PageHeader, Stat } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { apiRoot, columns, formatDate, Load, Options, useAction } from '../tv5/shared';
import RuleEditor from './RuleEditor';

const alerts = apiRoot + '/alerts';
const rulesPath = apiRoot + '/alert-rules';
const statuses = [['OPEN', 'Đang mở'], ['ACK', 'Đã xác nhận'], ['RESOLVED', 'Đã giải quyết']];
const sources = [['SENSOR', 'Cảm biến'], ['SQI', 'SQI'], ['ML', 'Mô hình AI'], ['DEVICE', 'Thiết bị']];
const severities = [['LOW', 'Thấp'], ['MEDIUM', 'Trung bình'], ['HIGH', 'Cao'], ['CRITICAL', 'Khẩn cấp']];
const decisions = { PROPOSED: 'Chờ quyết định', ACCEPTED: 'Đã chấp nhận', REJECTED: 'Đã từ chối', DONE: 'Hoàn thành' };
const evidenceLabels = { n: 'Số mẫu', min: 'Thấp nhất', max: 'Cao nhất', window_min: 'Cửa sổ đánh giá (phút)', sqi: 'Điểm SQI', class: 'Phân loại', coverage_pct: 'Độ phủ (%)' };
const label = (options, value) => options.find(([code]) => code === value)?.[1] ?? value;

function AlertDetail({ row, action, writable, refresh }) {
  const change = (path, body) => action.run(async () => {
    await api.patch(path, body);
    await refresh();
    return 'Đã cập nhật.';
  });
  return <Card title={row.message}>
    <p>{row.plot_code ?? 'Toàn hệ thống'} · {formatDate(row.created_at)}</p>
    {row.acknowledged_by && <p>Xác nhận bởi {row.acknowledged_by} · {formatDate(row.acknowledged_at)}</p>}
    {row.resolved_by && <p>Giải quyết bởi {row.resolved_by} · {formatDate(row.resolved_at)} · {row.resolution_note}</p>}
    {row.evidence && <details><summary>Bằng chứng</summary><dl className="kv">
      {Object.entries(row.evidence).map(([key, value]) => <Evidence key={key} label={evidenceLabels[key] ?? key} value={value} />)}
    </dl></details>}
    {writable && row.status === 'OPEN' && <Button disabled={action.busy} onClick={() => change(alerts + '/' + row.alert_id, { status: 'ACK' })}>Xác nhận cảnh báo</Button>}
    {writable && row.status === 'ACK' && <form onSubmit={event => {
      event.preventDefault();
      change(alerts + '/' + row.alert_id, { status: 'RESOLVED', note: new FormData(event.currentTarget).get('note') });
    }}>
      <Field label="Ghi chú xử lý"><textarea name="note" maxLength={2000} required /></Field>
      <Button loading={action.busy}>Đánh dấu đã giải quyết</Button>
    </form>}
    <h3>Khuyến nghị</h3>
    <DataTable rows={row.recommendations} columns={columns([
      ['action', 'Đề xuất', item => <>{item.action}{item.rationale && <p className="muted">{item.rationale}</p>}</>],
      ['status', 'Trạng thái', item => <Badge>{decisions[item.status] ?? item.status}</Badge>],
      ['decidedBy', 'Người quyết định', item => item.decidedBy ? item.decidedBy + ' · ' + formatDate(item.decidedAt) : '—'],
      ['decision', 'Thao tác', item => writable && (item.status === 'PROPOSED'
        ? <>
          <Button size="sm" disabled={action.busy} onClick={() => change(apiRoot + '/recommendations/' + item.id, { status: 'ACCEPTED' })}>Chấp nhận</Button>{' '}
          <Button size="sm" disabled={action.busy} onClick={() => change(apiRoot + '/recommendations/' + item.id, { status: 'REJECTED' })}>Từ chối</Button>
        </> : item.status === 'ACCEPTED' && <Button size="sm" disabled={action.busy} onClick={() => change(apiRoot + '/recommendations/' + item.id, { status: 'DONE' })}>Hoàn thành</Button>)],
    ])} />
  </Card>;
}

function Evidence({ label, value }) {
  return <><dt>{label}</dt><dd>{value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></>;
}

function AlertList({ list, summary, writable, action, setFilters, refresh }) {
  const [selected, setSelected] = useState('');
  return <>
    <Load request={summary}>{data => <div className="grid-3">
      <Stat label="Đang mở" value={data.open} />
      <Stat label="Ưu tiên cao chưa giải quyết" value={data.urgent} tone="warn" />
      <Stat label="Đã giải quyết" value={data.resolved} tone="ok" />
    </div>}</Load>
    <Card title="Danh sách cảnh báo">
      <form className="grid-3" onSubmit={event => {
        event.preventDefault();
        setSelected('');
        setFilters(Object.fromEntries(new FormData(event.currentTarget)));
      }}>
        <Field label="Trạng thái"><select name="status"><Options values={statuses} blank="Tất cả" /></select></Field>
        <Field label="Mức độ"><select name="severity"><Options values={severities} blank="Tất cả" /></select></Field>
        <Field label="Nguồn"><select name="source"><Options values={[...sources, ['DATA_QUALITY', 'Chất lượng dữ liệu']]} blank="Tất cả" /></select></Field>
        <div><Button disabled={list.loading}>Lọc cảnh báo</Button></div>
      </form>
      <Load request={list}>{rows => <DataTable rowKey="alert_id" rows={rows} columns={columns([
        ['message', 'Cảnh báo', row => <Button size="sm" onClick={() => setSelected(row.alert_id)}>{row.message}</Button>],
        ['plot_code', 'Ô đất'], ['created_at', 'Thời điểm', row => formatDate(row.created_at)],
        ['severity', 'Mức độ', row => <Badge tone={['HIGH', 'CRITICAL'].includes(row.severity) ? 'bad' : 'neutral'}>{label(severities, row.severity)}</Badge>],
        ['status', 'Trạng thái', row => label(statuses, row.status)],
      ])} />}</Load>
    </Card>
    {list.data?.some(row => row.alert_id === selected) && <AlertDetail key={selected} row={list.data.find(row => row.alert_id === selected)} writable={writable} action={action} refresh={refresh} />}
  </>;
}

function Rules({ request, action, writable }) {
  const [selected, setSelected] = useState(null);
  return <Load request={request}>{rows => <>
    <Card title="Luật cảnh báo" actions={writable && <Button onClick={() => setSelected({})}>Thêm luật</Button>}>
      <DataTable rows={rows} rowKey="rule_id" columns={columns([
        ['rule_code', 'Mã luật'], ['name', 'Tên luật'], ['source', 'Nguồn', row => label(sources, row.source)],
        ['condition', 'Điều kiện'], ['severity', 'Mức độ', row => label(severities, row.severity)],
        ['is_active', 'Trạng thái', row => <Badge>{row.is_active ? 'Đang bật' : 'Đã tắt'}</Badge>],
        ['edit', 'Chi tiết', row => <Button size="sm" onClick={() => setSelected(row)}>{writable ? 'Chỉnh sửa' : 'Xem'}</Button>],
      ])} />
    </Card>
    {selected && <RuleEditor key={selected.rule_id ?? 'new'} row={selected} sources={sources} severities={severities} writable={writable}
      close={() => setSelected(null)} action={action} save={async body => {
        if (selected.rule_id) await api.put(rulesPath + '/' + selected.rule_id, body);
        else await api.post(rulesPath, body);
        setSelected(null);
        await request.reload();
      }} />}
  </>}</Load>;
}

export default function Page() {
  const { can } = useAuth();
  const writable = can('alert.write');
  const [tab, setTab] = useState('list');
  const [filters, setFilters] = useState({});
  const list = useApi(() => api.get(alerts, filters), [filters]);
  const summary = useApi(() => api.get(alerts + '/summary'));
  const rules = useApi(() => api.get(rulesPath));
  const action = useAction();
  const refresh = () => Promise.all([list.reload(), summary.reload()]);
  return <>
    <PageHeader title="Cảnh báo & quyết định" actions={<>
      <Button variant={tab === 'list' ? 'primary' : 'default'} onClick={() => setTab('list')}>Danh sách cảnh báo</Button>
      <Button variant={tab === 'rules' ? 'primary' : 'default'} onClick={() => setTab('rules')}>Luật cảnh báo</Button>
    </>} />
    {action.feedback}
    {tab === 'list' ? <AlertList {...{ list, summary, writable, action, setFilters, refresh }} /> : <>
      {writable && <Card title="Đánh giá luật cảnh báo">
        <form className="grid-3" onSubmit={event => {
          event.preventDefault();
          const at = new FormData(event.currentTarget).get('at');
          action.run(async () => {
            const result = await api.post(alerts + '/evaluate', { at: at ? at + ':00+07:00' : null });
            await refresh();
            return 'Đã đánh giá luật. Có ' + result.created + ' cảnh báo mới.';
          });
        }}>
          <Field label="Thời điểm đánh giá (giờ Việt Nam)"><input name="at" type="datetime-local" /></Field>
          <div><Button loading={action.busy}>Đánh giá</Button></div>
        </form>
      </Card>}
      <Rules request={rules} action={action} writable={writable} />
    </>}
  </>;
}

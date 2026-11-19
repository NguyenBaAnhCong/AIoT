import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import DataTable from '../../components/DataTable';
import { ErrorBox, Spinner } from '../../components/Feedback';
import { Badge, Button, Card, Field } from '../../components/ui';
import Modal from './Modal';
import Pager from './Pager';
import { dayToIso, fmt } from './helpers';

// Tab Nhật ký: "Thay đổi dữ liệu" (audit_logs: ai sửa gì) và "Truy cập" (access_logs: đăng nhập, thao tác ghi, bị từ chối).
export default function AuditTab() {
  const [mode, setMode] = useState('changes');
  return (
    <>
      <div className="seg">
        <button className={mode === 'changes' ? 'on' : ''} onClick={() => setMode('changes')}>Thay đổi dữ liệu</button>
        <button className={mode === 'access' ? 'on' : ''} onClick={() => setMode('access')}>Truy cập</button>
      </div>
      {mode === 'changes' ? <ChangeLogs /> : <AccessLogs />}
    </>
  );
}

const OP_TONE = { INSERT: 'ok', UPDATE: 'info', DELETE: 'bad' };
const statusTone = (s) => (s >= 500 ? 'bad' : s >= 400 ? 'warn' : 'ok');

function ChangeLogs() {
  const [f, setF] = useState({ schema: '', table: '', operation: '', record: '', from: '', to: '' });
  const [applied, setApplied] = useState(f);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(null);
  const params = { schema: applied.schema, table: applied.table, operation: applied.operation, record: applied.record, from: dayToIso(applied.from), to: dayToIso(applied.to, true), page, limit: 20 };
  const list = useApi(() => api.page('/audit/logs', params), [applied, page]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const columns = [
    { key: 'occurred_at', title: 'Thời gian', render: (r) => fmt(r.occurred_at) },
    { key: 'actor', title: 'Người thực hiện', render: (r) => r.actor_username || <span className="muted">{r.actor_type === 'SYSTEM' ? 'Hệ thống' : '—'}</span> },
    { key: 'operation', title: 'Thao tác', render: (r) => <Badge tone={OP_TONE[r.operation]}>{r.operation}</Badge> },
    { key: 'table', title: 'Bảng', render: (r) => <span className="mono">{r.schema_name}.{r.table_name}</span> },
    { key: 'changed_fields', title: 'Trường đã đổi', render: (r) => r.changed_fields?.length ? <span className="mono small">{r.changed_fields.slice(0, 4).join(', ')}{r.changed_fields.length > 4 ? '…' : ''}</span> : '—' },
    { key: 'act', title: '', render: (r) => <Button size="sm" onClick={() => setDetailId(r.id)}>Chi tiết</Button> },
  ];

  return (
    <Card title="Nhật ký thay đổi dữ liệu">
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(f); }}>
        <Field label="Schema"><input placeholder="iam, farm…" value={f.schema} onChange={set('schema')} /></Field>
        <Field label="Bảng"><input placeholder="users, plots…" value={f.table} onChange={set('table')} /></Field>
        <Field label="Thao tác"><select value={f.operation} onChange={set('operation')}><option value="">Tất cả</option><option>INSERT</option><option>UPDATE</option><option>DELETE</option></select></Field>
        <Field label="Từ ngày"><input type="date" value={f.from} onChange={set('from')} /></Field>
        <Field label="Đến ngày"><input type="date" value={f.to} onChange={set('to')} /></Field>
        <Button type="submit">Lọc</Button>
        <Button type="button" onClick={() => { const empty = { schema: '', table: '', operation: '', record: '', from: '', to: '' }; setF(empty); setApplied(empty); setPage(1); }}>Xóa lọc</Button>
      </form>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <DataTable columns={columns} rows={list.data?.data} loading={list.loading} empty={{ title: 'Chưa có bản ghi nào' }} />
      <Pager meta={list.data?.meta} onPage={setPage} />
      {detailId && <ChangeDetail id={detailId} onClose={() => setDetailId(null)} />}
    </Card>
  );
}

function ChangeDetail({ id, onClose }) {
  const d = useApi(() => api.get(`/audit/logs/${id}`), [id]);
  const row = d.data;
  const fields = row?.changed_fields?.length ? row.changed_fields : [];
  const show = (v) => (v === undefined || v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return (
    <Modal title="Chi tiết thay đổi" onClose={onClose} wide>
      {d.loading ? <Spinner /> : <ErrorBox error={d.error} /> }
      {row && (
        <>
          <dl className="kv">
            <dt>Thời gian</dt><dd>{fmt(row.occurred_at)}</dd>
            <dt>Người thực hiện</dt><dd>{row.actor_username || row.actor_type}</dd>
            <dt>Thao tác</dt><dd><Badge tone={OP_TONE[row.operation]}>{row.operation}</Badge> <span className="mono">{row.schema_name}.{row.table_name}</span></dd>
            <dt>Bản ghi</dt><dd className="mono small">{JSON.stringify(row.record_pk)}</dd>
          </dl>
          {row.operation === 'UPDATE' && fields.length > 0 ? (
            <table className="table diff"><thead><tr><th>Trường</th><th>Giá trị cũ</th><th>Giá trị mới</th></tr></thead>
              <tbody>{fields.map((k) => <tr key={k}><td className="mono">{k}</td><td className="mono small">{show(row.old_data?.[k])}</td><td className="mono small">{show(row.new_data?.[k])}</td></tr>)}</tbody></table>
          ) : (
            <pre className="json">{JSON.stringify(row.new_data ?? row.old_data, null, 2)}</pre>
          )}
          <p className="muted small">Các trường nhạy cảm như mật khẩu và hash của API key không được ghi vào nhật ký.</p>
        </>)}
    </Modal>
  );
}

function AccessLogs() {
  const [f, setF] = useState({ action: '', status: '', from: '', to: '' });
  const [applied, setApplied] = useState(f);
  const [page, setPage] = useState(1);
  const params = { action: applied.action, status: applied.status, from: dayToIso(applied.from), to: dayToIso(applied.to, true), page, limit: 20 };
  const list = useApi(() => api.page('/audit/access-logs', params), [applied, page]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const columns = [
    { key: 'occurred_at', title: 'Thời gian', render: (r) => fmt(r.occurred_at) },
    { key: 'who', title: 'Ai', render: (r) => r.username || (r.api_key_prefix ? <span className="mono">key {r.api_key_prefix}…</span> : <span className="muted">—</span>) },
    { key: 'action', title: 'Hành động', render: (r) => <Badge tone={r.action === 'LOGIN_FAILED' ? 'bad' : r.action === 'LOGIN' ? 'ok' : 'neutral'}>{r.action}</Badge> },
    { key: 'request', title: 'Yêu cầu', render: (r) => r.resource ? <span className="mono small">{r.http_method} {r.resource}</span> : '—' },
    { key: 'status_code', title: 'Mã', render: (r) => r.status_code ? <Badge tone={statusTone(r.status_code)}>{r.status_code}</Badge> : '—' },
    { key: 'ip_address', title: 'IP', render: (r) => <span className="mono small">{r.ip_address || '—'}</span> },
  ];

  return (
    <Card title="Nhật ký truy cập">
      <p className="muted small">Ghi đăng nhập, thao tác ghi dữ liệu và các request bị từ chối. Request thành công của thiết bị (API key) chỉ được lấy mẫu để bảng không phình.</p>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(f); }}>
        <Field label="Hành động"><select value={f.action} onChange={set('action')}><option value="">Tất cả</option><option>LOGIN</option><option>LOGIN_FAILED</option><option>API_CALL</option></select></Field>
        <Field label="Mã trạng thái"><input type="number" placeholder="403" min="100" max="599" value={f.status} onChange={set('status')} /></Field>
        <Field label="Từ ngày"><input type="date" value={f.from} onChange={set('from')} /></Field>
        <Field label="Đến ngày"><input type="date" value={f.to} onChange={set('to')} /></Field>
        <Button type="submit">Lọc</Button>
        <Button type="button" onClick={() => { const e = { action: '', status: '', from: '', to: '' }; setF(e); setApplied(e); setPage(1); }}>Xóa lọc</Button>
      </form>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <DataTable columns={columns} rows={list.data?.data} loading={list.loading} empty={{ title: 'Chưa có bản ghi nào' }} />
      <Pager meta={list.data?.meta} onPage={setPage} />
    </Card>
  );
}

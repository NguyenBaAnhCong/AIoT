import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import { ErrorBox, Spinner } from '../../components/Feedback';
import { Button, Card, Stat } from '../../components/ui';
import { fmt } from './helpers';

const bytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`);
const uptime = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} giờ ${m} phút` : `${m} phút`; };

// Tab Hệ thống: tình trạng máy chủ, database, số liệu 24 giờ gần nhất, danh sách migration đã áp.
export default function SystemTab() {
  const { can } = useAuth();
  const status = useApi(() => api.get('/system/status'), []);
  const summary = useApi(() => (can('audit.read') ? api.get('/audit/summary') : Promise.resolve(null)), []);
  const reload = () => { status.reload(); summary.reload(); };

  if (status.loading) return <Spinner />;
  if (status.error) return <ErrorBox error={status.error} onRetry={status.reload} />;
  const s = status.data; const a = summary.data;

  return (
    <>
      <div className="grid-3">
        <Stat label="Máy chủ" value="Hoạt động" tone="ok" hint={`Node ${s.server.node_version} · chạy ${uptime(s.server.uptime_seconds)} · ${s.server.environment}`} />
        <Stat label="Database" value={s.database.name} tone={s.database.domain_schemas === 16 ? 'ok' : 'warn'} hint={`${s.database.domain_schemas}/16 schema · ${bytes(s.database.size_bytes)}`} />
        <Stat label="Người dùng hoạt động" value={s.counts.active_users} unit={`/ ${s.counts.users}`} hint={`${s.counts.active_api_keys} API key đang hiệu lực`} />
      </div>
      <div className="grid-3">
        <Stat label="Thay đổi dữ liệu (24 giờ)" value={s.counts.changes_24h} hint={a ? Object.entries(a.changes_by_operation).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'Không có' : undefined} />
        <Stat label="Đăng nhập (24 giờ)" value={a?.logins ?? '—'} hint="Đăng nhập thành công" />
        <Stat label="Đăng nhập sai (24 giờ)" value={s.counts.failed_logins_24h} tone={s.counts.failed_logins_24h > 10 ? 'bad' : s.counts.failed_logins_24h > 0 ? 'warn' : 'ok'} hint={a ? `${a.denied_calls} yêu cầu bị từ chối` : undefined} />
      </div>
      <Card title="Migration đã áp" actions={<Button size="sm" onClick={reload}>Làm mới</Button>}>
        <p className="muted small">Giờ máy chủ: {fmt(s.database.server_time)} · {s.database.version.split(',')[0]}</p>
        <DataTable rowKey="filename" columns={[{ key: 'filename', title: 'File', render: (m) => <span className="mono">{m.filename}</span> }, { key: 'applied_at', title: 'Áp lúc', render: (m) => fmt(m.applied_at) }]}
          rows={s.migrations} empty={{ title: 'Chưa có migration nào' }} />
      </Card>
    </>
  );
}

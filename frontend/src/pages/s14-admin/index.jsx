import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import { ErrorBox } from '../../components/Feedback';
import { Badge, Button, Card, Field, PageHeader } from '../../components/ui';

// Màn hình 14 – Quản trị hệ thống (TV1).
// Hiện có: quản lý API key cho Edge Gateway. Sẽ bổ sung: người dùng, vai trò & quyền, audit log, trạng thái hệ thống.
const fmt = (v) => (v ? new Date(v).toLocaleString('vi-VN') : '—');
const TONE = { ACTIVE: 'ok', REVOKED: 'bad', EXPIRED: 'warn' };

export default function AdminPage() {
  const { can } = useAuth();
  const canWrite = can('iam.admin');
  const keys = useApi(() => api.get('/api-keys'), []);
  const scopes = useApi(() => api.get('/api-keys/scopes'), []);
  const [form, setForm] = useState({ label: '', scopes: ['iot.ingest'], expiresInDays: '' });
  const [created, setCreated] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const toggleScope = (s) =>
    setForm((f) => ({ ...f, scopes: f.scopes.includes(s) ? f.scopes.filter((x) => x !== s) : [...f.scopes, s] }));

  async function onCreate(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { label: form.label, scopes: form.scopes };
      if (form.expiresInDays) body.expiresInDays = Number(form.expiresInDays);
      setCreated(await api.post('/api-keys', body));
      setForm({ label: '', scopes: ['iot.ingest'], expiresInDays: '' });
      keys.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(row) {
    if (!window.confirm(`Thu hồi key "${row.label || row.prefix}"? Thiết bị đang dùng key này sẽ bị từ chối.`)) return;
    try {
      await api.post(`/api-keys/${row.id}/revoke`);
      keys.reload();
    } catch (err) {
      setError(err);
    }
  }

  const columns = [
    { key: 'label', title: 'Nhãn', render: (r) => r.label || <span className="muted">(không nhãn)</span> },
    { key: 'prefix', title: 'Key', render: (r) => <code>{r.prefix}…</code> },
    { key: 'scopes', title: 'Phạm vi', render: (r) => r.scopes.map((s) => <Badge key={s} tone="info">{s}</Badge>) },
    { key: 'status', title: 'Trạng thái', render: (r) => <Badge tone={TONE[r.status]}>{r.status}</Badge> },
    { key: 'last_used_at', title: 'Dùng gần nhất', render: (r) => fmt(r.last_used_at) },
    { key: 'expires_at', title: 'Hết hạn', render: (r) => fmt(r.expires_at) },
    { key: 'act', title: '', render: (r) => canWrite && r.status === 'ACTIVE' && <Button size="sm" variant="danger" onClick={() => onRevoke(r)}>Thu hồi</Button> },
  ];

  return (
    <>
      <PageHeader title="Quản trị hệ thống" subtitle="API key cho Edge Gateway. Người dùng, vai trò và audit log sẽ bổ sung sau." />

      {created && (
        <div className="alert alert-ok">
          <div>
            <strong>Đã tạo key “{created.label}”. Hãy sao chép ngay, hệ thống sẽ không hiển thị lại:</strong>
            <div><code className="secret">{created.key}</code></div>
          </div>
          <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(created.key)}>Sao chép</button>
          <button className="btn btn-sm" onClick={() => setCreated(null)}>Đóng</button>
        </div>
      )}

      {canWrite && (
        <Card title="Tạo API key mới">
          <form className="form form-inline" onSubmit={onCreate}>
            <ErrorBox error={error} />
            <Field label="Nhãn (vd: Gateway khu A)">
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required maxLength={128} />
            </Field>
            <Field label="Hết hạn sau (ngày, bỏ trống = không hết hạn)">
              <input type="number" min="1" max="3650" value={form.expiresInDays} onChange={(e) => setForm({ ...form, expiresInDays: e.target.value })} />
            </Field>
            <div className="field">
              <span className="field-label">Phạm vi</span>
              <div className="checks">
                {(scopes.data || []).map((s) => (
                  <label key={s}><input type="checkbox" checked={form.scopes.includes(s)} onChange={() => toggleScope(s)} /> {s}</label>
                ))}
              </div>
            </div>
            <Button variant="primary" type="submit" loading={busy} disabled={!form.scopes.length}>Tạo key</Button>
          </form>
        </Card>
      )}

      <Card title="Danh sách API key">
        <ErrorBox error={keys.error} onRetry={keys.reload} />
        <DataTable columns={columns} rows={keys.data} loading={keys.loading} empty={{ title: 'Chưa có API key nào' }} />
      </Card>
    </>
  );
}

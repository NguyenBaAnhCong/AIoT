import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBox, Spinner } from '../../components/Feedback';
import { Badge, Button, Card } from '../../components/ui';

// Tab Vai trò & quyền: xem quyền của từng vai trò, sửa (cần iam.admin).
// Vai trò ADMIN luôn giữ iam.admin / iam.read / iam.write (server cũng chặn).
const PROTECTED = ['iam.admin', 'iam.read', 'iam.write'];

export default function RolesTab() {
  const { can } = useAuth();
  const canEdit = can('iam.admin');
  const roles = useApi(() => api.get('/roles'), []);
  const perms = useApi(() => api.get('/permissions'), []);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [checked, setChecked] = useState(new Set());
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!selected && roles.data?.length) setSelected(roles.data[0].id); }, [roles.data, selected]);
  useEffect(() => {
    if (!selected) return;
    setDetail(null); setError(null); setSaved(false);
    api.get(`/roles/${selected}`).then((d) => { setDetail(d); setChecked(new Set(d.permissions.map((p) => p.permission_code))); }).catch(setError);
  }, [selected]);

  const original = useMemo(() => new Set(detail?.permissions.map((p) => p.permission_code) ?? []), [detail]);
  const changes = useMemo(() => [...checked].filter((c) => !original.has(c)).length + [...original].filter((c) => !checked.has(c)).length, [checked, original]);
  const groups = useMemo(() => {
    const g = {};
    (perms.data || []).forEach((p) => { (g[p.domain] ||= []).push(p); });
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [perms.data]);

  const toggle = (code) => { setSaved(false); setChecked((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; }); };

  async function save() {
    setBusy(true); setError(null); setSaved(false);
    try {
      const d = await api.put(`/roles/${selected}/permissions`, { permission_codes: [...checked] });
      setDetail(d); setChecked(new Set(d.permissions.map((p) => p.permission_code))); setSaved(true); roles.reload();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  if (roles.loading || perms.loading) return <Spinner />;
  return (
    <div className="roles-layout">
      <div>
        <ErrorBox error={roles.error || perms.error} />
        {(roles.data || []).map((r) => (
          <button key={r.id} className={`role-item ${selected === r.id ? 'active' : ''}`} onClick={() => setSelected(r.id)}>
            <strong>{r.role_code}</strong>
            <small>{r.name}</small>
            <small>{r.permission_count} quyền · {r.active_user_count} người dùng</small>
          </button>))}
      </div>

      <Card title={detail ? `Quyền của ${detail.role_code}` : 'Quyền'} actions={canEdit && detail && <Button variant="primary" size="sm" loading={busy} disabled={changes === 0} onClick={save}>Lưu{changes ? ` (${changes} thay đổi)` : ''}</Button>}>
        <ErrorBox error={error} />
        {saved && <div className="alert alert-ok">Đã lưu. Quyền mới có hiệu lực ngay với mọi người dùng.</div>}
        {!detail ? <Spinner /> : (
          <>
            <p className="muted">{detail.description || detail.name}{!canEdit && <> · <Badge>Chỉ xem (cần quyền iam.admin để sửa)</Badge></>}</p>
            {groups.map(([domain, list]) => (
              <div className="perm-group" key={domain}>
                <h3>{domain}</h3>
                <div className="perm-grid">
                  {list.map((p) => {
                    const locked = detail.role_code === 'ADMIN' && PROTECTED.includes(p.permission_code);
                    return (
                      <label key={p.permission_code} className={locked ? 'locked' : ''} title={p.description || ''}>
                        <input type="checkbox" checked={checked.has(p.permission_code)} disabled={!canEdit || locked} onChange={() => toggle(p.permission_code)} />
                        <span className="mono">{p.permission_code}</span>{locked && ' 🔒'}
                      </label>);
                  })}
                </div>
              </div>))}
          </>)}
      </Card>
    </div>
  );
}

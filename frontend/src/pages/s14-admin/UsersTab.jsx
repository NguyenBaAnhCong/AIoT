import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import { ErrorBox } from '../../components/Feedback';
import { Badge, Button, Card, Field } from '../../components/ui';
import Modal from './Modal';
import Pager from './Pager';
import { copyText, fmt } from './helpers';

// Tab Người dùng: tìm kiếm, tạo, sửa, khóa / mở khóa, đặt lại mật khẩu. KHÔNG có nút xóa (chủ ý, giữ lịch sử audit).
export default function UsersTab() {
  const { user: me, can } = useAuth();
  const canWrite = can('iam.write');
  const [filters, setFilters] = useState({ q: '', active: '', role: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [modal, setModal] = useState(null); // { type: 'create' | 'edit' | 'password', user?, password? }
  const [notice, setNotice] = useState(null);

  const list = useApi(() => api.page('/users', { ...filters, page, limit: 15 }), [filters, page, tick]);
  const roles = useApi(() => api.get('/roles'), []);
  const reload = () => setTick((t) => t + 1);

  async function act(fn, okMsg) {
    setNotice(null);
    try { await fn(); setNotice({ ok: true, message: okMsg }); reload(); } catch (error) { setNotice({ ok: false, error }); }
  }
  const toggleActive = (u) => {
    if (!window.confirm(u.is_active ? `Khóa tài khoản "${u.username}"? Người này sẽ bị đăng xuất ngay.` : `Mở khóa tài khoản "${u.username}"?`)) return;
    act(() => api.post(`/users/${u.id}/${u.is_active ? 'deactivate' : 'activate'}`), u.is_active ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.');
  };
  const resetPassword = async (u) => {
    if (!window.confirm(`Đặt lại mật khẩu của "${u.username}"? Mật khẩu cũ sẽ không dùng được nữa.`)) return;
    setNotice(null);
    try { setModal({ type: 'password', user: u, password: (await api.post(`/users/${u.id}/reset-password`, {})).temporary_password }); }
    catch (error) { setNotice({ ok: false, error }); }
  };

  const columns = [
    { key: 'username', title: 'Tên đăng nhập', render: (u) => <><strong>{u.username}</strong>{u.id === me.id && <> <Badge tone="info">Bạn</Badge></>}<div className="muted small">{u.email}</div></> },
    { key: 'full_name', title: 'Họ tên' },
    { key: 'roles', title: 'Vai trò', render: (u) => u.roles.length ? u.roles.map((r) => <Badge key={r} tone={r === 'ADMIN' ? 'warn' : 'info'}>{r}</Badge>) : <span className="muted">—</span> },
    { key: 'is_active', title: 'Trạng thái', render: (u) => <Badge tone={u.is_active ? 'ok' : 'bad'}>{u.is_active ? 'Hoạt động' : 'Đã khóa'}</Badge> },
    { key: 'last_login_at', title: 'Đăng nhập gần nhất', render: (u) => fmt(u.last_login_at) },
    { key: 'act', title: '', render: (u) => canWrite && (
      <div className="row-actions">
        <Button size="sm" onClick={() => setModal({ type: 'edit', user: u })}>Sửa</Button>
        <Button size="sm" onClick={() => resetPassword(u)}>Đặt lại MK</Button>
        <Button size="sm" variant="danger" disabled={u.id === me.id && u.is_active} title={u.id === me.id ? 'Không thể tự khóa chính mình' : ''} onClick={() => toggleActive(u)}>
          {u.is_active ? 'Khóa' : 'Mở khóa'}
        </Button>
      </div>) },
  ];

  return (
    <>
      {notice && (notice.ok
        ? <div className="alert alert-ok">{notice.message}<button className="btn btn-sm" onClick={() => setNotice(null)}>Đóng</button></div>
        : <ErrorBox error={notice.error} />)}

      <Card title="Người dùng" actions={canWrite && <Button variant="primary" size="sm" onClick={() => setModal({ type: 'create' })}>+ Thêm người dùng</Button>}>
        <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setFilters((f) => ({ ...f, q: search.trim() })); }}>
          <Field label="Tìm kiếm"><input className="grow" placeholder="Tên đăng nhập, email, họ tên…" value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
          <Field label="Vai trò">
            <select value={filters.role} onChange={(e) => { setPage(1); setFilters({ ...filters, role: e.target.value }); }}>
              <option value="">Tất cả</option>
              {(roles.data || []).map((r) => <option key={r.id} value={r.role_code}>{r.role_code}</option>)}
            </select>
          </Field>
          <Field label="Trạng thái">
            <select value={filters.active} onChange={(e) => { setPage(1); setFilters({ ...filters, active: e.target.value }); }}>
              <option value="">Tất cả</option><option value="true">Hoạt động</option><option value="false">Đã khóa</option>
            </select>
          </Field>
          <Button type="submit">Tìm</Button>
        </form>
        <ErrorBox error={list.error} onRetry={list.reload} />
        <DataTable columns={columns} rows={list.data?.data} loading={list.loading} empty={{ title: 'Không có người dùng phù hợp' }} />
        <Pager meta={list.data?.meta} onPage={setPage} />
      </Card>

      {modal?.type === 'create' && <UserFormModal roles={roles.data || []} onClose={() => setModal(null)} onSaved={(msg) => { setModal(null); setNotice({ ok: true, message: msg }); reload(); }} />}
      {modal?.type === 'edit' && <UserFormModal user={modal.user} isSelf={modal.user.id === me.id} roles={roles.data || []} onClose={() => setModal(null)} onSaved={(msg) => { setModal(null); setNotice({ ok: true, message: msg }); reload(); }} />}
      {modal?.type === 'password' && (
        <Modal title="Mật khẩu tạm" onClose={() => setModal(null)}>
          <p>Mật khẩu mới của <strong>{modal.user.username}</strong> (hệ thống sẽ <strong>không hiển thị lại</strong>):</p>
          <code className="secret mono">{modal.password}</code>
          <div className="modal-foot"><Button onClick={() => copyText(modal.password)}>Sao chép</Button><Button variant="primary" onClick={() => setModal(null)}>Đã lưu</Button></div>
        </Modal>)}
    </>
  );
}

function UserFormModal({ user, isSelf = false, roles, onClose, onSaved }) {
  const editing = Boolean(user);
  const orgs = useApi(() => api.get('/organizations'), []);
  const [form, setForm] = useState({
    username: '', email: user?.email ?? '', full_name: user?.full_name ?? '', password: '',
    role_codes: user?.roles ?? ['VIEWER'], organization_id: user?.organization_id ?? '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleRole = (code) => set('role_codes', form.role_codes.includes(code) ? form.role_codes.filter((c) => c !== code) : [...form.role_codes, code]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const org = form.organization_id || null;
      if (editing) {
        const body = { email: form.email, full_name: form.full_name, organization_id: org };
        if (!isSelf) body.role_codes = form.role_codes; // không tự đổi vai trò của chính mình
        await api.patch(`/users/${user.id}`, body);
        onSaved(`Đã cập nhật "${user.username}".`);
      } else {
        await api.post('/users', { username: form.username, email: form.email, full_name: form.full_name, password: form.password, role_codes: form.role_codes, organization_id: org });
        onSaved(`Đã tạo người dùng "${form.username}".`);
      }
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <Modal title={editing ? `Sửa: ${user.username}` : 'Thêm người dùng'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBox error={error} />
        {!editing && <Field label="Tên đăng nhập (chữ thường, số, _ . -)"><input value={form.username} onChange={(e) => set('username', e.target.value)} required autoFocus /></Field>}
        <Field label="Họ tên"><input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required /></Field>
        {!editing && <Field label="Mật khẩu (≥ 8 ký tự, có chữ và số)"><input type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} required /></Field>}
        <Field label="Tổ chức">
          <select value={form.organization_id} onChange={(e) => set('organization_id', e.target.value)}>
            <option value="">(không)</option>
            {(orgs.data || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <div className="field">
          <span className="field-label">Vai trò</span>
          {isSelf
            ? <div className="muted small">Bạn không thể tự đổi vai trò của chính mình. Hiện tại: {form.role_codes.join(', ') || '—'}</div>
            : <div className="checks-col">{roles.map((r) => (
                <label key={r.id}><input type="checkbox" checked={form.role_codes.includes(r.role_code)} onChange={() => toggleRole(r.role_code)} /> <strong>{r.role_code}</strong> <span className="muted small">{r.name}</span></label>))}</div>}
        </div>
        <div className="modal-foot"><Button type="button" onClick={onClose}>Hủy</Button><Button variant="primary" type="submit" loading={busy}>{editing ? 'Lưu' : 'Tạo'}</Button></div>
      </form>
    </Modal>
  );
}

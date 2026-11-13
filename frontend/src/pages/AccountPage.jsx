import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox } from '../components/Feedback';
import { Badge, Button, Card, Field, PageHeader } from '../components/ui';

export default function AccountPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setDone(false);
    if (form.newPassword !== form.confirm) {
      setError({ message: 'Mật khẩu nhập lại không khớp' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setDone(true);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Tài khoản của tôi" />
      <div className="grid-2">
        <Card title="Thông tin">
          <dl className="kv">
            <dt>Họ tên</dt><dd>{user.fullName}</dd>
            <dt>Tên đăng nhập</dt><dd>{user.username}</dd>
            <dt>Email</dt><dd>{user.email}</dd>
            <dt>Vai trò</dt><dd>{user.roles.map((r) => <Badge key={r} tone="info">{r}</Badge>)}</dd>
            <dt>Số quyền</dt><dd>{user.permissions.length}</dd>
          </dl>
        </Card>
        <Card title="Đổi mật khẩu">
          <form onSubmit={onSubmit} className="form">
            <ErrorBox error={error} />
            {done && <div className="alert alert-ok">Đã đổi mật khẩu.</div>}
            <Field label="Mật khẩu hiện tại"><input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required /></Field>
            <Field label="Mật khẩu mới (≥ 8 ký tự, có chữ và số)"><input type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required /></Field>
            <Field label="Nhập lại mật khẩu mới"><input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required /></Field>
            <Button variant="primary" type="submit" loading={busy}>Đổi mật khẩu</Button>
          </form>
        </Card>
      </div>
    </>
  );
}

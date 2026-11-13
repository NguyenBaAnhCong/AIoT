import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox } from '../components/Feedback';
import { Button, Field } from '../components/ui';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from?.pathname || '/'} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(form.username.trim(), form.password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          <span className="brand-mark big">🌱</span>
          <h1>Edge-AIoT Biochar</h1>
          <p className="muted">Hệ thống giám sát sức khỏe đất</p>
        </div>

        <ErrorBox error={error} />

        <Field label="Tên đăng nhập hoặc email">
          <input autoFocus autoComplete="username" value={form.username}
                 onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        </Field>
        <Field label="Mật khẩu">
          <input type="password" autoComplete="current-password" value={form.password}
                 onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </Field>
        <Button variant="primary" type="submit" loading={busy}>Đăng nhập</Button>

        {import.meta.env.DEV && (
          <p className="muted small dev-hint">
            Môi trường phát triển – tài khoản demo: <code>admin</code>, <code>researcher01</code>, <code>labtech01</code>
            {' '}· mật khẩu mặc định <code>Biochar@2026</code>
          </p>
        )}
      </form>
    </div>
  );
}

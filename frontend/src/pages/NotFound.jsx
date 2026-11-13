import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="login-page">
      <div className="login-card center">
        <h1>404</h1>
        <p className="muted">Không tìm thấy trang này.</p>
        <Link to="/" className="btn btn-primary">Về trang chủ</Link>
      </div>
    </div>
  );
}

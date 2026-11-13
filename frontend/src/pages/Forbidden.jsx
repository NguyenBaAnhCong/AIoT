import { Link } from 'react-router-dom';
import { PageHeader, Card } from '../components/ui';

export default function Forbidden({ permission }) {
  return (
    <>
      <PageHeader title="Không có quyền truy cập" />
      <Card>
        <p>Tài khoản của bạn chưa được cấp quyền để xem trang này{permission ? <> (cần quyền <code>{permission}</code>)</> : null}.</p>
        <p className="muted">Hãy liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn.</p>
        <Link to="/" className="btn">Về trang chủ</Link>
      </Card>
    </>
  );
}

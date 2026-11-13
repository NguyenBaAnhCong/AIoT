import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Spinner } from '../components/Feedback';
import Forbidden from '../pages/Forbidden';

/** Bọc một route: chưa đăng nhập -> trang login; thiếu quyền -> trang 403. */
export default function ProtectedRoute({ permission, children }) {
  const { user, loading, can } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner full />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (permission && !can(permission)) return <Forbidden permission={permission} />;
  return children;
}

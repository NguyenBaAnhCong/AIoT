import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from './auth/ProtectedRoute';
import Layout from './components/Layout';
import { Spinner } from './components/Feedback';
import LoginPage from './pages/LoginPage';
import AccountPage from './pages/AccountPage';
import NotFound from './pages/NotFound';
import { screens } from './screens';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Mọi trang bên trong yêu cầu đăng nhập; mỗi màn hình kiểm tra thêm quyền riêng của nó */}
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        {screens.map(({ id, path, permission, component: Screen }) => (
          <Route
            key={id}
            path={path === '/' ? '/' : `${path}/*`}
            element={
              <ProtectedRoute permission={permission}>
                <Suspense fallback={<Spinner />}><Screen /></Suspense>
              </ProtectedRoute>
            }
          />
        ))}
        <Route path="/account" element={<AccountPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

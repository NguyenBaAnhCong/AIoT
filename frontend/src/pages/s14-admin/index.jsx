import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/ui';
import Forbidden from '../Forbidden';
import UsersTab from './UsersTab';
import RolesTab from './RolesTab';
import ApiKeysTab from './ApiKeysTab';
import AuditTab from './AuditTab';
import SystemTab from './SystemTab';
import './admin.css';

// Màn hình 14 – Quản trị hệ thống (TV1). Mỗi tab là một đường dẫn con của /admin.
const TABS = [
  { path: 'users', label: 'Người dùng', perm: 'iam.read', Component: UsersTab },
  { path: 'roles', label: 'Vai trò & quyền', perm: 'iam.read', Component: RolesTab },
  { path: 'api-keys', label: 'API key', perm: 'iam.read', Component: ApiKeysTab },
  { path: 'audit', label: 'Nhật ký', perm: 'audit.read', Component: AuditTab },
  { path: 'system', label: 'Hệ thống', perm: 'iam.read', Component: SystemTab },
];

export default function AdminPage() {
  const { can } = useAuth();
  const tabs = TABS.filter((t) => can(t.perm));
  return (
    <>
      <PageHeader title="Quản trị hệ thống" subtitle="Người dùng, vai trò và quyền, API key cho thiết bị, nhật ký và tình trạng hệ thống." />
      <nav className="tabs">
        {tabs.map((t) => <NavLink key={t.path} to={`/admin/${t.path}`} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>{t.label}</NavLink>)}
      </nav>
      <Routes>
        <Route index element={<Navigate to={tabs[0]?.path ?? 'users'} replace />} />
        {TABS.map(({ path, perm, Component }) => <Route key={path} path={path} element={can(perm) ? <Component /> : <Forbidden permission={perm} />} />)}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </>
  );
}

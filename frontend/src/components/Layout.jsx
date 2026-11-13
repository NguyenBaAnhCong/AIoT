import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { screens, groups } from '../screens';

export default function Layout() {
  const { user, can, logout } = useAuth();
  const visible = screens.filter((s) => can(s.permission));

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-mark">🌱</span>
          <span>
            <strong>Edge-AIoT</strong>
            <small>Sức khỏe đất · Biochar</small>
          </span>
        </Link>
        <nav>
          {groups.map((g) => {
            const items = visible.filter((s) => s.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="nav-group">
                <div className="nav-group-title">{g}</div>
                {items.map((s) => (
                  <NavLink key={s.id} to={s.path} end={s.path === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <span>{s.title}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div />
          <div className="user-box">
            <Link to="/account" className="user-link">
              <span className="avatar">{(user.fullName || user.username).trim().charAt(0).toUpperCase()}</span>
              <span>
                <strong>{user.fullName}</strong>
                <small>{user.roles.join(', ') || 'Chưa có vai trò'}</small>
              </span>
            </Link>
            <button className="btn btn-sm" onClick={logout}>Đăng xuất</button>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}

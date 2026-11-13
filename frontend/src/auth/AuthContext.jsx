import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore, setSessionExpiredHandler } from '../lib/api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const logout = useCallback(() => { tokenStore.clear(); setUser(null); }, []);

  // Khi làm mới token thất bại, api.js gọi hàm này để đưa người dùng về trang đăng nhập
  useEffect(() => { setSessionExpiredHandler(logout); }, [logout]);

  // Mở lại trang: nếu còn token thì lấy thông tin người dùng
  useEffect(() => {
    if (!tokenStore.get()) return;
    api.get('/auth/me').then(setUser).catch(() => tokenStore.clear()).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.post('/auth/login', { username, password });
    tokenStore.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(() => ({
    user, loading, login, logout,
    /** Có ÍT NHẤT một trong các quyền này không? Không truyền = chỉ cần đăng nhập. */
    can: (...codes) => Boolean(user) && (codes.length === 0 || codes.some((c) => user.permissions.includes(c))),
  }), [user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

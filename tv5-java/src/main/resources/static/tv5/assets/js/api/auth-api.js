import { clearSession, request, tokens } from './http.js';
let user;
export function can(permission) { return Boolean(user?.permissions?.includes(permission)); }
export const logout = clearSession;
export async function currentUser() {
  if (!tokens().accessToken && !tokens().refreshToken) { clearSession(); throw new Error('Cần đăng nhập.'); }
  user = (await request('/api/v1/auth/me')).data;
  return user;
}

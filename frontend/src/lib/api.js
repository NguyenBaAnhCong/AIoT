// =====================================================================
// Bộ gọi API dùng chung. MỌI thành viên gọi backend qua file này, không tự viết fetch.
//
//   import { api } from '../lib/api';
//   const plots = await api.get('/plots', { status: 'ACTIVE' });      // trả về phần "data"
//   const { data, meta } = await api.page('/plots', { page: 2 });     // kèm phân trang
//   await api.post('/plots', { name: 'Ô A1' });
//
// Tự gắn token, tự làm mới access token khi hết hạn, ném ApiError khi lỗi.
// =====================================================================
const BASE = '/api/v1';
const STORAGE_KEY = 'biochar.auth';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ---- lưu token (localStorage: đủ cho đồ án; sản phẩm thật nên dùng cookie httpOnly) ----
export const tokenStore = {
  get() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
  },
  set(tokens) { localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens)); },
  clear() { localStorage.removeItem(STORAGE_KEY); },
};

let onSessionExpired = () => {};
export const setSessionExpiredHandler = (fn) => { onSessionExpired = fn; };

// Nhiều request cùng gặp 401 thì chỉ làm mới token MỘT lần
let refreshing = null;
async function refreshAccessToken() {
  const tokens = tokenStore.get();
  if (!tokens?.refreshToken) throw new ApiError(401, 'UNAUTHORIZED', 'Chưa đăng nhập');
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) throw new ApiError(401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn');
      const { data } = await res.json();
      tokenStore.set({ ...tokens, accessToken: data.accessToken });
      return data.accessToken;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

function buildUrl(path, params) {
  const url = new URL(BASE + path, window.location.origin);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  return url.pathname + url.search;
}

async function request(method, path, { body, params, retry = true } = {}) {
  const tokens = tokenStore.get();
  const res = await fetch(buildUrl(path, params), {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Access token hết hạn -> làm mới rồi gọi lại đúng một lần
  if (res.status === 401 && retry && tokens?.refreshToken && !path.startsWith('/auth/')) {
    try {
      await refreshAccessToken();
      return request(method, path, { body, params, retry: false });
    } catch {
      tokenStore.clear();
      onSessionExpired();
      throw new ApiError(401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn');
    }
  }

  if (res.status === 204) return { data: null };
  let json = null;
  try { json = await res.json(); } catch { /* không có nội dung JSON */ }
  if (!res.ok) {
    const e = json?.error || {};
    throw new ApiError(res.status, e.code || 'ERROR', e.message || `Lỗi ${res.status}`, e.details);
  }
  return json;
}

export const api = {
  get: async (path, params) => (await request('GET', path, { params })).data,
  page: (path, params) => request('GET', path, { params }), // { data, meta }
  post: async (path, body) => (await request('POST', path, { body: body ?? {} })).data,
  put: async (path, body) => (await request('PUT', path, { body })).data,
  patch: async (path, body) => (await request('PATCH', path, { body })).data,
  del: async (path) => (await request('DELETE', path)).data,
};

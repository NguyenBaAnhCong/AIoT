// TV1: gắn token đăng nhập (do trang React lưu) vào mọi request /api/v1 của trang TV4.
// Chỉ hoạt động khi mở trang này cùng địa chỉ với trang React (cổng 5173 khi dev, 8080 khi chạy Docker).
(() => {
  const KEY = 'biochar.auth';
  const nativeFetch = window.fetch.bind(window);
  const tokens = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

  let refreshing = null;
  const refresh = () => (refreshing ??= nativeFetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens().refreshToken }),
  })
    .then(async (r) => {
      if (!r.ok) throw new Error('refresh');
      const { data } = await r.json();
      localStorage.setItem(KEY, JSON.stringify({ ...tokens(), accessToken: data.accessToken }));
      return data.accessToken;
    })
    .finally(() => { refreshing = null; }));

  const goLogin = () => { localStorage.removeItem(KEY); location.href = '/login'; };

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/v1') || url.startsWith('/api/v1/auth/')) return nativeFetch(input, init);
    const send = (token) => nativeFetch(input, {
      ...init,
      headers: { ...(init.headers || {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    });
    let res = await send(tokens().accessToken);
    if (res.status === 401 && tokens().refreshToken) {
      try { res = await send(await refresh()); } catch { goLogin(); }
    } else if (res.status === 401) {
      goLogin();
    }
    return res;
  };
})();
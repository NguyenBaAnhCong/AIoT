const storageKey = 'biochar.auth';
let refreshing;

export function tokens() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || {}; }
  catch { return {}; }
}


export function clearSession() {
  localStorage.removeItem(storageKey);
  location.assign('/login');
}

export async function request(path, { method = 'GET', data, signal, binary = false, retry = true } = {}) {
  const token = tokens().accessToken;
  const response = await fetch(path, {
    method, signal,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (response.status === 401 && retry && tokens().refreshToken) {
    refreshing ??= fetch('/api/v1/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens().refreshToken }),
    }).then(async result => {
      if (!result.ok) throw new Error('Phiên đăng nhập đã hết hạn.');
      const { data: update } = await result.json();
      localStorage.setItem(storageKey, JSON.stringify({ ...tokens(), ...update }));
    }).finally(() => { refreshing = undefined; });
    try { await refreshing; }
    catch { clearSession(); throw new Error('Cần đăng nhập lại.'); }
    return request(path, { method, data, signal, binary, retry: false });
  }
  if (response.status === 401) { clearSession(); throw new Error('Cần đăng nhập lại.'); }
  if (response.ok && binary) return response.blob();
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || 'Không xử lý được yêu cầu.');
  return body;
}

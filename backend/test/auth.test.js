// Test tích hợp cho xác thực, phân quyền, API key, audit.
// Cần database đang chạy (docker compose up -d db). Chạy:  npm test
process.env.NODE_ENV = 'test';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

const { default: app } = await import('../src/app.js');
const { pool, query } = await import('../src/config/db.js');
const { ensureDevPasswords } = await import('../src/lib/devSeed.js');
const { runMigrations } = await import('../src/migrate.js');

let server, base;
const TEST_USER = `test_${Date.now()}`;
const TEST_PW = 'Matkhau123';

before(async () => {
  await runMigrations();
  await ensureDevPasswords();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  await query('DELETE FROM audit.access_logs WHERE user_id IN (SELECT user_id FROM iam.users WHERE username = $1)', [TEST_USER]);
  await query('DELETE FROM iam.users WHERE username = $1', [TEST_USER]);
  await new Promise((r) => server.close(r));
  await pool.end();
});

async function call(method, path, { token, key, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { 'X-API-Key': key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
const login = async (username, password = process.env.DEV_DEFAULT_PASSWORD || 'Biochar@2026') =>
  (await call('POST', '/auth/login', { body: { username, password } }));

test('health công khai, trả đủ 16 schema', async () => {
  const r = await call('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.data.domain_schemas, 16);
});

test('đường dẫn cần đăng nhập trả 401 khi thiếu / sai token', async () => {
  assert.equal((await call('GET', '/auth/me')).status, 401);
  assert.equal((await call('GET', '/auth/me', { token: 'khong.phai.token' })).status, 401);
});

test('đăng nhập sai mật khẩu và tài khoản không tồn tại đều trả cùng một lỗi', async () => {
  const a = await login('admin', 'sai-mat-khau');
  const b = await login('khong_ton_tai', 'bat-ky');
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.json.error.message, b.json.error.message);
});

test('admin đăng nhập, /auth/me có vai trò ADMIN và quyền iam.admin; refresh hoạt động', async () => {
  const r = await login('admin');
  assert.equal(r.status, 200);
  const { accessToken, refreshToken, user } = r.json.data;
  assert.ok(accessToken && refreshToken);
  assert.ok(user.roles.includes('ADMIN'));
  assert.ok(user.permissions.includes('iam.admin'));
  assert.equal(user.password_hash, undefined);

  const me = await call('GET', '/auth/me', { token: accessToken });
  assert.equal(me.json.data.username, 'admin');

  const rf = await call('POST', '/auth/refresh', { body: { refreshToken } });
  assert.equal(rf.status, 200);
  // access token không dùng được làm refresh token
  assert.equal((await call('POST', '/auth/refresh', { body: { refreshToken: accessToken } })).status, 401);
});

test('phân quyền: researcher01 không tạo được API key (403), admin thì được', async () => {
  const res = (await login('researcher01')).json.data;
  const denied = await call('POST', '/api-keys', { token: res.accessToken, body: { label: 'x', scopes: ['iot.ingest'] } });
  assert.equal(denied.status, 403);
  assert.equal(denied.json.error.code, 'FORBIDDEN');
});

test('vòng đời API key: tạo → ping → sai phạm vi → thu hồi → bị từ chối', async () => {
  const admin = (await login('admin')).json.data;

  const bad = await call('POST', '/api-keys', { token: admin.accessToken, body: { label: '', scopes: [] } });
  assert.equal(bad.status, 400);

  const c = await call('POST', '/api-keys', { token: admin.accessToken, body: { label: 'Gateway test', scopes: ['iot.ingest'] } });
  assert.equal(c.status, 201);
  const { key, id, prefix } = c.json.data;
  assert.match(key, /^ak_[0-9a-f]{8}_/);
  assert.ok(key.startsWith(prefix));

  // Danh sách không bao giờ chứa key gốc hoặc hash
  const list = await call('GET', '/api-keys', { token: admin.accessToken });
  const mine = list.json.data.find((k) => k.id === id);
  assert.equal(mine.status, 'ACTIVE');
  assert.equal(JSON.stringify(list.json).includes(key), false);
  assert.equal(mine.key_hash, undefined);

  // DB chỉ lưu hash, không lưu key gốc
  const { rows } = await query('SELECT key_hash FROM iam.api_keys WHERE api_key_id = $1', [id]);
  assert.notEqual(rows[0].key_hash, key);
  assert.match(rows[0].key_hash, /^[0-9a-f]{64}$/);

  assert.equal((await call('GET', '/gateway/ping', { key })).status, 200);
  assert.equal((await call('GET', '/gateway/ping')).status, 401);
  assert.equal((await call('GET', '/gateway/ping', { key: 'ak_00000000_sai' })).status, 401);

  const readOnly = (await call('POST', '/api-keys', { token: admin.accessToken, body: { label: 'chỉ đọc', scopes: ['iot.read'] } })).json.data;
  assert.equal((await call('GET', '/gateway/ping', { key: readOnly.key })).status, 403);

  assert.equal((await call('POST', `/api-keys/${id}/revoke`, { token: admin.accessToken })).status, 200);
  assert.equal((await call('GET', '/gateway/ping', { key })).status, 401);
  assert.equal((await call('POST', `/api-keys/${id}/revoke`, { token: admin.accessToken })).status, 404);
});

test('audit: thao tác tạo API key được ghi nhận đúng người và đúng nhật ký truy cập', async () => {
  const admin = (await login('admin')).json.data;
  const c = await call('POST', '/api-keys', { token: admin.accessToken, body: { label: 'Audit test', scopes: ['iot.read'] } });
  const id = c.json.data.id;

  const a = await query(
    `SELECT actor_id, actor_type, new_data FROM audit.audit_logs
      WHERE table_name = 'api_keys' AND operation = 'INSERT' AND record_pk->>'api_key_id' = $1`, [id]);
  assert.equal(a.rows.length, 1);
  assert.equal(a.rows[0].actor_type, 'USER');
  assert.equal(a.rows[0].actor_id, admin.user.id);
  assert.equal(a.rows[0].new_data.key_hash, undefined, 'hash không được lọt vào audit');

  const l = await query(`SELECT count(*)::int AS n FROM audit.access_logs WHERE user_id = $1 AND action = 'LOGIN'`, [admin.user.id]);
  assert.ok(l.rows[0].n >= 1);
  const w = await query(`SELECT count(*)::int AS n FROM audit.access_logs
                          WHERE user_id = $1 AND action = 'API_CALL' AND http_method = 'POST' AND resource = '/api/v1/api-keys'`, [admin.user.id]);
  assert.ok(w.rows[0].n >= 1);
});

test('đổi mật khẩu: kiểm tra độ mạnh, mật khẩu cũ, đăng nhập lại bằng mật khẩu mới', async () => {
  await query(`INSERT INTO iam.users (username, email, full_name, password_hash) VALUES ($1, $2, 'Người dùng test', $3)`,
    [TEST_USER, `${TEST_USER}@example.test`, await bcrypt.hash(TEST_PW, 10)]);
  const t = (await login(TEST_USER, TEST_PW)).json.data.accessToken;

  assert.equal((await call('POST', '/auth/change-password', { token: t, body: { currentPassword: TEST_PW, newPassword: 'ngan1' } })).status, 400);
  assert.equal((await call('POST', '/auth/change-password', { token: t, body: { currentPassword: 'sai', newPassword: 'MatKhauMoi99' } })).status, 400);
  assert.equal((await call('POST', '/auth/change-password', { token: t, body: { currentPassword: TEST_PW, newPassword: 'MatKhauMoi99' } })).status, 204);

  assert.equal((await login(TEST_USER, TEST_PW)).status, 401);
  assert.equal((await login(TEST_USER, 'MatKhauMoi99')).status, 200);
});

test('tài khoản bị khóa không dùng được token cũ', async () => {
  const t = (await login(TEST_USER, 'MatKhauMoi99')).json.data.accessToken;
  await query('UPDATE iam.users SET is_active = false WHERE username = $1', [TEST_USER]);
  const { invalidateUser } = await import('../src/lib/userCache.js');
  invalidateUser();
  assert.equal((await call('GET', '/auth/me', { token: t })).status, 401);
  assert.equal((await login(TEST_USER, 'MatKhauMoi99')).status, 401);
});

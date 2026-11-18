// Test tích hợp cho API quản trị của TV1: users, roles, permissions, organizations, audit, ref, dashboard, system.
// Cần database đang chạy. Chạy: npm test
process.env.NODE_ENV = 'test';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { default: app } = await import('../src/app.js');
const { pool, query } = await import('../src/config/db.js');
const { ensureDevPasswords } = await import('../src/lib/devSeed.js');
const { runMigrations } = await import('../src/migrate.js');
const { invalidateUser } = await import('../src/lib/userCache.js');

let server, base, admin, researcher, labtech;
const PW = process.env.DEV_DEFAULT_PASSWORD || 'Biochar@2026';
const SUFFIX = Date.now().toString(36);
const created = { users: [], orgs: [], params: [] };

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
const login = async (username, password = PW) => (await call('POST', '/auth/login', { body: { username, password } })).json?.data;

before(async () => {
  await runMigrations();
  await ensureDevPasswords();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
  admin = await login('admin'); researcher = await login('researcher01'); labtech = await login('labtech01');
});

after(async () => {
  for (const u of created.users) {
    await query('DELETE FROM audit.access_logs WHERE user_id = $1', [u]);
    await query('DELETE FROM iam.users WHERE user_id = $1', [u]);
  }
  for (const o of created.orgs) await query('DELETE FROM iam.organizations WHERE organization_id = $1', [o]);
  for (const p of created.params) await query('DELETE FROM ref.parameters WHERE parameter_code = $1', [p]);
  await new Promise((r) => server.close(r));
  await pool.end();
});

const newUser = (extra = {}) => ({
  username: `t_${SUFFIX}_${Math.random().toString(36).slice(2, 6)}`, email: `t_${SUFFIX}_${Math.random().toString(36).slice(2, 6)}@example.test`,
  full_name: 'Người dùng thử', password: 'MatKhau12345', role_codes: ['VIEWER'], ...extra,
});

// ---------------------------------------------------------------- users
test('users: cần quyền iam.read; admin xem được danh sách có phân trang, lọc và vai trò', async () => {
  assert.equal((await call('GET', '/users')).status, 401);
  assert.equal((await call('GET', '/users', { token: researcher.accessToken })).status, 403);

  const r = await call('GET', '/users?limit=2', { token: admin.accessToken });
  assert.equal(r.status, 200);
  assert.ok(r.json.meta.total >= 3 && r.json.data.length <= 2);
  assert.equal(r.json.data[0].password_hash, undefined);

  const f = await call('GET', '/users?q=admin&role=ADMIN&active=true', { token: admin.accessToken });
  assert.ok(f.json.data.some((u) => u.username === 'admin' && u.roles.includes('ADMIN')));
  assert.equal((await call('GET', '/users?active=maybe', { token: admin.accessToken })).status, 400);
});

test('users: tạo, kiểm tra đầu vào, trùng, vai trò lạ; người mới đăng nhập được', async () => {
  const body = newUser();
  const bad = await call('POST', '/users', { token: admin.accessToken, body: { username: 'A', email: 'x', full_name: '', password: '1' } });
  assert.equal(bad.status, 400);
  assert.ok(bad.json.error.details.length >= 3);

  const ok = await call('POST', '/users', { token: admin.accessToken, body });
  assert.equal(ok.status, 201);
  created.users.push(ok.json.data.id);
  assert.deepEqual(ok.json.data.roles, ['VIEWER']);
  assert.equal(ok.json.data.password_hash, undefined);
  assert.equal(ok.json.data.is_active, true);

  assert.equal((await call('POST', '/users', { token: admin.accessToken, body })).status, 409);                       // trùng username
  assert.equal((await call('POST', '/users', { token: admin.accessToken, body: newUser({ role_codes: ['KHONG_CO'] }) })).status, 400);
  assert.equal((await call('POST', '/users', { token: researcher.accessToken, body: newUser() })).status, 403);

  const l = await login(body.username, body.password);
  assert.ok(l.accessToken);
  assert.deepEqual(l.user.roles, ['VIEWER']);
});

test('users: sửa thông tin và vai trò; khóa / mở khóa có hiệu lực ngay', async () => {
  const body = newUser();
  const id = (await call('POST', '/users', { token: admin.accessToken, body })).json.data.id;
  created.users.push(id);

  const p = await call('PATCH', `/users/${id}`, { token: admin.accessToken, body: { full_name: 'Tên mới', role_codes: ['LAB_TECH', 'VIEWER'] } });
  assert.equal(p.status, 200);
  assert.equal(p.json.data.full_name, 'Tên mới');
  assert.deepEqual(p.json.data.roles.sort(), ['LAB_TECH', 'VIEWER']);
  assert.ok(p.json.data.permissions.includes('laboratory.approve'));
  assert.equal((await call('PATCH', `/users/${id}`, { token: admin.accessToken, body: {} })).status, 400);
  assert.equal((await call('PATCH', '/users/khong-phai-uuid', { token: admin.accessToken, body: { full_name: 'x' } })).status, 400);
  assert.equal((await call('GET', '/users/00000000-0000-4000-8000-000000000000', { token: admin.accessToken })).status, 404);

  const session = await login(body.username, body.password);
  assert.equal((await call('GET', '/auth/me', { token: session.accessToken })).status, 200);

  const lock = await call('POST', `/users/${id}/deactivate`, { token: admin.accessToken });
  assert.equal(lock.json.data.is_active, false);
  assert.equal((await call('GET', '/auth/me', { token: session.accessToken })).status, 401, 'token cũ phải mất hiệu lực ngay');
  assert.equal((await call('POST', '/auth/login', { body: { username: body.username, password: body.password } })).status, 401);

  assert.equal((await call('POST', `/users/${id}/activate`, { token: admin.accessToken })).json.data.is_active, true);
  assert.ok((await login(body.username, body.password)).accessToken);
});

test('users: KHÔNG tự khóa mình và KHÔNG tự đổi vai trò của mình', async () => {
  const me = admin.user.id;
  const a = await call('POST', `/users/${me}/deactivate`, { token: admin.accessToken });
  assert.equal(a.status, 400);
  assert.equal(a.json.error.code, 'SELF_LOCKOUT');

  const b = await call('PATCH', `/users/${me}`, { token: admin.accessToken, body: { role_codes: ['VIEWER'] } });
  assert.equal(b.status, 400);
  assert.equal(b.json.error.code, 'SELF_LOCKOUT');

  // sau các lần thử đó admin vẫn còn nguyên quyền
  const chk = await call('GET', '/auth/me', { token: admin.accessToken });
  assert.ok(chk.json.data.roles.includes('ADMIN') && chk.json.data.permissions.includes('iam.admin'));
});

test('users: không bao giờ để hệ thống hết quản trị viên (LAST_ADMIN)', async (t) => {
  const adminsNow = (await query(`SELECT u.user_id FROM iam.users u JOIN iam.user_roles ur USING(user_id) JOIN iam.roles r USING(role_id) WHERE r.role_code='ADMIN' AND u.is_active`)).rows;
  if (adminsNow.length !== 1) return t.skip('test này cần đúng 1 ADMIN đang hoạt động trong database');

  // Tạm thời cho RESEARCHER quyền iam.read + iam.write để có một người không phải ADMIN thử khóa admin
  const roles = (await call('GET', '/roles', { token: admin.accessToken })).json.data;
  const rid = roles.find((r) => r.role_code === 'RESEARCHER').id;
  const before = (await call('GET', `/roles/${rid}`, { token: admin.accessToken })).json.data.permissions.map((p) => p.permission_code);
  try {
    const up = await call('PUT', `/roles/${rid}/permissions`, { token: admin.accessToken, body: { permission_codes: [...before, 'iam.read', 'iam.write'] } });
    assert.equal(up.status, 200);

    const r2 = await login('researcher01');
    const lock = await call('POST', `/users/${admin.user.id}/deactivate`, { token: r2.accessToken });
    assert.equal(lock.status, 409);
    assert.equal(lock.json.error.code, 'LAST_ADMIN');

    const demote = await call('PATCH', `/users/${admin.user.id}`, { token: r2.accessToken, body: { role_codes: [] } });
    assert.equal(demote.status, 409);
    assert.equal(demote.json.error.code, 'LAST_ADMIN');
  } finally {
    await call('PUT', `/roles/${rid}/permissions`, { token: admin.accessToken, body: { permission_codes: before } });
    invalidateUser();
  }
  assert.equal((await call('POST', '/users', { token: (await login('researcher01')).accessToken, body: newUser() })).status, 403, 'đã khôi phục quyền');
});

test('users: đặt lại mật khẩu (có mật khẩu tạm hoặc chỉ định)', async () => {
  const body = newUser();
  const id = (await call('POST', '/users', { token: admin.accessToken, body })).json.data.id;
  created.users.push(id);

  const t = await call('POST', `/users/${id}/reset-password`, { token: admin.accessToken, body: {} });
  assert.equal(t.status, 200);
  assert.ok(t.json.data.temporary_password.length >= 12);
  assert.equal((await call('POST', '/auth/login', { body: { username: body.username, password: body.password } })).status, 401);
  assert.ok((await login(body.username, t.json.data.temporary_password)).accessToken);

  assert.equal((await call('POST', `/users/${id}/reset-password`, { token: admin.accessToken, body: { new_password: 'yeu' } })).status, 400);
  assert.equal((await call('POST', `/users/${id}/reset-password`, { token: admin.accessToken, body: { new_password: 'DatTay12345' } })).json.data.reset, true);
  assert.ok((await login(body.username, 'DatTay12345')).accessToken);
});

test('users: không có API xóa (chỉ khóa)', async () => {
  const r = await call('DELETE', `/users/${admin.user.id}`, { token: admin.accessToken });
  assert.equal(r.status, 404);
});

// ---------------------------------------------------------------- roles / permissions / organizations
test('roles & permissions: xem được; ADMIN luôn giữ quyền iam.*; mã quyền lạ bị từ chối', async () => {
  assert.equal((await call('GET', '/roles', { token: labtech.accessToken })).status, 403);
  const roles = (await call('GET', '/roles', { token: admin.accessToken })).json.data;
  assert.ok(roles.length >= 6);
  const adminRole = roles.find((r) => r.role_code === 'ADMIN');
  assert.ok(adminRole.permission_count >= 30 && adminRole.active_user_count >= 1);

  const detail = (await call('GET', `/roles/${adminRole.id}`, { token: admin.accessToken })).json.data;
  assert.ok(detail.permissions.some((p) => p.permission_code === 'iam.admin'));

  const all = (await call('GET', '/permissions', { token: admin.accessToken })).json.data;
  assert.ok(all.length >= 30 && all.every((p) => p.permission_code && p.domain && p.action));

  const without = detail.permissions.map((p) => p.permission_code).filter((c) => c !== 'iam.admin');
  const blocked = await call('PUT', `/roles/${adminRole.id}/permissions`, { token: admin.accessToken, body: { permission_codes: without } });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.json.error.code, 'PROTECTED_ROLE');

  const viewer = roles.find((r) => r.role_code === 'VIEWER');
  assert.equal((await call('PUT', `/roles/${viewer.id}/permissions`, { token: admin.accessToken, body: { permission_codes: ['khong.ton_tai'] } })).status, 400);
  assert.equal((await call('PUT', `/roles/${viewer.id}/permissions`, { token: researcher.accessToken, body: { permission_codes: [] } })).status, 403);
});

test('organizations: xem, tạo, trùng mã, sửa', async () => {
  const code = `T${SUFFIX}`.toUpperCase().slice(0, 12);
  const c = await call('POST', '/organizations', { token: admin.accessToken, body: { code, name: 'Tổ chức thử', org_type: 'FARM' } });
  assert.equal(c.status, 201);
  created.orgs.push(c.json.data.id);
  assert.equal((await call('POST', '/organizations', { token: admin.accessToken, body: { code, name: 'Trùng mã' } })).status, 409);
  assert.equal((await call('PATCH', `/organizations/${c.json.data.id}`, { token: admin.accessToken, body: { name: 'Tên khác' } })).json.data.name, 'Tên khác');
  assert.equal((await call('PATCH', `/organizations/${c.json.data.id}`, { token: admin.accessToken, body: {} })).status, 400);
  const list = (await call('GET', '/organizations', { token: admin.accessToken })).json.data;
  assert.ok(list.some((o) => o.id === c.json.data.id));
});

// ---------------------------------------------------------------- audit
test('audit: researcher (audit.read) xem được, labtech thì không; lọc đúng người, bảng, thao tác', async () => {
  assert.equal((await call('GET', '/audit/logs', { token: labtech.accessToken })).status, 403);

  const body = newUser();
  const id = (await call('POST', '/users', { token: admin.accessToken, body })).json.data.id;
  created.users.push(id);

  const r = await call('GET', `/audit/logs?schema=iam&table=users&operation=INSERT&actor_id=${admin.user.id}&limit=5`, { token: researcher.accessToken });
  assert.equal(r.status, 200);
  const row = r.json.data.find((x) => x.record_pk?.user_id === id);
  assert.ok(row, 'phải có bản ghi audit cho user vừa tạo');
  assert.equal(row.actor_username, 'admin');
  assert.equal(row.operation, 'INSERT');

  const d = await call('GET', `/audit/logs/${row.id}`, { token: researcher.accessToken });
  assert.equal(d.json.data.new_data.username, body.username);
  assert.equal(d.json.data.new_data.password_hash, undefined, 'hash mật khẩu không được lọt vào audit');
  assert.equal((await call('GET', '/audit/logs/999999999999', { token: researcher.accessToken })).status, 404);

  assert.equal((await call('GET', '/audit/logs?operation=TRUNCATE', { token: admin.accessToken })).status, 400);
  assert.equal((await call('GET', '/audit/logs?from=khong-phai-ngay', { token: admin.accessToken })).status, 400);
  const future = new Date(Date.now() + 86_400_000).toISOString();
  assert.equal((await call('GET', `/audit/logs?from=${future}`, { token: admin.accessToken })).json.data.length, 0);
});

test('audit: nhật ký truy cập lọc theo hành động, trạng thái; summary', async () => {
  await call('POST', '/auth/login', { body: { username: 'admin', password: 'sai-mat-khau' } });
  const f = await call('GET', '/audit/access-logs?action=LOGIN_FAILED&limit=5', { token: admin.accessToken });
  assert.equal(f.status, 200);
  assert.ok(f.json.data.length >= 1 && f.json.data.every((x) => x.action === 'LOGIN_FAILED'));

  const denied = await call('GET', '/audit/access-logs?action=API_CALL&status=403&limit=5', { token: admin.accessToken });
  assert.ok(denied.json.data.every((x) => x.status_code === 403));
  assert.equal((await call('GET', '/audit/access-logs?status=abc', { token: admin.accessToken })).status, 400);

  const s = (await call('GET', '/audit/summary', { token: admin.accessToken })).json.data;
  assert.equal(s.window_hours, 24);
  assert.ok(s.logins >= 1 && s.failed_logins >= 1);
});

// ---------------------------------------------------------------- ref
test('ref: ai đăng nhập cũng xem được danh mục; chỉ admin thêm/sửa; kiểm tra khoảng giá trị và trùng mã', async () => {
  assert.equal((await call('GET', '/ref/parameters')).status, 401);
  const list = (await call('GET', '/ref/parameters', { token: labtech.accessToken })).json.data;
  assert.ok(list.length >= 12 && list.some((p) => p.parameter_code === 'PH'));
  assert.ok((await call('GET', '/ref/parameters?category=SOIL_PHYS', { token: labtech.accessToken })).json.data.every((p) => p.category === 'SOIL_PHYS'));
  assert.equal((await call('GET', '/ref/parameters/ph', { token: labtech.accessToken })).json.data.parameter_code, 'PH');
  assert.equal((await call('GET', '/ref/parameters/KHONG_CO', { token: labtech.accessToken })).status, 404);

  const code = `TEST_${SUFFIX}`.toUpperCase().slice(0, 30);
  const mk = { parameter_code: code, name_vi: 'Chỉ tiêu thử', unit: 'mg/L', category: 'ENV', physical_min: 0, physical_max: 10 };
  assert.equal((await call('POST', '/ref/parameters', { token: researcher.accessToken, body: mk })).status, 403);
  assert.equal((await call('POST', '/ref/parameters', { token: admin.accessToken, body: { ...mk, physical_min: 9, physical_max: 1 } })).status, 400);
  const c = await call('POST', '/ref/parameters', { token: admin.accessToken, body: mk });
  assert.equal(c.status, 201);
  created.params.push(code);
  assert.equal((await call('POST', '/ref/parameters', { token: admin.accessToken, body: mk })).status, 409);
  assert.equal((await call('PATCH', `/ref/parameters/${code}`, { token: admin.accessToken, body: { unit: 'g/L', physical_max: 20 } })).json.data.unit, 'g/L');
  assert.equal((await call('PATCH', `/ref/parameters/${code}`, { token: admin.accessToken, body: { physical_max: -5 } })).status, 400, 'phải kiểm tra cả khi chỉ sửa một đầu khoảng');
});

// ---------------------------------------------------------------- dashboard & system
test('dashboard: cần quyền reporting.read; trả 12 KPI nghiệm thu, danh sách ô và số cảnh báo mở', async () => {
  assert.equal((await call('GET', '/dashboard/summary')).status, 401);
  assert.equal((await call('GET', '/dashboard/summary', { token: labtech.accessToken })).status, 403);

  const r = await call('GET', '/dashboard/summary', { token: researcher.accessToken });
  assert.equal(r.status, 200);
  const d = r.json.data;
  assert.equal(d.acceptance.total, 12);
  assert.equal(d.acceptance.passed + d.acceptance.failed + d.acceptance.pending, 12);
  assert.ok(d.acceptance.kpis.every((k) => k.kpi_code && 'current_value' in k && 'target_value' in k));
  assert.ok(d.plots.length >= 1 && d.plots[0].plot_code);
  assert.equal(typeof d.open_alerts, 'number');
});

test('system/status: cần iam.read; có thông tin máy chủ, database, số liệu và danh sách migration', async () => {
  assert.equal((await call('GET', '/system/status', { token: researcher.accessToken })).status, 403);
  const d = (await call('GET', '/system/status', { token: admin.accessToken })).json.data;
  assert.ok(d.server.node_version && d.server.uptime_seconds >= 0);
  assert.equal(d.database.domain_schemas, 16);
  assert.ok(d.counts.users >= 3 && d.counts.active_users >= 1);
  assert.ok(d.migrations.some((m) => m.filename === '18_tv1_api_key_label.sql'));
});

import crypto from 'node:crypto';
import { query, withUserTx } from '../../config/db.js';
import { AppError } from '../../utils/AppError.js';
import { invalidateUser } from '../../lib/userCache.js';
import { hashPassword } from '../auth/auth.service.js';

const SELF_LOCKOUT = (msg) => new AppError(400, 'SELF_LOCKOUT', msg);
const LAST_ADMIN = () => new AppError(409, 'LAST_ADMIN', 'Phải còn ít nhất một quản trị viên (ADMIN) đang hoạt động');

const escapeLike = (s) => s.replace(/[\\%_]/g, '\\$&');

const USER_SELECT = `
  SELECT u.user_id AS id, u.username, u.email, u.full_name, u.is_active,
         u.organization_id, o.name AS organization_name, u.created_at,
         COALESCE(array_agg(r.role_code ORDER BY r.role_code) FILTER (WHERE r.role_code IS NOT NULL), '{}') AS roles,
         (SELECT max(a.occurred_at) FROM audit.access_logs a WHERE a.user_id = u.user_id AND a.action = 'LOGIN') AS last_login_at
    FROM iam.users u
    LEFT JOIN iam.organizations o ON o.organization_id = u.organization_id
    LEFT JOIN iam.user_roles ur   ON ur.user_id = u.user_id
    LEFT JOIN iam.roles r         ON r.role_id = ur.role_id`;

export async function listUsers({ q, active, role, limit, offset }) {
  const params = [q ? escapeLike(q) : null, active ?? null, role ?? null];
  const where = `
    WHERE ($1::text IS NULL OR u.username ILIKE '%'||$1||'%' OR u.email ILIKE '%'||$1||'%' OR u.full_name ILIKE '%'||$1||'%')
      AND ($2::boolean IS NULL OR u.is_active = $2)
      AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM iam.user_roles x JOIN iam.roles y ON y.role_id = x.role_id
                                        WHERE x.user_id = u.user_id AND y.role_code = $3))`;
  const [rows, total] = await Promise.all([
    query(`${USER_SELECT} ${where} GROUP BY u.user_id, o.name ORDER BY u.created_at DESC, u.username LIMIT $4 OFFSET $5`, [...params, limit, offset]),
    query(`SELECT count(*) AS n FROM iam.users u ${where}`, params),
  ]);
  return { rows: rows.rows, total: total.rows[0].n };
}

export async function getUser(id, db = { query }) {
  const { rows } = await db.query(`${USER_SELECT} WHERE u.user_id = $1 GROUP BY u.user_id, o.name`, [id]);
  if (!rows[0]) throw AppError.notFound('Không tìm thấy người dùng');
  const perms = await db.query(
    `SELECT DISTINCT p.permission_code FROM iam.user_roles ur
       JOIN iam.role_permissions rp ON rp.role_id = ur.role_id
       JOIN iam.permissions p ON p.permission_id = rp.permission_id
      WHERE ur.user_id = $1 ORDER BY 1`, [id]);
  return { ...rows[0], permissions: perms.rows.map((r) => r.permission_code) };
}

// ---- hàm trợ giúp dùng trong transaction ----
async function roleIdsByCodes(c, codes) {
  const { rows } = await c.query('SELECT role_id, role_code FROM iam.roles WHERE role_code = ANY($1)', [codes]);
  const missing = codes.filter((code) => !rows.some((r) => r.role_code === code));
  if (missing.length) throw AppError.badRequest('Vai trò không tồn tại', [{ field: 'role_codes', message: `Không có: ${missing.join(', ')}` }]);
  return rows.map((r) => r.role_id);
}

async function setRoles(c, userId, roleIds, grantedBy) {
  await c.query('DELETE FROM iam.user_roles WHERE user_id = $1', [userId]);
  if (roleIds.length) {
    await c.query(
      `INSERT INTO iam.user_roles (user_id, role_id, granted_by) SELECT $1, unnest($2::uuid[]), $3`,
      [userId, roleIds, grantedBy]);
  }
}

/** Số ADMIN đang hoạt động, không tính excludeId. Dùng để không bao giờ để hệ thống hết quản trị viên. */
async function otherActiveAdmins(c, excludeId) {
  const { rows } = await c.query(
    `SELECT count(DISTINCT u.user_id)::int AS n FROM iam.users u
       JOIN iam.user_roles ur ON ur.user_id = u.user_id
       JOIN iam.roles r ON r.role_id = ur.role_id
      WHERE r.role_code = 'ADMIN' AND u.is_active AND u.user_id <> $1`, [excludeId]);
  return rows[0].n;
}

const isAdmin = async (c, userId) => (await c.query(
  `SELECT 1 FROM iam.user_roles ur JOIN iam.roles r ON r.role_id = ur.role_id WHERE ur.user_id = $1 AND r.role_code = 'ADMIN'`, [userId])).rowCount > 0;

function mapUniqueViolation(err) {
  if (err?.code === '23505') {
    const field = /email/.test(err.constraint || '') ? 'email' : 'username';
    throw AppError.conflict(field === 'email' ? 'Email đã được sử dụng' : 'Tên đăng nhập đã tồn tại', [{ field, message: 'Đã tồn tại' }]);
  }
  throw err;
}

export async function createUser(actorId, { username, email, full_name, password, role_codes, organization_id }) {
  try {
    const hash = await hashPassword(password);
    const id = await withUserTx(actorId, async (c) => {
      const roleIds = await roleIdsByCodes(c, role_codes);
      const { rows } = await c.query(
        `INSERT INTO iam.users (username, email, full_name, password_hash, organization_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
        [username, email, full_name, hash, organization_id ?? null]);
      await setRoles(c, rows[0].user_id, roleIds, actorId);
      return rows[0].user_id;
    }, { reason: 'Tạo người dùng' });
    return getUser(id);
  } catch (err) { return mapUniqueViolation(err); }
}

export async function updateUser(actorId, id, body) {
  try {
    await withUserTx(actorId, async (c) => {
      const exists = await c.query('SELECT 1 FROM iam.users WHERE user_id = $1 FOR UPDATE', [id]);
      if (!exists.rowCount) throw AppError.notFound('Không tìm thấy người dùng');

      const sets = []; const vals = [];
      for (const [col, val] of [['full_name', body.full_name], ['email', body.email], ['organization_id', body.organization_id]]) {
        if (val !== undefined) { vals.push(val); sets.push(`${col} = $${vals.length}`); }
      }
      if (sets.length) {
        vals.push(id);
        await c.query(`UPDATE iam.users SET ${sets.join(', ')} WHERE user_id = $${vals.length}`, vals);
      }

      if (body.role_codes !== undefined) {
        if (id === actorId) throw SELF_LOCKOUT('Không thể tự thay đổi vai trò của chính mình');
        const roleIds = await roleIdsByCodes(c, body.role_codes);
        if (!body.role_codes.includes('ADMIN') && (await isAdmin(c, id)) && (await otherActiveAdmins(c, id)) === 0) throw LAST_ADMIN();
        await setRoles(c, id, roleIds, actorId);
      }
    }, { reason: 'Cập nhật người dùng' });
  } catch (err) { mapUniqueViolation(err); }
  invalidateUser(id);
  return getUser(id);
}

export async function setActive(actorId, id, active) {
  await withUserTx(actorId, async (c) => {
    const { rows } = await c.query('SELECT is_active FROM iam.users WHERE user_id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw AppError.notFound('Không tìm thấy người dùng');
    if (!active) {
      if (id === actorId) throw SELF_LOCKOUT('Không thể tự khóa tài khoản của chính mình');
      if ((await isAdmin(c, id)) && (await otherActiveAdmins(c, id)) === 0) throw LAST_ADMIN();
    }
    await c.query('UPDATE iam.users SET is_active = $1 WHERE user_id = $2', [active, id]);
  }, { reason: active ? 'Mở khóa tài khoản' : 'Khóa tài khoản' });
  invalidateUser(id);
  return getUser(id);
}

/** Đặt lại mật khẩu. Không truyền mật khẩu mới thì hệ thống sinh mật khẩu tạm và trả về MỘT LẦN. */
export async function resetPassword(actorId, id, newPassword) {
  const temporary = newPassword ? null : `${crypto.randomBytes(9).toString('base64url')}${crypto.randomInt(10, 100)}`;
  const hash = await hashPassword(newPassword ?? temporary);
  await withUserTx(actorId, async (c) => {
    const r = await c.query('UPDATE iam.users SET password_hash = $1 WHERE user_id = $2', [hash, id]);
    if (!r.rowCount) throw AppError.notFound('Không tìm thấy người dùng');
  }, { reason: 'Quản trị viên đặt lại mật khẩu' });
  invalidateUser(id);
  return temporary ? { temporary_password: temporary, warning: 'Hãy gửi mật khẩu này cho người dùng. Hệ thống sẽ không hiển thị lại.' } : { reset: true };
}

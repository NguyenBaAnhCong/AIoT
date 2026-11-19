import { query, withUserTx } from '../../config/db.js';
import { AppError } from '../../utils/AppError.js';
import { invalidateUser } from '../../lib/userCache.js';

export async function listRoles() {
  const { rows } = await query(
    `SELECT r.role_id AS id, r.role_code, r.name, r.description,
            (SELECT count(*)::int FROM iam.role_permissions rp WHERE rp.role_id = r.role_id) AS permission_count,
            (SELECT count(*)::int FROM iam.user_roles ur JOIN iam.users u ON u.user_id = ur.user_id
              WHERE ur.role_id = r.role_id AND u.is_active) AS active_user_count
       FROM iam.roles r ORDER BY r.role_code`);
  return rows;
}

export async function getRole(id) {
  const role = await query('SELECT role_id AS id, role_code, name, description FROM iam.roles WHERE role_id = $1', [id]);
  if (!role.rows[0]) throw AppError.notFound('Không tìm thấy vai trò');
  const perms = await query(
    `SELECT p.permission_code, p.domain, p.action, p.description
       FROM iam.role_permissions rp JOIN iam.permissions p ON p.permission_id = rp.permission_id
      WHERE rp.role_id = $1 ORDER BY p.domain, p.permission_code`, [id]);
  return { ...role.rows[0], permissions: perms.rows };
}

export async function listPermissions() {
  const { rows } = await query(
    `SELECT permission_code, domain, action, description FROM iam.permissions ORDER BY domain, permission_code`);
  return rows;
}

/**
 * Thay toàn bộ quyền của một vai trò.
 * Chặn hai trường hợp tự khóa: (1) vai trò ADMIN phải luôn giữ iam.admin;
 * (2) người thực hiện không được mất quyền iam.admin sau thay đổi này.
 */
export async function setRolePermissions(actorId, roleId, codes) {
  await withUserTx(actorId, async (c) => {
    const role = await c.query('SELECT role_code FROM iam.roles WHERE role_id = $1 FOR UPDATE', [roleId]);
    if (!role.rows[0]) throw AppError.notFound('Không tìm thấy vai trò');

    if (role.rows[0].role_code === 'ADMIN') {
      const required = ['iam.admin', 'iam.read', 'iam.write'].filter((p) => !codes.includes(p));
      if (required.length) throw new AppError(400, 'PROTECTED_ROLE', `Vai trò ADMIN phải giữ các quyền: ${required.join(', ')}`);
    }

    const found = await c.query('SELECT permission_id, permission_code FROM iam.permissions WHERE permission_code = ANY($1)', [codes]);
    const missing = codes.filter((code) => !found.rows.some((r) => r.permission_code === code));
    if (missing.length) throw AppError.badRequest('Quyền không tồn tại', [{ field: 'permission_codes', message: `Không có: ${missing.join(', ')}` }]);

    await c.query('DELETE FROM iam.role_permissions WHERE role_id = $1', [roleId]);
    if (found.rows.length) {
      await c.query('INSERT INTO iam.role_permissions (role_id, permission_id) SELECT $1, unnest($2::uuid[])',
        [roleId, found.rows.map((r) => r.permission_id)]);
    }

    // Kiểm tra sau khi sửa: người thực hiện còn iam.admin không? Nếu không thì hủy cả giao dịch.
    const still = await c.query(
      `SELECT 1 FROM iam.user_roles ur JOIN iam.role_permissions rp ON rp.role_id = ur.role_id
         JOIN iam.permissions p ON p.permission_id = rp.permission_id
        WHERE ur.user_id = $1 AND p.permission_code = 'iam.admin' LIMIT 1`, [actorId]);
    if (!still.rowCount) throw new AppError(400, 'SELF_LOCKOUT', 'Thay đổi này sẽ làm bạn mất quyền iam.admin của chính mình');
  }, { reason: 'Cập nhật quyền của vai trò' });
  invalidateUser(); // xóa cache quyền của mọi người để có hiệu lực ngay
  return getRole(roleId);
}

// ---- tổ chức ----
export async function listOrganizations() {
  const { rows } = await query(
    `SELECT o.organization_id AS id, o.code, o.name, o.org_type, o.created_at,
            (SELECT count(*)::int FROM iam.users u WHERE u.organization_id = o.organization_id) AS user_count
       FROM iam.organizations o ORDER BY o.name`);
  return rows;
}

export async function createOrganization(actorId, { code, name, org_type }) {
  try {
    return await withUserTx(actorId, async (c) => (await c.query(
      `INSERT INTO iam.organizations (code, name, org_type) VALUES ($1, $2, $3)
       RETURNING organization_id AS id, code, name, org_type, created_at`, [code, name, org_type])).rows[0],
    { reason: 'Tạo tổ chức' });
  } catch (err) {
    if (err?.code === '23505') throw AppError.conflict('Mã tổ chức đã tồn tại', [{ field: 'code', message: 'Đã tồn tại' }]);
    throw err;
  }
}

export async function updateOrganization(actorId, id, { name, org_type }) {
  const row = await withUserTx(actorId, async (c) => (await c.query(
    `UPDATE iam.organizations SET name = COALESCE($2, name), org_type = COALESCE($3, org_type)
      WHERE organization_id = $1 RETURNING organization_id AS id, code, name, org_type, created_at`,
    [id, name ?? null, org_type ?? null])).rows[0], { reason: 'Cập nhật tổ chức' });
  if (!row) throw AppError.notFound('Không tìm thấy tổ chức');
  return row;
}

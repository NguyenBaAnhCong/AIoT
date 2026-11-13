import { query } from '../../config/db.js';

/** Tìm user để đăng nhập bằng username HOẶC email (không phân biệt hoa thường). */
export async function findUserForLogin(identifier) {
  const { rows } = await query(
    `SELECT user_id, username, password_hash, is_active
       FROM iam.users
      WHERE lower(username) = lower($1) OR lower(email) = lower($1)
      LIMIT 1`,
    [identifier]
  );
  return rows[0] || null;
}

/** Thông tin user + danh sách vai trò + danh sách mã quyền (gộp từ mọi vai trò). */
export async function fetchUserContext(userId) {
  const { rows } = await query(
    `SELECT u.user_id, u.username, u.email, u.full_name, u.is_active, u.organization_id,
            COALESCE(array_agg(DISTINCT r.role_code)       FILTER (WHERE r.role_code IS NOT NULL), '{}') AS roles,
            COALESCE(array_agg(DISTINCT p.permission_code) FILTER (WHERE p.permission_code IS NOT NULL), '{}') AS permissions
       FROM iam.users u
       LEFT JOIN iam.user_roles ur       ON ur.user_id = u.user_id
       LEFT JOIN iam.roles r             ON r.role_id = ur.role_id
       LEFT JOIN iam.role_permissions rp ON rp.role_id = r.role_id
       LEFT JOIN iam.permissions p       ON p.permission_id = rp.permission_id
      WHERE u.user_id = $1
      GROUP BY u.user_id`,
    [userId]
  );
  return rows[0] || null;
}

export async function insertAccessLog({ userId = null, apiKeyId = null, action, resource = null, method = null, status = null, ip = null, userAgent = null }) {
  await query(
    `INSERT INTO audit.access_logs (user_id, api_key_id, action, resource, http_method, status_code, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, apiKeyId, action, resource, method, status, ip, userAgent ? userAgent.slice(0, 500) : null]
  );
}

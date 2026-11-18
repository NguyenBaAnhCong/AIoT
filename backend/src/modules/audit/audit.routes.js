import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { ok, parsePaging } from '../../utils/response.js';
import { validate } from '../../middleware/validate.js';
import { protect } from '../../middleware/auth.js';

const router = Router();
const uuid = z.string().uuid();
const date = z.coerce.date();

/** Ghép điều kiện WHERE động: mỗi phần tử [điều kiện có $n, giá trị]. Giá trị rỗng bị bỏ qua. */
function buildWhere(conds) {
  const params = []; const parts = [];
  for (const [sql, val] of conds) {
    if (val === undefined || val === null || val === '') continue;
    params.push(val);
    parts.push(sql.replace('$#', `$${params.length}`));
  }
  return { where: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}

const logsQuery = z.object({
  schema: z.string().regex(/^[a-z_]{1,32}$/).optional(), table: z.string().regex(/^[a-z_]{1,64}$/).optional(),
  operation: z.enum(['INSERT', 'UPDATE', 'DELETE']).optional(), actor_id: uuid.optional(),
  record: z.string().max(100).optional(), from: date.optional(), to: date.optional(),
  page: z.string().optional(), limit: z.string().optional(),
});

// GET /api/v1/audit/logs  – nhật ký thay đổi dữ liệu (ai sửa gì)
router.get('/logs', protect('audit.read'), validate(logsQuery, 'query'), asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePaging(req.query, { defaultLimit: 50 });
  const q = req.query;
  const { where, params } = buildWhere([
    ['a.schema_name = $#', q.schema], ['a.table_name = $#', q.table], ['a.operation = $#', q.operation],
    ['a.actor_id = $#', q.actor_id], ['a.occurred_at >= $#', q.from], ['a.occurred_at < $#', q.to],
    ['a.record_pk::text ILIKE $#', q.record ? `%${q.record.replace(/[\\%_]/g, '\\$&')}%` : null],
  ]);
  const n = params.length;
  const [rows, total] = await Promise.all([
    query(`SELECT a.audit_log_id AS id, a.occurred_at, a.actor_id, a.actor_type, u.username AS actor_username,
                  a.schema_name, a.table_name, a.operation, a.record_pk, a.changed_fields, a.client_ip, a.application
             FROM audit.audit_logs a LEFT JOIN iam.users u ON u.user_id = a.actor_id
             ${where} ORDER BY a.occurred_at DESC, a.audit_log_id DESC LIMIT $${n + 1} OFFSET $${n + 2}`, [...params, limit, offset]),
    query(`SELECT count(*) AS n FROM audit.audit_logs a ${where}`, params),
  ]);
  ok(res, rows.rows, { page, limit, total: total.rows[0].n });
}));

// GET /api/v1/audit/logs/:id  – chi tiết một bản ghi, có dữ liệu cũ/mới
router.get('/logs/:id', protect('audit.read'), validate(z.object({ id: z.string().regex(/^\d{1,18}$/) }), 'params'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT a.audit_log_id AS id, a.occurred_at, a.actor_id, a.actor_type, u.username AS actor_username, a.db_user,
            a.schema_name, a.table_name, a.operation, a.record_pk, a.old_data, a.new_data, a.changed_fields, a.client_ip, a.application
       FROM audit.audit_logs a LEFT JOIN iam.users u ON u.user_id = a.actor_id WHERE a.audit_log_id = $1`, [req.params.id]);
  if (!rows[0]) throw AppError.notFound('Không tìm thấy bản ghi audit');
  ok(res, rows[0]);
}));

const accessQuery = z.object({
  action: z.string().regex(/^[A-Z_]{2,32}$/).optional(), user_id: uuid.optional(), api_key_id: uuid.optional(),
  status: z.coerce.number().int().min(100).max(599).optional(), method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  from: date.optional(), to: date.optional(), page: z.string().optional(), limit: z.string().optional(),
});

// GET /api/v1/audit/access-logs  – nhật ký truy cập (đăng nhập, thao tác ghi, bị từ chối)
router.get('/access-logs', protect('audit.read'), validate(accessQuery, 'query'), asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePaging(req.query, { defaultLimit: 50 });
  const q = req.query;
  const { where, params } = buildWhere([
    ['l.action = $#', q.action], ['l.user_id = $#', q.user_id], ['l.api_key_id = $#', q.api_key_id],
    ['l.status_code = $#', q.status], ['l.http_method = $#', q.method], ['l.occurred_at >= $#', q.from], ['l.occurred_at < $#', q.to],
  ]);
  const n = params.length;
  const [rows, total] = await Promise.all([
    query(`SELECT l.access_log_id AS id, l.occurred_at, l.user_id, u.username, l.api_key_id, k.key_prefix AS api_key_prefix,
                  l.action, l.resource, l.http_method, l.status_code, l.ip_address, l.user_agent
             FROM audit.access_logs l
             LEFT JOIN iam.users u ON u.user_id = l.user_id
             LEFT JOIN iam.api_keys k ON k.api_key_id = l.api_key_id
             ${where} ORDER BY l.occurred_at DESC, l.access_log_id DESC LIMIT $${n + 1} OFFSET $${n + 2}`, [...params, limit, offset]),
    query(`SELECT count(*) AS n FROM audit.access_logs l ${where}`, params),
  ]);
  ok(res, rows.rows, { page, limit, total: total.rows[0].n });
}));

// GET /api/v1/audit/summary  – số liệu 24 giờ gần nhất cho màn hình quản trị
router.get('/summary', protect('audit.read'), asyncHandler(async (req, res) => {
  const [changes, access] = await Promise.all([
    query(`SELECT operation, count(*)::int AS n FROM audit.audit_logs WHERE occurred_at > now() - interval '24 hours' GROUP BY operation`),
    query(`SELECT count(*) FILTER (WHERE action = 'LOGIN')::int AS logins,
                  count(*) FILTER (WHERE action = 'LOGIN_FAILED')::int AS failed_logins,
                  count(*) FILTER (WHERE status_code IN (401, 403) AND action = 'API_CALL')::int AS denied_calls
             FROM audit.access_logs WHERE occurred_at > now() - interval '24 hours'`),
  ]);
  ok(res, { window_hours: 24, changes_by_operation: Object.fromEntries(changes.rows.map((r) => [r.operation, r.n])), ...access.rows[0] });
}));

export default router;

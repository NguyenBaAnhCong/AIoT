import { Router } from 'express';
import { query } from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import { protect } from '../../middleware/auth.js';

const router = Router();

// GET /api/v1/system/status  – trạng thái hệ thống cho màn hình 14 (cần quyền iam.read)
router.get('/status', protect('iam.read'), asyncHandler(async (req, res) => {
  const [db, counts, migrations] = await Promise.all([
    query(`SELECT current_database() AS name, version() AS version, pg_database_size(current_database())::bigint AS size_bytes, now() AS server_time,
                  (SELECT count(*)::int FROM information_schema.schemata WHERE schema_name IN
                    ('ref','iam','farm','experiment','biochar','iot','calibration','laboratory','data_quality','dataset','sqi','ml','ota','alert','reporting','audit')) AS domain_schemas`),
    query(`SELECT (SELECT count(*)::int FROM iam.users) AS users,
                  (SELECT count(*)::int FROM iam.users WHERE is_active) AS active_users,
                  (SELECT count(*)::int FROM iam.api_keys WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())) AS active_api_keys,
                  (SELECT count(*)::int FROM audit.audit_logs WHERE occurred_at > now() - interval '24 hours') AS changes_24h,
                  (SELECT count(*)::int FROM audit.access_logs WHERE action = 'LOGIN_FAILED' AND occurred_at > now() - interval '24 hours') AS failed_logins_24h`),
    query(`SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ok`).then(async (r) => r.rows[0].ok
      ? (await query('SELECT filename, applied_at FROM public.schema_migrations ORDER BY filename')).rows : []),
  ]);
  ok(res, {
    server: { node_version: process.version, uptime_seconds: Math.round(process.uptime()), environment: process.env.NODE_ENV || 'development' },
    database: db.rows[0],
    counts: counts.rows[0],
    migrations,
  });
}));

export default router;

import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, withUserTx } from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { ok, created } from '../../utils/response.js';
import { validate } from '../../middleware/validate.js';
import { protect } from '../../middleware/auth.js';
import { hashApiKey } from '../../middleware/apiKey.js';

const router = Router();

// Các phạm vi (scope) hợp lệ của API key. Thêm phạm vi mới ở đây khi một module cần.
export const API_KEY_SCOPES = ['iot.ingest', 'iot.read', 'ml.inference', 'ota.update'];

const createSchema = z.object({
  label: z.string().trim().min(1, 'Bắt buộc').max(128),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1, 'Chọn ít nhất một phạm vi'),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

// GET /api/v1/api-keys/scopes – danh sách phạm vi để frontend hiển thị
router.get('/scopes', protect('iam.read'), (req, res) => ok(res, API_KEY_SCOPES));

// GET /api/v1/api-keys – danh sách key (KHÔNG bao giờ trả key gốc hay hash)
router.get('/', protect('iam.read'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT k.api_key_id AS id, k.label, k.key_prefix AS prefix, k.scopes, k.expires_at, k.revoked_at, k.created_at,
            u.username AS owner,
            (SELECT max(occurred_at) FROM audit.access_logs a WHERE a.api_key_id = k.api_key_id) AS last_used_at,
            CASE WHEN k.revoked_at IS NOT NULL THEN 'REVOKED'
                 WHEN k.expires_at IS NOT NULL AND k.expires_at < now() THEN 'EXPIRED'
                 ELSE 'ACTIVE' END AS status
       FROM iam.api_keys k LEFT JOIN iam.users u ON u.user_id = k.owner_user_id
      ORDER BY k.created_at DESC`
  );
  ok(res, rows);
}));

// POST /api/v1/api-keys – tạo key mới. Key gốc CHỈ được trả về đúng một lần ở đây.
router.post('/', protect('iam.admin'), validate(createSchema), asyncHandler(async (req, res) => {
  const { label, scopes, expiresInDays } = req.body;
  const prefix = `ak_${crypto.randomBytes(4).toString('hex')}`;           // 11 ký tự, hiển thị được
  const key = `${prefix}_${crypto.randomBytes(24).toString('base64url')}`;  // phần bí mật

  const row = await withUserTx(req.user.id, async (c) => {
    const r = await c.query(
      `INSERT INTO iam.api_keys (owner_user_id, label, key_prefix, key_hash, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::int IS NULL THEN NULL ELSE now() + make_interval(days => $6::int) END)
       RETURNING api_key_id AS id, label, key_prefix AS prefix, scopes, expires_at, created_at`,
      [req.user.id, label, prefix, hashApiKey(key), scopes, expiresInDays ?? null]
    );
    return r.rows[0];
  }, { reason: 'Tạo API key' });

  created(res, { ...row, key, warning: 'Hãy lưu key này ngay. Hệ thống sẽ không hiển thị lại.' });
}));

// POST /api/v1/api-keys/:id/revoke – thu hồi (không xóa, để còn lịch sử)
router.post('/:id/revoke', protect('iam.admin'), asyncHandler(async (req, res) => {
  const row = await withUserTx(req.user.id, async (c) => {
    const r = await c.query(
      `UPDATE iam.api_keys SET revoked_at = now() WHERE api_key_id = $1 AND revoked_at IS NULL
       RETURNING api_key_id AS id, label, revoked_at`,
      [req.params.id]
    );
    return r.rows[0];
  }, { reason: 'Thu hồi API key' });
  if (!row) throw AppError.notFound('Không tìm thấy key hoặc key đã bị thu hồi');
  ok(res, row);
}));

export default router;

// =====================================================================
// Xác thực bằng API key cho thiết bị (Edge Gateway) – header:  X-API-Key: ak_xxxxxxxx_...
//
//   router.post('/ingest', requireApiKey('iot.ingest'), handler);
//
// Chỉ lưu SHA-256 của key trong iam.api_keys.key_hash; không thể khôi phục key gốc.
// Sau khi qua, req.apiKey = { id, prefix, scopes[], ownerUserId }.
// =====================================================================
import crypto from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { query } from '../config/db.js';

export const hashApiKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

export const requireApiKey = (...requiredScopes) =>
  asyncHandler(async (req, res, next) => {
    const key = req.get('x-api-key');
    if (!key) throw AppError.unauthorized('Thiếu header X-API-Key');

    const { rows } = await query(
      `SELECT api_key_id, key_prefix, scopes, owner_user_id, expires_at, revoked_at
         FROM iam.api_keys WHERE key_hash = $1`,
      [hashApiKey(key)]
    );
    const row = rows[0];
    if (!row) throw AppError.unauthorized('API key không hợp lệ');
    if (row.revoked_at) throw AppError.unauthorized('API key đã bị thu hồi');
    if (row.expires_at && row.expires_at < new Date()) throw AppError.unauthorized('API key đã hết hạn');
    if (requiredScopes.length && !requiredScopes.some((s) => row.scopes.includes(s))) {
      throw AppError.forbidden(`API key thiếu phạm vi: ${requiredScopes.join(' hoặc ')}`);
    }

    req.apiKey = { id: row.api_key_id, prefix: row.key_prefix, scopes: row.scopes, ownerUserId: row.owner_user_id };
    next();
  });

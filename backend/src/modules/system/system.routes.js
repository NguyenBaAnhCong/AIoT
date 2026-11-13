import { Router } from 'express';
import { query } from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import { requireApiKey } from '../../middleware/apiKey.js';

const router = Router();

// GET /api/v1/health  – kiểm tra server và database còn sống (công khai)
router.get('/health', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT now() AS server_time, current_database() AS db,
            (SELECT count(*) FROM information_schema.schemata
              WHERE schema_name IN ('ref','iam','farm','experiment','biochar','iot','calibration',
                                    'laboratory','data_quality','dataset','sqi','ml','ota','alert',
                                    'reporting','audit')) AS domain_schemas`
  );
  ok(res, { status: 'ok', ...rows[0] });
}));

// GET /api/v1/gateway/ping  – để TV2 kiểm tra API key hoạt động (header X-API-Key, phạm vi iot.ingest)
router.get('/gateway/ping', requireApiKey('iot.ingest'), (req, res) => {
  ok(res, { ok: true, apiKeyId: req.apiKey.id, prefix: req.apiKey.prefix, scopes: req.apiKey.scopes });
});

export default router;

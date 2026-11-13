import { Router } from 'express';
import { query } from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';

const router = Router();

// GET /api/v1/health  – kiểm tra server và database còn sống
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

export default router;

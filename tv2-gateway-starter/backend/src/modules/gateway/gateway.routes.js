import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../config/db.js';
import { requireApiKey } from '../../middleware/apiKey.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { created, ok } from '../../utils/response.js';

const router = Router();
const number = z.number().finite();

const ingestSchema = z.object({
  sensor_code: z.string().trim().min(1).max(32),
  measured_at: z.string().datetime({ offset: true }),
  seq_no: z.number().int().nonnegative().optional(),
  battery_v: number.nonnegative().optional(),
  rssi_dbm: z.number().int().min(-32768).max(32767).optional(),
  snr_db: number.optional(),
  raw: z.object({
    PH: number,
    EC: number,
    MOISTURE: number,
    SOIL_TEMP: number,
    N: number,
    P: number,
    K: number,
  }).strict(),
});

router.post(
  '/ingest',
  requireApiKey('iot.ingest'),
  validate(ingestSchema),
  asyncHandler(async (req, res) => {
    const { sensor_code, measured_at, seq_no, battery_v, rssi_dbm, snr_db, raw } = req.body;
    const sensorResult = await query(
      `SELECT sensor_id
         FROM iot.sensors
        WHERE sensor_code = $1
          AND status <> 'REMOVED'
          AND removed_at IS NULL`,
      [sensor_code]
    );

    if (sensorResult.rows.length === 0) {
      throw AppError.notFound('Không tìm thấy cảm biến');
    }

    const result = await query(
      `SELECT iot.ingest_reading(
        $1::uuid,
        $2::timestamptz,
        $3::jsonb,
        $4::bigint,
        $5::numeric,
        $6::smallint,
        $7::numeric
      ) AS reading_id`,
      [
        sensorResult.rows[0].sensor_id,
        measured_at,
        JSON.stringify(raw),
        seq_no ?? null,
        battery_v ?? null,
        rssi_dbm ?? null,
        snr_db ?? null,
      ]
    );

    const readingId = result.rows[0].reading_id;
    if (readingId === null) {
      return ok(res, { accepted: true, duplicate: true, sensor_code });
    }

    return created(res, {
      accepted: true,
      duplicate: false,
      sensor_code,
      reading_id: readingId,
    });
  })
);

export default router;

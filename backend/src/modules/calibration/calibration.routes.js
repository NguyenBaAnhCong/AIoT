import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../config/db.js';
import { protect } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { created, ok } from '../../utils/response.js';

const router = Router();

const sessionSchema = z.object({
  sensor_id: z.string().uuid(),
  reference_device_id: z.string().uuid().nullable().optional(),
  session_type: z
    .enum(['LAB', 'FIELD', 'DRIFT_CHECK', 'REPEATABILITY'])
    .default('LAB'),
  performed_at: z.string().datetime({ offset: true }),
  ambient_temp_c: z.number().finite().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
}).strict();

router.post(
  '/sessions',
  protect('calibration.write'),
  validate(sessionSchema),
  asyncHandler(async (req, res) => {
    const {
      sensor_id,
      reference_device_id,
      session_type,
      performed_at,
      ambient_temp_c,
      notes,
    } = req.body;

    const sensor = await query(
      `SELECT sensor_id
         FROM iot.sensors
        WHERE sensor_id = $1
          AND status <> 'REMOVED'
          AND removed_at IS NULL`,
      [sensor_id]
    );

    if (sensor.rows.length === 0) {
      throw AppError.notFound('Không tìm thấy cảm biến');
    }

    const result = await query(
      `INSERT INTO calibration.calibration_sessions (
         sensor_id,
         reference_device_id,
         session_type,
         performed_at,
         performed_by,
         ambient_temp_c,
         notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING session_id, sensor_id, reference_device_id,
                 session_type, performed_at, performed_by,
                 ambient_temp_c, notes`,
      [
        sensor_id,
        reference_device_id ?? null,
        session_type,
        performed_at,
        req.user.id,
        ambient_temp_c ?? null,
        notes ?? null,
      ]
    );

    return created(res, result.rows[0]);
  })
);

const pointSchema = z.object({
  parameter_code: z.enum([
    'PH',
    'EC',
    'MOISTURE',
    'SOIL_TEMP',
    'N',
    'P',
    'K',
  ]),
  reference_value: z.number().finite(),
  sensor_value: z.number().finite(),
  replicate_no: z.number().int().positive().default(1),
  measured_at: z.string().datetime({ offset: true }).optional(),
}).strict();

router.post(
  '/sessions/:sessionId/points',
  protect('calibration.write'),
  validate(z.object({ sessionId: z.string().uuid() }), 'params'),
  validate(pointSchema),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const {
      parameter_code,
      reference_value,
      sensor_value,
      replicate_no,
      measured_at,
    } = req.body;

    const session = await query(
      `SELECT session_id
         FROM calibration.calibration_sessions
        WHERE session_id = $1`,
      [sessionId]
    );

    if (session.rows.length === 0) {
      throw AppError.notFound('Không tìm thấy phiên hiệu chuẩn');
    }

    const result = await query(
      `INSERT INTO calibration.calibration_points (
         session_id,
         parameter_code,
         reference_value,
         sensor_value,
         replicate_no,
         measured_at
       )
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))
       RETURNING point_id, session_id, parameter_code,
                 reference_value, sensor_value, replicate_no, measured_at`,
      [
        sessionId,
        parameter_code,
        reference_value,
        sensor_value,
        replicate_no,
        measured_at ?? null,
      ]
    );

    return created(res, result.rows[0]);
  })
);

router.post(
  '/sessions/:sessionId/compute',
  protect('calibration.write'),
  validate(z.object({ sessionId: z.string().uuid() }), 'params'),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const session = await query(
      `SELECT session_id
         FROM calibration.calibration_sessions
        WHERE session_id = $1`,
      [sessionId]
    );

    if (session.rows.length === 0) {
      throw AppError.notFound('Không tìm thấy phiên hiệu chuẩn');
    }

    const pointGroups = await query(
      `SELECT parameter_code
         FROM calibration.calibration_points
        WHERE session_id = $1
        GROUP BY parameter_code
       HAVING count(*) >= 2`,
      [sessionId]
    );

    if (pointGroups.rows.length === 0) {
      throw AppError.badRequest(
        'Cần ít nhất hai điểm đo cho cùng một chỉ tiêu trước khi tính'
      );
    }

    await query(
      `SELECT calibration.compute_results($1::uuid)`,
      [sessionId]
    );

    const results = await query(
      `SELECT calibration_result_id, sensor_id, parameter_code,
              n_points, slope, intercept, r2, rmse, mae,
              max_abs_error, bias, repeatability_cv_pct,
              drift_per_day, tolerance, passed, valid_from
         FROM calibration.calibration_results
        WHERE session_id = $1
        ORDER BY parameter_code`,
      [sessionId]
    );

    return ok(res, {
      session_id: sessionId,
      result_count: results.rows.length,
      results: results.rows,
    });
  })
);

router.get(
  '/sessions/:sessionId/results',
  protect('calibration.read'),
  validate(z.object({ sessionId: z.string().uuid() }), 'params'),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const session = await query(
      `SELECT session_id
         FROM calibration.calibration_sessions
        WHERE session_id = $1`,
      [sessionId]
    );

    if (session.rows.length === 0) {
      throw AppError.notFound('Không tìm thấy phiên hiệu chuẩn');
    }

    const result = await query(
      `SELECT calibration_result_id, sensor_id, parameter_code,
              n_points, slope, intercept, r2, rmse, mae,
              max_abs_error, bias, repeatability_cv_pct,
              drift_per_day, tolerance, passed, valid_from
         FROM calibration.calibration_results
        WHERE session_id = $1
        ORDER BY parameter_code`,
      [sessionId]
    );

    return ok(res, {
      session_id: sessionId,
      count: result.rows.length,
      results: result.rows,
    });
  })
);

router.get(
  '/sessions',
  protect('calibration.read'),
  asyncHandler(async (req, res) => {
    const querySchema = z.object({
      sensor_id: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    });

    const parsed = querySchema.safeParse(req.query);

    if (!parsed.success) {
      throw AppError.badRequest('Tham số truy vấn không hợp lệ');
    }

    const { sensor_id, limit } = parsed.data;

    const result = await query(
      `SELECT cs.session_id, cs.sensor_id, s.sensor_code,
              cs.reference_device_id, cs.session_type,
              cs.performed_at, cs.performed_by,
              cs.ambient_temp_c, cs.notes
         FROM calibration.calibration_sessions cs
         JOIN iot.sensors s ON s.sensor_id = cs.sensor_id
        WHERE ($1::uuid IS NULL OR cs.sensor_id = $1)
        ORDER BY cs.performed_at DESC
        LIMIT $2`,
      [sensor_id ?? null, limit]
    );

    return ok(res, {
      count: result.rows.length,
      sessions: result.rows,
    });
  })
);

export default router;
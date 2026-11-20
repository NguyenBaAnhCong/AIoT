import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../utils/AppError.js';
import { created } from '../../utils/response.js';
import { Router } from 'express';
import { query } from '../../config/db.js';
import { protect } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';

const router = Router();

router.get(
  '/',
  protect('iot.read'),
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT
         g.gateway_id,
         g.gateway_code,
         g.hardware_model AS gateway_model,
         g.latitude AS gateway_latitude,
         g.longitude AS gateway_longitude,
         g.status AS gateway_status,
         g.last_seen_at AS gateway_last_seen_at,

         n.node_id,
         n.node_code,
         n.plot_id,
         p.plot_code,
         n.mcu_model,
         n.latitude AS node_latitude,
         n.longitude AS node_longitude,
         n.status AS node_status,
         n.last_seen_at AS node_last_seen_at,
         n.battery_v,

         s.sensor_id,
         s.sensor_code,
         s.sensor_model,
         s.measured_parameters,
         s.status AS sensor_status
       FROM iot.gateways g
       LEFT JOIN iot.sensor_nodes n
         ON n.gateway_id = g.gateway_id
        AND n.status <> 'RETIRED'
       LEFT JOIN farm.plots p
         ON p.plot_id = n.plot_id
       LEFT JOIN iot.sensors s
         ON s.node_id = n.node_id
        AND s.status <> 'REMOVED'
        AND s.removed_at IS NULL
       WHERE g.status <> 'RETIRED'
       ORDER BY g.gateway_code, n.node_code, s.sensor_code`
    );

    return ok(res, {
      count: result.rows.length,
      devices: result.rows,
    });
  })
);

const configSchema = z.object({
  sensor_id: z.string().uuid().nullable().optional(),
  config_version: z.number().int().positive(),
  sampling_interval_s: z.number().int().min(60).max(900),
  lora_spreading_factor: z.number().int().min(7).max(12).nullable().optional(),
  tx_power_dbm: z.number().int().min(-32768).max(32767).nullable().optional(),
  edge_thresholds: z.object({}).passthrough().nullable().optional(),
}).strict();

router.post(
  '/nodes/:nodeId/configs',
  protect('iot.write'),
  validate(z.object({ nodeId: z.string().uuid() }), 'params'),
  validate(configSchema),
  asyncHandler(async (req, res) => {
    const { nodeId } = req.params;
    const {
      sensor_id,
      config_version,
      sampling_interval_s,
      lora_spreading_factor,
      tx_power_dbm,
      edge_thresholds,
    } = req.body;

    const node = await query(
      `SELECT node_id
         FROM iot.sensor_nodes
        WHERE node_id = $1
          AND status <> 'RETIRED'`,
      [nodeId]
    );

    if (node.rows.length === 0) {
      throw AppError.notFound('Không tìm thấy node');
    }

    if (sensor_id) {
      const sensor = await query(
        `SELECT sensor_id
           FROM iot.sensors
          WHERE sensor_id = $1
            AND node_id = $2
            AND status <> 'REMOVED'
            AND removed_at IS NULL`,
        [sensor_id, nodeId]
      );

      if (sensor.rows.length === 0) {
        throw AppError.notFound('Cảm biến không tồn tại hoặc không thuộc node này');
      }
    }

    const duplicateVersion = await query(
      `SELECT 1
         FROM iot.sensor_configs
        WHERE node_id = $1
          AND config_version = $2`,
      [nodeId, config_version]
    );

    if (duplicateVersion.rows.length > 0) {
      throw AppError.conflict('Phiên bản cấu hình này đã tồn tại cho node');
    }

    const result = await query(
      `INSERT INTO iot.sensor_configs (
         node_id, sensor_id, config_version, sampling_interval_s,
         lora_spreading_factor, tx_power_dbm, edge_thresholds, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING config_id, node_id, sensor_id, config_version,
                 sampling_interval_s, lora_spreading_factor,
                 tx_power_dbm, edge_thresholds, valid_from, applied_status`,
      [
        nodeId,
        sensor_id ?? null,
        config_version,
        sampling_interval_s,
        lora_spreading_factor ?? null,
        tx_power_dbm ?? null,
        edge_thresholds ? JSON.stringify(edge_thresholds) : null,
        req.user.id,
      ]
    );

    return created(res, result.rows[0]);
  })
);

router.get(
  '/nodes/:nodeId/configs',
  protect('iot.read'),
  validate(z.object({ nodeId: z.string().uuid() }), 'params'),
  asyncHandler(async (req, res) => {
    const { nodeId } = req.params;

    const node = await query(
      `SELECT node_id
         FROM iot.sensor_nodes
        WHERE node_id = $1`,
      [nodeId]
    );

    if (node.rows.length === 0) {
      throw AppError.notFound('Không tìm thấy node');
    }

    const result = await query(
      `SELECT config_id, node_id, sensor_id, config_version,
              sampling_interval_s, lora_spreading_factor,
              tx_power_dbm, edge_thresholds, valid_from, valid_to,
              applied_status, created_by
         FROM iot.sensor_configs
        WHERE node_id = $1
        ORDER BY config_version DESC`,
      [nodeId]
    );

    return ok(res, {
      node_id: nodeId,
      count: result.rows.length,
      configs: result.rows,
    });
  })
);

const readingsQuerySchema = z.object({
  sensor_id: z.string().uuid().optional(),
  plot_id: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

router.get(
  '/readings',
  protect('iot.read'),
  asyncHandler(async (req, res) => {
    const parsed = readingsQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      throw AppError.badRequest('Tham số truy vấn không hợp lệ');
    }

    const { sensor_id, plot_id, from, to, limit } = parsed.data;

    if (from && to && new Date(from) > new Date(to)) {
      throw AppError.badRequest('Thời gian bắt đầu phải trước thời gian kết thúc');
    }

    const result = await query(
      `SELECT reading_id, sensor_id, node_id, gateway_id, plot_id,
              measured_at, received_at, seq_no,
              ph, ec, soil_moisture, soil_temperature, n, p, k,
              battery_v, rssi_dbm, snr_db,
              raw_payload, calibration_applied,
              quality_status, quality_flags, timestamp_valid
         FROM iot.sensor_readings
        WHERE ($1::uuid IS NULL OR sensor_id = $1)
          AND ($2::uuid IS NULL OR plot_id = $2)
          AND ($3::timestamptz IS NULL OR measured_at >= $3)
          AND ($4::timestamptz IS NULL OR measured_at <= $4)
        ORDER BY measured_at DESC
        LIMIT $5`,
      [sensor_id ?? null, plot_id ?? null, from ?? null, to ?? null, limit]
    );

    return ok(res, {
      count: result.rows.length,
      readings: result.rows,
    });
  })
);

export default router;
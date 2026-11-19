import { Router } from 'express';
import { query } from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import { protect } from '../../middleware/auth.js';

const router = Router();

// GET /api/v1/dashboard/summary  – dữ liệu cho màn hình 01 (chỉ ĐỌC các view báo cáo có sẵn)
router.get('/summary', protect('reporting.read'), asyncHandler(async (req, res) => {
  const [kpis, plots, alerts] = await Promise.all([
    query(`SELECT kpi_code, name_vi, unit, comparator, target_value, current_value, passed FROM reporting.v_acceptance_summary ORDER BY kpi_code`),
    query(`SELECT plot_id, plot_code, soil_type, site_code, treatment_code, biochar_dose_kg_m2, node_code, node_status, last_seen_at,
                  gateway_code, gateway_status, last_reading_at, ph, ec, soil_moisture, n, p, k,
                  sqi_value, health_class, sqi_date, open_alerts, gateway_model_version
             FROM reporting.v_dashboard_plots ORDER BY plot_code`),
    query(`SELECT count(*)::int AS open_alerts FROM alert.alerts WHERE status <> 'RESOLVED'`),
  ]);
  const passed = kpis.rows.filter((k) => k.passed === true).length;
  ok(res, {
    generated_at: new Date().toISOString(),
    acceptance: { total: kpis.rows.length, passed, failed: kpis.rows.filter((k) => k.passed === false).length, pending: kpis.rows.filter((k) => k.passed == null).length, kpis: kpis.rows },
    plots: plots.rows,
    open_alerts: alerts.rows[0].open_alerts,
  });
}));

export default router;

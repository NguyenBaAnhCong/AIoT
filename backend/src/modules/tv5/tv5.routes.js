import { Router } from 'express';
import { pool, withUserTx } from '../../config/db.js';
import { requirePermission, requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sqiApi } from '../../../../tv5/sqi.mjs';
import { activate, calculate, comparison, configuration, createDefinition } from '../../../../tv5/sqi-admin.mjs';
import { alertSummary, changeAlert, changeRecommendation, evaluate, listAlerts, listRules, saveRule } from '../../../../tv5/alerts.mjs';
import { createReport, downloadReport, listReports, reportOptions } from '../../../../tv5/reports.mjs';

const router = Router();

function endpoint(method, path, permissions, handler) {
  router[method](path, requireAuth, ...permissions.map(code => requirePermission(code)), asyncHandler(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const body = req.body;
    if (method !== 'get' && (!body || typeof body !== 'object' || Array.isArray(body))) {
      throw AppError.badRequest('Cần gửi một đối tượng JSON.');
    }

    const options = {
      userId: req.user.id,
      runTransaction: run => withUserTx(req.user.id, run),
      fileBase: '/api/v1/tv5/reports',
    };

    try {
      const data = await handler(req, url, body, options);
      res.set('Cache-Control', 'no-store');
      if (data?.file) {
        return res.type(data.type)
          .set('Content-Disposition', `attachment; filename="${data.filename}"`)
          .send(data.file);
      }
      return res.json({ data });
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error.status >= 400 && error.status < 500) {
        throw new AppError(error.status, 'TV5_REQUEST_ERROR', error.message);
      }
      if (error.code === '23P01') {
        throw AppError.conflict('Khoảng ngày và ô đã có điểm từ dataset khác trong phiên bản SQI này.');
      }
      throw error;
    }
  }));
}

for (const path of ['/sqi/plots', '/sqi/scores', '/sqi/scores/:id']) {
  endpoint('get', path, ['sqi.read'], async (_, url) => {
    const { status, body } = await sqiApi(pool, url);
    if (status !== 200) throw new AppError(status, 'SQI_ERROR', body.error);
    return body;
  });
}
endpoint('get', '/sqi/configuration', ['sqi.read'], () => configuration(pool));
endpoint('get', '/sqi/comparison', ['sqi.read'], (_, url) => comparison(pool, url.searchParams.get('definitionId')));
endpoint('post', '/sqi/definitions', ['sqi.write'], (_, url, body, options) => createDefinition(pool, body, options));
endpoint('post', '/sqi/definitions/:id/activate', ['sqi.write'], (req, url, body, options) => activate(pool, req.params.id, options));
endpoint('post', '/sqi/calculate', ['sqi.write'], (req, url, body, options) => {
  if (body.label && !req.user.permissions.includes('dataset.write')) {
    throw AppError.forbidden('Thiếu quyền dataset.write để gán nhãn.');
  }
  return calculate(pool, body.definition, body.dataset, body.label, options);
});

endpoint('get', '/alerts', ['alert.read'], (_, url) => listAlerts(pool, url.searchParams));
endpoint('get', '/alerts/summary', ['alert.read'], () => alertSummary(pool));
endpoint('get', '/alert-rules', ['alert.read'], () => listRules(pool));
endpoint('patch', '/alerts/:id', ['alert.write'], (req, url, body, options) => changeAlert(pool, req.params.id, body, options));
endpoint('patch', '/recommendations/:id', ['alert.write'], (req, url, body, options) => changeRecommendation(pool, req.params.id, body, options));
endpoint('post', '/alert-rules', ['alert.write'], (_, url, body, options) => saveRule(pool, null, body, options));
endpoint('put', '/alert-rules/:id', ['alert.write'], (req, url, body, options) => saveRule(pool, req.params.id, body, options));
endpoint('post', '/alerts/evaluate', ['alert.write'], (_, url, body, options) => evaluate(pool, body.at, options));

endpoint('get', '/reports', ['reporting.read'], () => listReports(pool));
endpoint('get', '/reports/kpis', ['reporting.read'], async () => {
  const { rows } = await pool.query(`
    SELECT s.*, latest.measured_value
    FROM reporting.v_acceptance_summary s
    JOIN reporting.kpis k USING (kpi_code)
    LEFT JOIN LATERAL (
      SELECT m.measured_value FROM reporting.kpi_measurements m
      WHERE m.kpi_id = k.kpi_id AND m.scope_type = 'SYSTEM'
      ORDER BY m.measured_at DESC, m.measurement_id DESC LIMIT 1
    ) latest ON true
    ORDER BY k.domain, s.kpi_code
  `);
  return rows;
});
endpoint('get', '/reports/options', ['reporting.read'], () => reportOptions(pool));
endpoint('get', '/reports/:id/file', ['reporting.read'], req => downloadReport(pool, req.params.id));
endpoint('post', '/reports', ['reporting.write'], (_, url, body, options) => createReport(pool, body, options));

export default router;

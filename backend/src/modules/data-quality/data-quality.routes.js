import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as c from './data-quality.controller.js';
const r=Router(); r.use(requireAuth);
r.get('/rules',asyncHandler(c.rules)); r.post('/rules',requirePermission('data_quality.write'),asyncHandler(c.createRule)); r.patch('/rules/:id',requirePermission('data_quality.write'),asyncHandler(c.updateRule));
r.post('/checks',requirePermission('data_quality.write'),asyncHandler(c.run)); r.get('/checks',asyncHandler(c.checks)); r.get('/stats',asyncHandler(c.stats)); r.get('/kpis',asyncHandler(c.kpis));
r.get('/issues',asyncHandler(c.issues)); r.post('/issues/:id/:action',requirePermission('data_quality.write'),asyncHandler(c.issueAction)); r.get('/audit',asyncHandler(c.audit));
export default r;

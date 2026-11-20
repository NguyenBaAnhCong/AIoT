import{Router}from'express';import{requireAuth,requirePermission}from'../../middleware/auth.js';import{asyncHandler}from'../../utils/asyncHandler.js';import * as c from './dataset.controller.js';
const r = Router();
r.use(requireAuth);
r.get('/', requirePermission('dataset.read'), asyncHandler(c.list));
r.post('/', requirePermission('dataset.write'), asyncHandler(c.create));
r.get('/labels', requirePermission('dataset.read'), asyncHandler(c.labels));
r.get('/:id', requirePermission('dataset.read'), asyncHandler(c.detail));
r.get('/:id/versions', requirePermission('dataset.read'), asyncHandler(c.versions));
r.post('/:id/versions', requirePermission('dataset.write'), asyncHandler(c.createVersion));
r.get('/versions/:id/readiness', requirePermission('dataset.read'), asyncHandler(c.readiness));
r.get('/versions/:id/records', requirePermission('dataset.read'), asyncHandler(c.records));
r.post('/versions/:id/build', requirePermission('dataset.write'), asyncHandler(c.build));
r.post('/versions/:id/freeze', requirePermission('dataset.write'), asyncHandler(c.freeze));
r.get('/versions/:id/distribution', requirePermission('dataset.read'), asyncHandler(c.distribution));
r.post('/versions/:id/records/:recordId/label', requirePermission('dataset.write'), asyncHandler(c.label));
r.get('/versions/:id/export.csv', requirePermission('dataset.read'), asyncHandler(c.exportCsv));
export default r;


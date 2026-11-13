// Đọc request, gọi service, trả response (module ml – TV6).
import * as svc from './ml.service.js';
import { ok, created, parsePaging } from '../../utils/response.js';

export async function listModels(req, res) {
  const { page, limit, offset } = parsePaging(req.query);
  const { items, total } = await svc.listModels({ limit, offset, taskType: req.query.task_type });
  ok(res, items, { page, limit, total });
}

export async function getModel(req, res) {
  ok(res, await svc.getModel(req.params.modelCode));
}

export async function createModel(req, res) {
  created(res, await svc.createModel(req.body, req.user?.id));
}

export async function createVersion(req, res) {
  created(res, await svc.createVersion(req.params.modelCode, req.body, req.user?.id));
}

export async function getVersion(req, res) {
  ok(res, await svc.getVersion(req.params.id));
}

export async function putMetrics(req, res) {
  ok(res, await svc.putMetrics(req.params.id, req.body, req.user?.id));
}

export async function approveVersion(req, res) {
  ok(res, await svc.approveVersion(req.params.id, req.user?.id));
}

export async function changeVersionStatus(req, res) {
  ok(res, await svc.changeVersionStatus(req.params.id, req.body, req.user?.id));
}

export async function acceptance(req, res) {
  ok(res, await svc.acceptance());
}

export async function listInference(req, res) {
  const { page, limit, offset } = parsePaging(req.query, { defaultLimit: 50, maxLimit: 500 });
  const { items, total } = await svc.listInference({ limit, offset, filters: req.query });
  ok(res, items, { page, limit, total });
}

export async function inferenceDaily(req, res) {
  ok(res, await svc.inferenceDaily(req.query));
}

export async function createInferenceBatch(req, res) {
  created(res, await svc.createInferenceBatch(req.body, req.user?.id));
}

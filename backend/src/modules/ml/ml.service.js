// Logic nghiệp vụ module ml (TV6): model registry, metrics, duyệt model, kết quả suy luận.
import { query, withUserTx } from '../../config/db.js';
import { AppError } from '../../utils/AppError.js';
import * as Q from './ml.queries.js';

const TASK_TYPES = ['ANOMALY_DETECTION', 'CLASSIFICATION', 'FORECASTING', 'REGRESSION'];
const FRAMEWORKS = ['TFLITE', 'TFLM', 'ONNX', 'SKLEARN', 'EDGE_IMPULSE', 'OTHER'];
const QUANTIZATIONS = ['FP32', 'FP16', 'INT8'];
const SPLITS = ['TRAIN', 'VAL', 'TEST', 'FIELD'];
const ENVIRONMENTS = ['OFFLINE', 'EDGE'];
const METRICS = ['ACCURACY', 'PRECISION', 'RECALL', 'F1', 'AUC', 'RMSE', 'MAE', 'MAPE', 'R2',
                 'LATENCY_MS_AVG', 'LATENCY_MS_P95', 'RAM_KB', 'FLASH_KB'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_INFERENCE_BATCH = 1000;

// Chuyển trạng thái được phép đổi tay. APPROVED chỉ qua approve(), DEPLOYED chỉ qua OTA.
const MANUAL_TRANSITIONS = {
  TRAINED: ['VALIDATING', 'REJECTED'],
  VALIDATING: ['TRAINED', 'REJECTED'],
  APPROVED: ['RETIRED', 'REJECTED'],
  DEPLOYED: ['RETIRED'],
};

// ---------- kiểm tra dữ liệu ----------
function check(errors) {
  const list = errors.filter(Boolean);
  if (list.length) throw AppError.badRequest('Dữ liệu không hợp lệ', list);
}
const required = (obj, field) => (obj[field] === undefined || obj[field] === null || obj[field] === ''
  ? { field, message: 'Bắt buộc' } : null);
const oneOf = (obj, field, values) => (obj[field] != null && !values.includes(obj[field])
  ? { field, message: `Phải là một trong: ${values.join(', ')}` } : null);
const uuidOrNull = (obj, field) => (obj[field] != null && !UUID.test(obj[field])
  ? { field, message: 'Phải là UUID' } : null);
const numberOrNull = (obj, field) => (obj[field] != null && !Number.isFinite(Number(obj[field]))
  ? { field, message: 'Phải là số' } : null);

export function assertUuid(id, name = 'id') {
  if (!UUID.test(id)) throw AppError.badRequest(`${name} phải là UUID`);
}

/** Trả về danh sách lỗi của mảng metrics (rỗng nếu hợp lệ). */
function metricErrors(metrics) {
  if (metrics === undefined) return [];
  if (!Array.isArray(metrics)) return [{ field: 'metrics', message: 'Phải là mảng' }];
  const errors = [];
  metrics.forEach((m, i) => {
    for (const e of [required(m, 'split'), required(m, 'metric_name'), required(m, 'metric_value'),
                     oneOf(m, 'split', SPLITS), oneOf(m, 'environment', ENVIRONMENTS),
                     oneOf(m, 'metric_name', METRICS), numberOrNull(m, 'metric_value'),
                     uuidOrNull(m, 'dataset_version_id')]) {
      if (e) errors.push({ ...e, field: `metrics[${i}].${e.field}` });
    }
  });
  return errors;
}

async function upsertMetrics(client, versionId, metrics, defaultDatasetVersionId = null) {
  const out = [];
  for (const m of metrics) {
    const { rows } = await client.query(Q.UPSERT_METRIC, [
      versionId, m.dataset_version_id ?? defaultDatasetVersionId, m.split, m.environment ?? 'OFFLINE',
      m.metric_name, Number(m.metric_value), m.per_class ?? null]);
    out.push(rows[0]);
  }
  return out;
}

// ---------- models ----------
export async function listModels({ limit, offset, taskType }) {
  const { rows } = await query(Q.LIST_MODELS, [limit, offset, taskType ?? null]);
  const total = rows[0]?.total ?? 0;
  return { items: rows.map(({ total: _, ...r }) => r), total };
}

export async function getModel(code) {
  const { rows } = await query(Q.GET_MODEL_BY_CODE, [code]);
  if (!rows.length) throw AppError.notFound(`Không có model ${code}`);
  const versions = (await query(Q.LIST_VERSIONS, [rows[0].model_id])).rows;
  return { ...rows[0], versions };
}

export async function createModel(body, userId) {
  check([required(body, 'model_code'), required(body, 'name'), required(body, 'task_type'),
         required(body, 'target'), oneOf(body, 'task_type', TASK_TYPES)]);
  return withUserTx(userId, async (client) => {
    const { rows } = await client.query(Q.INSERT_MODEL, [
      body.model_code, body.name, body.task_type, body.target, body.algorithm ?? null, userId ?? null,
      body.description ?? null]);
    return rows[0];
  }, { reason: `Tạo model ${body.model_code}` });
}

// ---------- versions ----------
export async function getVersion(id) {
  assertUuid(id);
  const { rows } = await query(Q.GET_VERSION, [id]);
  if (!rows.length) throw AppError.notFound('Không có model version này');
  const metrics = (await query(Q.LIST_METRICS, [id])).rows;
  return { ...rows[0], metrics };
}

export async function createVersion(modelCode, body, userId) {
  check([required(body, 'version'), required(body, 'framework'), required(body, 'artifact_uri'),
         required(body, 'artifact_sha256'), oneOf(body, 'framework', FRAMEWORKS),
         oneOf(body, 'quantization', QUANTIZATIONS), uuidOrNull(body, 'dataset_version_id'),
         numberOrNull(body, 'size_kb'),
         body.artifact_sha256 && !/^[0-9a-f]{64}$/i.test(body.artifact_sha256)
           ? { field: 'artifact_sha256', message: 'Phải là chuỗi SHA-256 (64 ký tự hex)' } : null,
         ...metricErrors(body.metrics)]);
  const metrics = body.metrics ?? [];

  const { rows: models } = await query(Q.GET_MODEL_BY_CODE, [modelCode]);
  if (!models.length) throw AppError.notFound(`Không có model ${modelCode}`);

  const version = await withUserTx(userId, async (client) => {
    const { rows } = await client.query(Q.INSERT_VERSION, [
      models[0].model_id, body.version, body.dataset_version_id ?? null, body.framework,
      body.quantization ?? null, body.artifact_uri, body.artifact_sha256.toLowerCase(), body.size_kb ?? null,
      body.input_schema ?? null, body.output_schema ?? null, body.hyperparameters ?? null,
      body.target_hardware ?? null, body.min_firmware_version ?? null, body.trained_at ?? null]);
    await upsertMetrics(client, rows[0].model_version_id, metrics, body.dataset_version_id ?? null);
    return rows[0];
  }, { reason: `Đăng ký ${modelCode} ${body.version}` });
  return getVersion(version.model_version_id);
}

export async function putMetrics(id, body, userId) {
  assertUuid(id);
  const metrics = Array.isArray(body) ? body : body.metrics;
  if (!Array.isArray(metrics) || !metrics.length) throw AppError.badRequest('Cần mảng metrics có ít nhất 1 phần tử');
  check(metricErrors(metrics));
  await getVersion(id);
  await withUserTx(userId, (client) => upsertMetrics(client, id, metrics), { reason: 'Cập nhật metrics model' });
  return getVersion(id);
}

export async function approveVersion(id, userId) {
  assertUuid(id);
  const current = await getVersion(id);
  if (current.status === 'APPROVED' || current.status === 'DEPLOYED') {
    throw AppError.conflict(`Version đã ở trạng thái ${current.status}`);
  }
  if (current.status === 'RETIRED' || current.status === 'REJECTED') {
    throw AppError.conflict(`Không thể duyệt version đang ${current.status}`);
  }
  try {
    await withUserTx(userId, (client) => client.query(Q.APPROVE_VERSION, [id, userId ?? null]),
                     { reason: `Duyệt ${current.model_code} ${current.version}` });
  } catch (err) {
    // ml.approve_model_version() RAISE EXCEPTION khi chưa đạt ngưỡng nghiệm thu
    if (err.code === 'P0001') {
      throw new AppError(422, 'ACCEPTANCE_NOT_MET', 'Model chưa đạt tiêu chí nghiệm thu', {
        accuracy: current.accuracy, precision: current.precision, recall: current.recall, f1: current.f1,
        required: { accuracy: 0.9, precision: 0.9, recall: 0.8, f1: 0.85 } });
    }
    throw err;
  }
  return getVersion(id);
}

export async function changeVersionStatus(id, body, userId) {
  assertUuid(id);
  check([required(body, 'status')]);
  const current = await getVersion(id);
  const allowed = MANUAL_TRANSITIONS[current.status] ?? [];
  if (!allowed.includes(body.status)) {
    throw AppError.conflict(`Không thể chuyển ${current.status} → ${body.status}`,
                            { allowed, note: 'APPROVED dùng /approve, DEPLOYED do OTA đặt' });
  }
  if (body.status === 'RETIRED' || body.status === 'REJECTED') {
    const { rows } = await query(Q.COUNT_GATEWAYS_RUNNING, [id]);
    if (rows[0].n > 0) throw AppError.conflict(`Version đang chạy trên ${rows[0].n} gateway, hãy cập nhật OTA trước`);
  }
  await withUserTx(userId, (client) => client.query(Q.UPDATE_VERSION_STATUS, [id, body.status]),
                   { reason: body.reason ?? `Đổi trạng thái sang ${body.status}` });
  return getVersion(id);
}

export async function acceptance() {
  const { rows } = await query(Q.ACCEPTANCE);
  return { thresholds: { accuracy: 0.9, precision: 0.9, recall: 0.8, f1: 0.85, latency_ms_p95: 2000 }, models: rows };
}

// ---------- inference results ----------
const parseBool = (v) => (v === undefined ? null : v === 'true' ? true : v === 'false' ? false : undefined);
const parseTime = (v, name) => {
  if (v === undefined) return null;
  if (Number.isNaN(Date.parse(v))) throw AppError.badRequest(`${name} không phải thời gian hợp lệ`);
  return v;
};

export async function listInference({ limit, offset, filters }) {
  const anomaly = parseBool(filters.anomaly);
  if (anomaly === undefined) throw AppError.badRequest('anomaly phải là true hoặc false');
  const { rows } = await query(Q.LIST_INFERENCE, [
    limit, offset, filters.model_code ?? null, filters.plot_code ?? null, filters.gateway_code ?? null,
    parseTime(filters.from, 'from'), parseTime(filters.to, 'to'), anomaly]);
  const total = rows[0]?.total ?? 0;
  return { items: rows.map(({ total: _, ...r }) => r), total };
}

export async function inferenceDaily({ from, to }) {
  const end = parseTime(to, 'to') ?? new Date().toISOString();
  const start = parseTime(from, 'from') ?? new Date(Date.parse(end) - 7 * 86400_000).toISOString();
  const { rows } = await query(Q.INFERENCE_DAILY, [start, end]);
  return rows;
}

export async function createInferenceBatch(body, userId) {
  const results = Array.isArray(body) ? body : body.results;
  if (!Array.isArray(results) || !results.length) throw AppError.badRequest('Cần mảng results có ít nhất 1 phần tử');
  if (results.length > MAX_INFERENCE_BATCH) throw AppError.badRequest(`Tối đa ${MAX_INFERENCE_BATCH} kết quả mỗi lần gửi`);
  const errors = [];
  results.forEach((r, i) => {
    for (const e of [required(r, 'model_version_id'), required(r, 'gateway_code'), required(r, 'inferred_at'),
                     uuidOrNull(r, 'model_version_id'), oneOf(r, 'task_type', TASK_TYPES),
                     numberOrNull(r, 'confidence'), numberOrNull(r, 'anomaly_score'), numberOrNull(r, 'latency_ms'),
                     r.inferred_at && Number.isNaN(Date.parse(r.inferred_at))
                       ? { field: 'inferred_at', message: 'Không phải thời gian hợp lệ' } : null]) {
      if (e) errors.push({ ...e, field: `results[${i}].${e.field}` });
    }
  });
  check(errors);

  return withUserTx(userId, async (client) => {
    const { rows } = await client.query(Q.INSERT_INFERENCE_BATCH, [JSON.stringify(results)]);
    if (rows.length !== results.length) {
      // Có bản ghi trỏ tới model version / gateway / node không tồn tại -> hủy cả lô
      throw AppError.badRequest('Có kết quả tham chiếu model_version_id, gateway_code hoặc node_code không tồn tại',
                                { received: results.length, valid: rows.length });
    }
    return { inserted: rows.length };
  }, { reason: 'Gateway gửi kết quả suy luận' });
}

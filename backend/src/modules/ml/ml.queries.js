// Câu SQL của module ml (TV6). Luôn dùng tham số $1, $2...

// ---------- models ----------
export const LIST_MODELS = `
SELECT m.model_id, m.model_code, m.name, m.task_type, m.target, m.algorithm, m.created_at,
       v.version_count, d.version AS deployed_version, l.version AS latest_version, l.status AS latest_status,
       count(*) OVER () AS total
FROM ml.models m
LEFT JOIN LATERAL (SELECT count(*) AS version_count FROM ml.model_versions WHERE model_id = m.model_id) v ON true
LEFT JOIN LATERAL (SELECT version FROM ml.model_versions
                   WHERE model_id = m.model_id AND status = 'DEPLOYED' ORDER BY created_at DESC LIMIT 1) d ON true
LEFT JOIN LATERAL (SELECT version, status FROM ml.model_versions
                   WHERE model_id = m.model_id ORDER BY created_at DESC LIMIT 1) l ON true
WHERE ($3::text IS NULL OR m.task_type = $3)
ORDER BY m.model_code
LIMIT $1 OFFSET $2`;

export const GET_MODEL_BY_CODE = `
SELECT model_id, model_code, name, task_type, target, algorithm, owner_id, description, created_at
FROM ml.models WHERE model_code = $1`;

export const INSERT_MODEL = `
INSERT INTO ml.models (model_code, name, task_type, target, algorithm, owner_id, description)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING model_id, model_code, name, task_type, target, algorithm, owner_id, description, created_at`;

// ---------- versions ----------
export const LIST_VERSIONS = `
SELECT mv.model_version_id, mv.version, mv.framework, mv.quantization, mv.size_kb, mv.status,
       mv.trained_at, mv.approved_at, mv.created_at,
       a.accuracy, a.precision, a.recall, a.f1, a.n_inferences, a.latency_ms_p95, a.passed
FROM ml.model_versions mv
JOIN ml.v_model_acceptance a ON a.model_version_id = mv.model_version_id
WHERE mv.model_id = $1
ORDER BY mv.created_at DESC`;

export const GET_VERSION = `
SELECT mv.*, m.model_code, m.name AS model_name, m.task_type,
       a.accuracy, a.precision, a.recall, a.f1, a.n_inferences, a.latency_ms_avg, a.latency_ms_p95,
       a.accuracy_ok, a.precision_ok, a.recall_ok, a.f1_ok, a.latency_ok, a.passed,
       (SELECT coalesce(json_agg(g.gateway_code ORDER BY g.gateway_code), '[]')
          FROM iot.gateways g WHERE g.current_model_version_id = mv.model_version_id) AS running_on_gateways
FROM ml.model_versions mv
JOIN ml.models m ON m.model_id = mv.model_id
JOIN ml.v_model_acceptance a ON a.model_version_id = mv.model_version_id
WHERE mv.model_version_id = $1`;

export const LIST_METRICS = `
SELECT split, environment, metric_name, metric_value, per_class, dataset_version_id, evaluated_at
FROM ml.model_metrics WHERE model_version_id = $1
ORDER BY split, environment, metric_name`;

export const INSERT_VERSION = `
INSERT INTO ml.model_versions (model_id, version, dataset_version_id, framework, quantization, artifact_uri,
                               artifact_sha256, size_kb, input_schema, output_schema, hyperparameters,
                               target_hardware, min_firmware_version, trained_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING model_version_id, model_id, version, framework, quantization, artifact_uri, artifact_sha256,
          size_kb, status, trained_at, created_at`;

export const UPSERT_METRIC = `
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value, per_class)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (model_version_id, split, environment, metric_name)
DO UPDATE SET metric_value = EXCLUDED.metric_value, per_class = EXCLUDED.per_class,
              dataset_version_id = EXCLUDED.dataset_version_id, evaluated_at = now()
RETURNING split, environment, metric_name, metric_value, evaluated_at`;

export const APPROVE_VERSION = `SELECT ml.approve_model_version($1, $2)`;

export const UPDATE_VERSION_STATUS = `
UPDATE ml.model_versions SET status = $2 WHERE model_version_id = $1
RETURNING model_version_id, version, status`;

export const COUNT_GATEWAYS_RUNNING = `
SELECT count(*) AS n FROM iot.gateways WHERE current_model_version_id = $1`;

// ---------- acceptance ----------
export const ACCEPTANCE = `
SELECT model_code, task_type, version, status, model_version_id, accuracy, precision, recall, f1,
       n_inferences, latency_ms_avg, latency_ms_p95,
       accuracy_ok, precision_ok, recall_ok, f1_ok, latency_ok, passed
FROM ml.v_model_acceptance
ORDER BY model_code, version`;

// ---------- inference results ----------
export const LIST_INFERENCE = `
SELECT i.inference_id, mo.model_code, mv.version, g.gateway_code, n.node_code, p.plot_code,
       i.inferred_at, i.task_type, i.predicted_label, i.confidence, i.anomaly_score, i.is_anomaly,
       i.latency_ms, i.prediction, i.input_reading_id,
       count(*) OVER () AS total
FROM ml.inference_results i
JOIN ml.model_versions mv ON mv.model_version_id = i.model_version_id
JOIN ml.models mo ON mo.model_id = mv.model_id
JOIN iot.gateways g ON g.gateway_id = i.gateway_id
LEFT JOIN iot.sensor_nodes n ON n.node_id = i.node_id
LEFT JOIN farm.plots p ON p.plot_id = i.plot_id
WHERE ($3::text IS NULL OR mo.model_code = $3)
  AND ($4::text IS NULL OR p.plot_code = $4)
  AND ($5::text IS NULL OR g.gateway_code = $5)
  AND ($6::timestamptz IS NULL OR i.inferred_at >= $6)
  AND ($7::timestamptz IS NULL OR i.inferred_at < $7)
  AND ($8::boolean IS NULL OR i.is_anomaly = $8)
ORDER BY i.inferred_at DESC
LIMIT $1 OFFSET $2`;

// Thống kê theo ngày cho màn hình 10
export const INFERENCE_DAILY = `
SELECT mo.model_code, date_trunc('day', i.inferred_at)::date AS day,
       count(*) AS inferences,
       count(*) FILTER (WHERE i.is_anomaly) AS anomalies,
       round(avg(i.latency_ms), 3) AS latency_ms_avg,
       round(percentile_cont(0.95) WITHIN GROUP (ORDER BY i.latency_ms)::numeric, 3) AS latency_ms_p95
FROM ml.inference_results i
JOIN ml.model_versions mv ON mv.model_version_id = i.model_version_id
JOIN ml.models mo ON mo.model_id = mv.model_id
WHERE i.inferred_at >= $1 AND i.inferred_at < $2
GROUP BY 1, 2
ORDER BY 2, 1`;

// Nạp nhiều kết quả suy luận từ gateway trong 1 câu lệnh.
// Gateway gửi mã gateway/node (không cần biết UUID); ô thí nghiệm lấy theo node.
export const INSERT_INFERENCE_BATCH = `
INSERT INTO ml.inference_results (model_version_id, gateway_id, node_id, plot_id, inferred_at, task_type,
                                  input_reading_id, input_features, prediction, predicted_label, confidence,
                                  anomaly_score, is_anomaly, latency_ms)
SELECT r.model_version_id, g.gateway_id, n.node_id, n.plot_id, r.inferred_at, coalesce(r.task_type, mo.task_type),
       r.input_reading_id, r.input_features, coalesce(r.prediction, '{}'::jsonb), r.predicted_label, r.confidence,
       r.anomaly_score, r.is_anomaly, r.latency_ms
FROM jsonb_to_recordset($1::jsonb) AS r(
       model_version_id uuid, gateway_code text, node_code text, inferred_at timestamptz, task_type text,
       input_reading_id bigint, input_features jsonb, prediction jsonb, predicted_label text, confidence numeric,
       anomaly_score numeric, is_anomaly boolean, latency_ms numeric)
JOIN ml.model_versions mv ON mv.model_version_id = r.model_version_id
JOIN ml.models mo ON mo.model_id = mv.model_id
JOIN iot.gateways g ON g.gateway_code = r.gateway_code
LEFT JOIN iot.sensor_nodes n ON n.node_code = r.node_code
WHERE r.node_code IS NULL OR n.node_id IS NOT NULL
RETURNING inference_id`;

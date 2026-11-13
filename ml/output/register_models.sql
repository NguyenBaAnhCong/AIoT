-- Sinh tự động bởi ml/01_train_models.ipynb lúc 2026-11-12T21:55:13+07:00. Chạy lại an toàn (upsert).
BEGIN;

INSERT INTO ml.model_versions (model_id, version, dataset_version_id, framework, quantization, artifact_uri,
                               artifact_sha256, size_kb, input_schema, hyperparameters, target_hardware, status, trained_at)
SELECT m.model_id, '1.1.0',
       (SELECT dataset_version_id FROM dataset.dataset_versions WHERE status = 'FROZEN' ORDER BY frozen_at DESC LIMIT 1),
       'SKLEARN', 'FP32', 'ml/models/soil_health_cls.joblib', 'eaedffc4e6bb346387555b83a363bebd665bfeb05d4e035dc63751f26b08048d', 1.14,
       '{"task": "CLASSIFICATION", "features": ["ph", "ec", "soil_moisture", "soil_temperature", "n", "p", "k"], "classes": ["FAIR", "GOOD"], "units": {"ph": "pH", "ec": "dS/m", "soil_moisture": "%", "soil_temperature": "°C", "n": "mg/kg", "p": "mg/kg", "k": "mg/kg"}}'::jsonb, '{"algorithm": "Logistic Regression"}'::jsonb,
       'Raspberry Pi 5', 'TRAINED', '2026-11-12T21:55:13+07:00'
FROM ml.models m WHERE m.model_code = 'SOIL-HEALTH-CLS'
ON CONFLICT (model_id, version) DO UPDATE
   SET artifact_sha256 = EXCLUDED.artifact_sha256, size_kb = EXCLUDED.size_kb, input_schema = EXCLUDED.input_schema,
       hyperparameters = EXCLUDED.hyperparameters, trained_at = EXCLUDED.trained_at, status = 'TRAINED';
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'ACCURACY', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'PRECISION', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'RECALL', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'F1', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'LATENCY_MS_AVG', 1.652462
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'LATENCY_MS_P95', 2.28155
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'VAL', 'OFFLINE', 'ACCURACY', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'VAL', 'OFFLINE', 'PRECISION', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'VAL', 'OFFLINE', 'RECALL', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'VAL', 'OFFLINE', 'F1', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();

INSERT INTO ml.model_versions (model_id, version, dataset_version_id, framework, quantization, artifact_uri,
                               artifact_sha256, size_kb, input_schema, hyperparameters, target_hardware, status, trained_at)
SELECT m.model_id, '1.1.0',
       (SELECT dataset_version_id FROM dataset.dataset_versions WHERE status = 'FROZEN' ORDER BY frozen_at DESC LIMIT 1),
       'SKLEARN', 'FP32', 'ml/models/sensor_anomaly.joblib', '1156476baeedc6d5c95366364587f7cc4e06ad4dc8c9e3025a6e109449415a48', 0.2,
       '{"task": "ANOMALY_DETECTION", "algorithm": "Robust z-score (MAD)", "threshold": 31.67727196805287, "history_window": 8, "features": ["ph", "ec", "soil_moisture", "n", "p", "k"], "mad": {"ph": 0.03706500000000053, "ec": 0.015567300000000013, "soil_moisture": 0.45219299999999957, "n": 2.0015099999999912, "p": 0.9636900000000084, "k": 4.07715}, "formula": "score = max_c |x_c - median(x_c[t-8..t-1])| / mad_c ; bất thường nếu score >= threshold"}'::jsonb, '{"algorithm": "Robust z-score (MAD)"}'::jsonb,
       'Raspberry Pi 5', 'TRAINED', '2026-11-12T21:55:13+07:00'
FROM ml.models m WHERE m.model_code = 'SENSOR-ANOMALY'
ON CONFLICT (model_id, version) DO UPDATE
   SET artifact_sha256 = EXCLUDED.artifact_sha256, size_kb = EXCLUDED.size_kb, input_schema = EXCLUDED.input_schema,
       hyperparameters = EXCLUDED.hyperparameters, trained_at = EXCLUDED.trained_at, status = 'TRAINED';
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'ACCURACY', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'PRECISION', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'RECALL', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'F1', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'LATENCY_MS_AVG', 0.255047
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'LATENCY_MS_P95', 0.41376
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'VAL', 'OFFLINE', 'ACCURACY', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'VAL', 'OFFLINE', 'PRECISION', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'VAL', 'OFFLINE', 'RECALL', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'VAL', 'OFFLINE', 'F1', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.1.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
COMMIT;

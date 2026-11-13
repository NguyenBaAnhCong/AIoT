-- Sinh tự động bởi ml/02_convert_tflite.ipynb lúc 2026-11-12T23:03:03+07:00. Chạy lại an toàn (upsert).
BEGIN;

INSERT INTO ml.model_versions (model_id, version, dataset_version_id, framework, quantization, artifact_uri,
                               artifact_sha256, size_kb, input_schema, hyperparameters, target_hardware,
                               min_firmware_version, status, trained_at)
SELECT m.model_id, '1.2.0',
       (SELECT dataset_version_id FROM dataset.dataset_versions WHERE status = 'FROZEN' ORDER BY frozen_at DESC LIMIT 1),
       'TFLITE', 'INT8', 'ml/models/soil_health_cls.tflite', '9458d124b5627ef8c972491728e186367e9ba23b3454e4063c46dff00403d8ad', 2.56,
       '{"task": "CLASSIFICATION", "features": ["ph", "ec", "soil_moisture", "soil_temperature", "n", "p", "k"], "classes": ["FAIR", "GOOD"], "units": {"ph": "pH", "ec": "dS/m", "soil_moisture": "%", "soil_temperature": "°C", "n": "mg/kg", "p": "mg/kg", "k": "mg/kg"}}'::jsonb, '{"algorithm": "Logistic Regression", "converted_from": "1.1.0", "tensorflow": "2.21.0"}'::jsonb,
       'Raspberry Pi 5', '1.0.0', 'TRAINED', '2026-11-12T23:03:03+07:00'
FROM ml.models m WHERE m.model_code = 'SOIL-HEALTH-CLS'
ON CONFLICT (model_id, version) DO UPDATE
   SET artifact_sha256 = EXCLUDED.artifact_sha256, size_kb = EXCLUDED.size_kb, input_schema = EXCLUDED.input_schema,
       hyperparameters = EXCLUDED.hyperparameters, trained_at = EXCLUDED.trained_at;
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'ACCURACY', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.2.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'PRECISION', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.2.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'RECALL', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.2.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'F1', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.2.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'LATENCY_MS_AVG', 0.055569
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.2.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'LATENCY_MS_P95', 0.089
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.2.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'FLASH_KB', 2.56
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SOIL-HEALTH-CLS' AND mv.version = '1.2.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();

INSERT INTO ml.model_versions (model_id, version, dataset_version_id, framework, quantization, artifact_uri,
                               artifact_sha256, size_kb, input_schema, hyperparameters, target_hardware,
                               min_firmware_version, status, trained_at)
SELECT m.model_id, '1.2.0',
       (SELECT dataset_version_id FROM dataset.dataset_versions WHERE status = 'FROZEN' ORDER BY frozen_at DESC LIMIT 1),
       'TFLITE', 'FP32', 'ml/models/sensor_anomaly.tflite', '5b1942221a6ca252796b32f9e00959cfef617a2bb772424f78e25a9388124452', 1.31,
       '{"task": "ANOMALY_DETECTION", "algorithm": "Robust z-score (MAD)", "threshold": 31.67727196805287, "history_window": 8, "features": ["ph", "ec", "soil_moisture", "n", "p", "k"], "mad": {"ph": 0.03706500000000053, "ec": 0.015567300000000013, "soil_moisture": 0.45219299999999957, "n": 2.0015099999999912, "p": 0.9636900000000084, "k": 4.07715}, "formula": "score = max_c |x_c - median(x_c[t-8..t-1])| / mad_c ; bất thường nếu score >= threshold"}'::jsonb, '{"algorithm": "Robust z-score (MAD)", "converted_from": "1.1.0", "tensorflow": "2.21.0"}'::jsonb,
       'Raspberry Pi 5', '1.0.0', 'TRAINED', '2026-11-12T23:03:03+07:00'
FROM ml.models m WHERE m.model_code = 'SENSOR-ANOMALY'
ON CONFLICT (model_id, version) DO UPDATE
   SET artifact_sha256 = EXCLUDED.artifact_sha256, size_kb = EXCLUDED.size_kb, input_schema = EXCLUDED.input_schema,
       hyperparameters = EXCLUDED.hyperparameters, trained_at = EXCLUDED.trained_at;
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'ACCURACY', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.2.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'PRECISION', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.2.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'RECALL', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.2.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'F1', 1.0
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.2.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'LATENCY_MS_AVG', 0.492638
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.2.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'LATENCY_MS_P95', 0.773
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.2.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, environment, metric_name, metric_value)
SELECT mv.model_version_id, mv.dataset_version_id, 'TEST', 'OFFLINE', 'FLASH_KB', 1.31
FROM ml.model_versions mv JOIN ml.models m USING (model_id)
WHERE m.model_code = 'SENSOR-ANOMALY' AND mv.version = '1.2.0'
ON CONFLICT (model_version_id, split, environment, metric_name) DO UPDATE SET metric_value = EXCLUDED.metric_value, evaluated_at = now();
COMMIT;

-- =====================================================================
-- 11_ml.sql : Embedded ML – model registry, phiên bản, metrics, suy luận tại Edge
-- Tiêu chí nghiệm thu: Accuracy ≥90%, Precision ≥90%, Recall ≥80%, F1 ≥85%,
-- thời gian suy luận ≤2 s/mẫu
-- =====================================================================

CREATE TABLE ml.models (
    model_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_code      VARCHAR(32)  NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    task_type       VARCHAR(32)  NOT NULL
                    CHECK (task_type IN ('ANOMALY_DETECTION','CLASSIFICATION','FORECASTING','REGRESSION')),
    target          VARCHAR(64)  NOT NULL,                 -- vd: SOIL_HEALTH_CLASS, MOISTURE_T+24H, SENSOR_ANOMALY
    algorithm       VARCHAR(64),                           -- RandomForest, 1D-CNN, LSTM, IsolationForest, ...
    owner_id        UUID         REFERENCES iam.users(user_id),
    description     TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE ml.model_versions (
    model_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id        UUID         NOT NULL REFERENCES ml.models(model_id),
    version         VARCHAR(32)  NOT NULL,                 -- semver
    dataset_version_id UUID      REFERENCES dataset.dataset_versions(dataset_version_id),
    framework       VARCHAR(16)  NOT NULL CHECK (framework IN ('TFLITE','TFLM','ONNX','SKLEARN','EDGE_IMPULSE','OTHER')),
    quantization    VARCHAR(8)   CHECK (quantization IN ('FP32','FP16','INT8')),
    artifact_uri    TEXT         NOT NULL,
    artifact_sha256 CHAR(64)     NOT NULL,
    size_kb         NUMERIC(10,2),
    input_schema    JSONB,                                 -- danh sách feature, thứ tự, chuẩn hóa
    output_schema   JSONB,
    hyperparameters JSONB,
    target_hardware VARCHAR(64),
    min_firmware_version VARCHAR(32),
    status          VARCHAR(16)  NOT NULL DEFAULT 'TRAINED'
                    CHECK (status IN ('TRAINED','VALIDATING','APPROVED','DEPLOYED','RETIRED','REJECTED')),
    trained_at      TIMESTAMPTZ,
    approved_by     UUID         REFERENCES iam.users(user_id),
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (model_id, version)
);

CREATE TABLE ml.model_metrics (
    metric_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_version_id UUID        NOT NULL REFERENCES ml.model_versions(model_version_id) ON DELETE CASCADE,
    dataset_version_id UUID      REFERENCES dataset.dataset_versions(dataset_version_id),
    split           VARCHAR(8)   NOT NULL CHECK (split IN ('TRAIN','VAL','TEST','FIELD')),
    environment     VARCHAR(8)   NOT NULL DEFAULT 'OFFLINE' CHECK (environment IN ('OFFLINE','EDGE')),
    metric_name     VARCHAR(32)  NOT NULL
                    CHECK (metric_name IN ('ACCURACY','PRECISION','RECALL','F1','AUC','RMSE','MAE','MAPE','R2',
                                           'LATENCY_MS_AVG','LATENCY_MS_P95','RAM_KB','FLASH_KB')),
    metric_value    NUMERIC      NOT NULL,
    per_class       JSONB,                                 -- metric theo lớp / confusion matrix
    evaluated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (model_version_id, split, environment, metric_name)
);

CREATE TABLE ml.inference_results (
    inference_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_version_id UUID        NOT NULL REFERENCES ml.model_versions(model_version_id),
    gateway_id      UUID         NOT NULL REFERENCES iot.gateways(gateway_id),
    node_id         UUID         REFERENCES iot.sensor_nodes(node_id),
    plot_id         UUID         REFERENCES farm.plots(plot_id),
    inferred_at     TIMESTAMPTZ  NOT NULL,
    task_type       VARCHAR(32)  NOT NULL
                    CHECK (task_type IN ('ANOMALY_DETECTION','CLASSIFICATION','FORECASTING','REGRESSION')),
    input_record_id UUID,                                  -- dataset.dataset_records.record_id (nếu có)
    input_reading_id BIGINT,                               -- iot.sensor_readings.reading_id (nếu suy luận trực tiếp)
    input_features  JSONB,
    prediction      JSONB        NOT NULL,                 -- {"class":"GOOD","proba":{...}} / {"moisture_t24":28.1}
    predicted_label VARCHAR(32),
    confidence      NUMERIC(5,4) CHECK (confidence BETWEEN 0 AND 1),
    anomaly_score   NUMERIC,
    is_anomaly      BOOLEAN,
    latency_ms      NUMERIC(10,2) CHECK (latency_ms >= 0),
    ground_truth_label VARCHAR(32),                        -- đánh giá ngoài thực địa
    received_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ix_inference_gateway_time ON ml.inference_results(gateway_id, inferred_at);
CREATE INDEX ix_inference_plot_time    ON ml.inference_results(plot_id, inferred_at);
CREATE INDEX ix_inference_model        ON ml.inference_results(model_version_id, inferred_at);
CREATE INDEX ix_model_versions_model   ON ml.model_versions(model_id);

ALTER TABLE iot.gateways
    ADD CONSTRAINT fk_gateways_current_model
    FOREIGN KEY (current_model_version_id) REFERENCES ml.model_versions(model_version_id);

-- ---------------------------------------------------------------------
-- Kiểm tra tiêu chí nghiệm thu của model version (split TEST, OFFLINE)
-- + độ trễ thực tế tại Edge từ inference_results
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW ml.v_model_acceptance AS
WITH m AS (
    SELECT model_version_id,
           max(metric_value) FILTER (WHERE metric_name = 'ACCURACY')  AS accuracy,
           max(metric_value) FILTER (WHERE metric_name = 'PRECISION') AS precision_,
           max(metric_value) FILTER (WHERE metric_name = 'RECALL')    AS recall,
           max(metric_value) FILTER (WHERE metric_name = 'F1')        AS f1
    FROM ml.model_metrics
    WHERE split = 'TEST' AND environment = 'OFFLINE'
    GROUP BY model_version_id
),
lat AS (
    SELECT model_version_id,
           count(*) AS n_inferences,
           avg(latency_ms) AS latency_ms_avg,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS latency_ms_p95
    FROM ml.inference_results
    GROUP BY model_version_id
)
SELECT mo.model_code, mo.task_type, mv.version, mv.status, mv.model_version_id,
       m.accuracy, m.precision_ AS precision, m.recall, m.f1,
       lat.n_inferences, round(lat.latency_ms_avg, 2) AS latency_ms_avg,
       round(lat.latency_ms_p95::numeric, 2) AS latency_ms_p95,
       (m.accuracy  >= 0.90) AS accuracy_ok,
       (m.precision_ >= 0.90) AS precision_ok,
       (m.recall    >= 0.80) AS recall_ok,
       (m.f1        >= 0.85) AS f1_ok,
       (lat.latency_ms_p95 IS NULL OR lat.latency_ms_p95 <= 2000) AS latency_ok,
       COALESCE(m.accuracy >= 0.90 AND m.precision_ >= 0.90 AND m.recall >= 0.80 AND m.f1 >= 0.85
                AND (lat.latency_ms_p95 IS NULL OR lat.latency_ms_p95 <= 2000), false) AS passed
FROM ml.model_versions mv
JOIN ml.models mo USING (model_id)
LEFT JOIN m   USING (model_version_id)
LEFT JOIN lat USING (model_version_id);

-- Duyệt model: chỉ cho APPROVED khi đạt tiêu chí (áp dụng cho bài toán phân loại / anomaly)
CREATE OR REPLACE FUNCTION ml.approve_model_version(p_model_version_id UUID, p_user UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_task   VARCHAR;
    v_passed BOOLEAN;
BEGIN
    SELECT task_type, passed INTO v_task, v_passed
    FROM ml.v_model_acceptance WHERE model_version_id = p_model_version_id;
    IF v_task IS NULL THEN
        RAISE EXCEPTION 'Model version % không tồn tại', p_model_version_id;
    END IF;
    IF v_task IN ('CLASSIFICATION','ANOMALY_DETECTION') AND NOT v_passed THEN
        RAISE EXCEPTION 'Model version % chưa đạt tiêu chí nghiệm thu (ACC≥0.90, P≥0.90, R≥0.80, F1≥0.85)',
            p_model_version_id;
    END IF;
    UPDATE ml.model_versions
    SET status = 'APPROVED', approved_by = p_user, approved_at = now()
    WHERE model_version_id = p_model_version_id;
END;
$$;

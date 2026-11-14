-- =====================================================================
-- 14_reporting.sql : KPI, báo cáo, kết quả kinh tế, view dashboard
-- =====================================================================

CREATE TABLE reporting.kpis (
    kpi_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kpi_code        VARCHAR(48)  NOT NULL UNIQUE,
    name_vi         VARCHAR(255) NOT NULL,
    domain          VARCHAR(32)  NOT NULL,                 -- iot, data_quality, dataset, ml, ota, ...
    unit            VARCHAR(16)  NOT NULL,
    comparator      VARCHAR(4)   NOT NULL CHECK (comparator IN ('GTE','LTE')),
    target_value    NUMERIC      NOT NULL,
    is_acceptance_criterion BOOLEAN NOT NULL DEFAULT true, -- tiêu chí nghiệm thu theo hồ sơ
    description     TEXT
);

CREATE TABLE reporting.kpi_measurements (
    measurement_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kpi_id          UUID         NOT NULL REFERENCES reporting.kpis(kpi_id),
    period_start    TIMESTAMPTZ  NOT NULL,
    period_end      TIMESTAMPTZ  NOT NULL,
    scope_type      VARCHAR(16)  NOT NULL DEFAULT 'SYSTEM' CHECK (scope_type IN ('SYSTEM','SITE','PLOT','NODE','MODEL')),
    scope_id        UUID,
    measured_value  NUMERIC,
    passed          BOOLEAN,
    measured_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE reporting.reports (
    report_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type     VARCHAR(16)  NOT NULL
                    CHECK (report_type IN ('TECHNICAL','ECONOMIC','ENVIRONMENTAL','DATA_QUALITY','ML','OTA','SUMMARY')),
    title           VARCHAR(255) NOT NULL,
    experiment_id   UUID         REFERENCES experiment.experiments(experiment_id),
    crop_season_id  UUID         REFERENCES farm.crop_seasons(crop_season_id),
    period_start    DATE,
    period_end      DATE,
    parameters      JSONB,                                 -- bộ lọc dùng khi sinh báo cáo
    file_format     VARCHAR(8)   CHECK (file_format IN ('PDF','XLSX','CSV','DOCX')),
    file_uri        TEXT,
    status          VARCHAR(16)  NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','GENERATING','READY','FAILED')),
    generated_by    UUID         REFERENCES iam.users(user_id),
    generated_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Hiệu quả kinh tế theo nghiệm thức / mùa vụ
CREATE TABLE reporting.economic_results (
    economic_result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id   UUID         NOT NULL REFERENCES experiment.experiments(experiment_id),
    treatment_id    UUID         NOT NULL REFERENCES experiment.treatments(treatment_id),
    crop_season_id  UUID         REFERENCES farm.crop_seasons(crop_season_id),
    plot_id         UUID         REFERENCES farm.plots(plot_id),
    yield_kg_m2     NUMERIC(10,3) NOT NULL CHECK (yield_kg_m2 >= 0),
    yield_t_ha      NUMERIC(10,3) GENERATED ALWAYS AS (yield_kg_m2 * 10) STORED,
    price_vnd_kg    NUMERIC(14,2) NOT NULL DEFAULT 0,
    cost_biochar_vnd_ha    NUMERIC(16,2) NOT NULL DEFAULT 0,
    cost_fertilizer_vnd_ha NUMERIC(16,2) NOT NULL DEFAULT 0,
    cost_labor_vnd_ha      NUMERIC(16,2) NOT NULL DEFAULT 0,
    cost_other_vnd_ha      NUMERIC(16,2) NOT NULL DEFAULT 0,
    revenue_vnd_ha  NUMERIC(18,2) GENERATED ALWAYS AS (yield_kg_m2 * 10000 * price_vnd_kg) STORED,
    total_cost_vnd_ha NUMERIC(18,2) GENERATED ALWAYS AS
                    (cost_biochar_vnd_ha + cost_fertilizer_vnd_ha + cost_labor_vnd_ha + cost_other_vnd_ha) STORED,
    profit_vnd_ha   NUMERIC(18,2) GENERATED ALWAYS AS
                    (yield_kg_m2 * 10000 * price_vnd_kg
                     - (cost_biochar_vnd_ha + cost_fertilizer_vnd_ha + cost_labor_vnd_ha + cost_other_vnd_ha)) STORED,
    bcr             NUMERIC(8,3) GENERATED ALWAYS AS
                    (CASE WHEN cost_biochar_vnd_ha + cost_fertilizer_vnd_ha + cost_labor_vnd_ha + cost_other_vnd_ha > 0
                          THEN yield_kg_m2 * 10000 * price_vnd_kg
                               / (cost_biochar_vnd_ha + cost_fertilizer_vnd_ha + cost_labor_vnd_ha + cost_other_vnd_ha)
                     END) STORED,
    carbon_sequestered_kg_ha NUMERIC(12,2),                -- chỉ tiêu môi trường
    notes           TEXT
);

CREATE INDEX ix_kpi_meas_kpi_time ON reporting.kpi_measurements(kpi_id, period_start);
CREATE INDEX ix_econ_treatment    ON reporting.economic_results(treatment_id);

-- ---------------------------------------------------------------------
-- KPI thu thập dữ liệu theo node / ngày
--   expected       = số lần đo kỳ vọng theo chu kỳ của node
--   success_rate   = bản tin nhận được / kỳ vọng           (≥ 90%)
--   timestamp_rate = bản tin timestamp hợp lệ / nhận được  (≥ 90%)
--   error_dup_rate = (INVALID + trùng) / (nhận + trùng)     (≤ 5%)
--   missing_rate   = (kỳ vọng − hợp lệ) / kỳ vọng           (≤ 5% sau xử lý)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW reporting.v_data_collection_daily AS
WITH rd AS (
    SELECT node_id, date_trunc('day', measured_at) AS day,
           count(*) AS received,
           count(*) FILTER (WHERE timestamp_valid) AS ts_valid,
           count(*) FILTER (WHERE quality_status IN ('VALID','CORRECTED')) AS valid,
           count(*) FILTER (WHERE quality_status = 'INVALID') AS invalid
    FROM iot.sensor_readings
    GROUP BY 1, 2
),
dup AS (
    SELECT s.node_id, date_trunc('day', i.observed_at) AS day, count(*) AS duplicates
    FROM data_quality.data_issues i
    JOIN iot.sensors s ON s.sensor_id = i.sensor_id
    WHERE i.issue_type = 'DUPLICATE'
    GROUP BY 1, 2
)
SELECT n.node_code, rd.node_id, rd.day,
       86400 / n.sampling_interval_s AS expected,
       rd.received, rd.ts_valid, rd.valid, rd.invalid, COALESCE(dup.duplicates, 0) AS duplicates,
       round(LEAST(rd.received * 100.0 / (86400 / n.sampling_interval_s), 100), 2) AS success_rate_pct,
       round(rd.ts_valid * 100.0 / NULLIF(rd.received, 0), 2) AS timestamp_valid_pct,
       round((rd.invalid + COALESCE(dup.duplicates, 0)) * 100.0
             / NULLIF(rd.received + COALESCE(dup.duplicates, 0), 0), 2) AS error_duplicate_pct,
       round(GREATEST(1 - rd.valid * 1.0 / (86400 / n.sampling_interval_s), 0) * 100, 2) AS missing_after_qc_pct
FROM rd
JOIN iot.sensor_nodes n ON n.node_id = rd.node_id
LEFT JOIN dup ON dup.node_id = rd.node_id AND dup.day = rd.day;

-- ---------------------------------------------------------------------
-- Bảng tổng hợp tiêu chí nghiệm thu (toàn hệ thống)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW reporting.v_acceptance_summary AS
WITH dc AS (
    SELECT sum(expected) expected, sum(received) received, sum(ts_valid) ts_valid,
           sum(valid) valid, sum(invalid) invalid, sum(duplicates) duplicates
    FROM reporting.v_data_collection_daily
),
ds AS (
    SELECT max(valid_records) AS best_valid FROM dataset.v_version_readiness
),
ml AS (   -- model phân loại/anomaly tốt nhất đang APPROVED/DEPLOYED, nếu không có thì model tốt nhất
    SELECT * FROM ml.v_model_acceptance
    WHERE task_type IN ('CLASSIFICATION','ANOMALY_DETECTION')
    ORDER BY (status IN ('APPROVED','DEPLOYED')) DESC, f1 DESC NULLS LAST LIMIT 1
),
ota AS (
    SELECT sum(succeeded) * 100.0 / NULLIF(sum(finished), 0) AS success_rate,
           max(max_duration_min) AS max_min
    FROM ota.v_ota_kpi
),
v(kpi_code, value) AS (
    SELECT 'DATA_COLLECTION_SUCCESS_PCT', (SELECT round(LEAST(received * 100.0 / NULLIF(expected, 0), 100), 2) FROM dc)
    UNION ALL SELECT 'TIMESTAMP_VALID_PCT',   (SELECT round(ts_valid * 100.0 / NULLIF(received, 0), 2) FROM dc)
    UNION ALL SELECT 'ERROR_DUPLICATE_PCT',   (SELECT round((invalid + duplicates) * 100.0 / NULLIF(received + duplicates, 0), 2) FROM dc)
    UNION ALL SELECT 'MISSING_AFTER_QC_PCT',  (SELECT round(GREATEST(1 - valid * 1.0 / NULLIF(expected, 0), 0) * 100, 2) FROM dc)
    UNION ALL SELECT 'VALID_OBSERVATIONS',    (SELECT best_valid FROM ds)
    UNION ALL SELECT 'ML_ACCURACY_PCT',       (SELECT accuracy * 100 FROM ml)
    UNION ALL SELECT 'ML_PRECISION_PCT',      (SELECT precision * 100 FROM ml)
    UNION ALL SELECT 'ML_RECALL_PCT',         (SELECT recall * 100 FROM ml)
    UNION ALL SELECT 'ML_F1_PCT',             (SELECT f1 * 100 FROM ml)
    UNION ALL SELECT 'ML_INFERENCE_MS',       (SELECT latency_ms_p95 FROM ml)
    UNION ALL SELECT 'OTA_SUCCESS_PCT',       (SELECT round(success_rate, 2) FROM ota)
    UNION ALL SELECT 'OTA_UPDATE_MINUTES',    (SELECT max_min FROM ota)
)
SELECT k.kpi_code, k.name_vi, k.unit, k.comparator, k.target_value, v.value AS current_value,
       CASE WHEN v.value IS NULL THEN NULL
            WHEN k.comparator = 'GTE' THEN v.value >= k.target_value
            ELSE v.value <= k.target_value END AS passed
FROM reporting.kpis k
LEFT JOIN v ON v.kpi_code = k.kpi_code
WHERE k.is_acceptance_criterion
ORDER BY k.domain, k.kpi_code;

-- Lưu snapshot KPI vào kpi_measurements
CREATE OR REPLACE FUNCTION reporting.snapshot_acceptance(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_rows INTEGER;
BEGIN
    INSERT INTO reporting.kpi_measurements (kpi_id, period_start, period_end, measured_value, passed)
    SELECT k.kpi_id, p_from, p_to, s.current_value, s.passed
    FROM reporting.v_acceptance_summary s
    JOIN reporting.kpis k USING (kpi_code);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END;
$$;

-- ---------------------------------------------------------------------
-- Màn hình 01 – Dashboard tổng quan: mỗi ô một dòng
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW reporting.v_dashboard_plots AS
SELECT p.plot_id, p.plot_code, p.soil_type, s.site_code,
       t.treatment_code, t.biochar_dose_kg_m2,
       n.node_code, n.status AS node_status, n.last_seen_at, n.battery_v,
       g.gateway_code, g.status AS gateway_status,
       lr.measured_at AS last_reading_at, lr.ph, lr.ec, lr.soil_moisture, lr.n, lr.p, lr.k,
       sq.sqi_value, sq.health_class, sq.period_start AS sqi_date,
       (SELECT count(*) FROM alert.alerts a WHERE a.plot_id = p.plot_id AND a.status <> 'RESOLVED') AS open_alerts,
       mv.version AS gateway_model_version
FROM farm.plots p
JOIN farm.sites s ON s.site_id = p.site_id
LEFT JOIN LATERAL (
    SELECT ta.treatment_id FROM experiment.treatment_applications ta
    WHERE ta.plot_id = p.plot_id AND ta.effective_to IS NULL
    ORDER BY ta.effective_from DESC LIMIT 1) cur ON true
LEFT JOIN experiment.treatments t ON t.treatment_id = cur.treatment_id
LEFT JOIN iot.sensor_nodes n ON n.plot_id = p.plot_id AND n.status <> 'RETIRED'
LEFT JOIN iot.gateways g ON g.gateway_id = n.gateway_id
LEFT JOIN ml.model_versions mv ON mv.model_version_id = g.current_model_version_id
LEFT JOIN LATERAL (
    SELECT * FROM iot.sensor_readings r
    WHERE r.plot_id = p.plot_id AND r.quality_status IN ('VALID','CORRECTED')
    ORDER BY r.measured_at DESC LIMIT 1) lr ON true
LEFT JOIN LATERAL (
    SELECT * FROM sqi.sqi_scores q WHERE q.plot_id = p.plot_id
    ORDER BY q.period_start DESC LIMIT 1) sq ON true;

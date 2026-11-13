-- =====================================================================
-- 07_laboratory.sql : mẫu đất / dung dịch, phương pháp, kết quả phân tích
-- =====================================================================

CREATE TABLE laboratory.lab_methods (
    method_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    method_code     VARCHAR(32)  NOT NULL UNIQUE,
    parameter_code  VARCHAR(32)  NOT NULL REFERENCES ref.parameters(parameter_code),
    name            VARCHAR(255) NOT NULL,
    standard_ref    VARCHAR(128),                          -- vd: TCVN 5979:2021
    instrument      VARCHAR(128),
    detection_limit NUMERIC,
    quantification_limit NUMERIC,
    unit            VARCHAR(32)  NOT NULL
);

CREATE TABLE laboratory.soil_samples (
    sample_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sample_code     VARCHAR(32)  NOT NULL UNIQUE,
    plot_id         UUID         NOT NULL REFERENCES farm.plots(plot_id),
    sample_type     VARCHAR(16)  NOT NULL DEFAULT 'SOIL'
                    CHECK (sample_type IN ('SOIL','SOIL_SOLUTION','PLANT','BIOCHAR')),
    sampled_at      TIMESTAMPTZ  NOT NULL,                 -- để đồng bộ với dữ liệu cảm biến
    depth_from_cm   NUMERIC(5,1),
    depth_to_cm     NUMERIC(5,1),
    latitude        DECIMAL(9,6),
    longitude       DECIMAL(9,6),
    near_node_id    UUID         REFERENCES iot.sensor_nodes(node_id),   -- node gần nhất (đối chiếu sensor vs lab)
    composite_of    SMALLINT,                              -- số mẫu đơn gộp
    collected_by    UUID         REFERENCES iam.users(user_id),
    received_at     TIMESTAMPTZ,
    status          VARCHAR(16)  NOT NULL DEFAULT 'COLLECTED'
                    CHECK (status IN ('COLLECTED','RECEIVED','ANALYZING','COMPLETED','REJECTED')),
    notes           TEXT,
    CHECK (depth_to_cm IS NULL OR depth_from_cm IS NULL OR depth_to_cm > depth_from_cm)
);

CREATE TABLE laboratory.lab_results (
    lab_result_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sample_id       UUID         NOT NULL REFERENCES laboratory.soil_samples(sample_id) ON DELETE CASCADE,
    parameter_code  VARCHAR(32)  NOT NULL REFERENCES ref.parameters(parameter_code),
    value           NUMERIC      NOT NULL,
    unit            VARCHAR(32)  NOT NULL,
    method_id       UUID         REFERENCES laboratory.lab_methods(method_id),
    replicate_no    SMALLINT     NOT NULL DEFAULT 1,
    below_lod       BOOLEAN      NOT NULL DEFAULT false,
    analyzed_at     TIMESTAMPTZ,
    analyst_id      UUID         REFERENCES iam.users(user_id),
    approved_by     UUID         REFERENCES iam.users(user_id),
    result_status   VARCHAR(16)  NOT NULL DEFAULT 'DRAFT'
                    CHECK (result_status IN ('DRAFT','VERIFIED','APPROVED','REJECTED')),
    UNIQUE (sample_id, parameter_code, replicate_no)
);

CREATE INDEX ix_samples_plot_time   ON laboratory.soil_samples(plot_id, sampled_at);
CREATE INDEX ix_lab_results_sample  ON laboratory.lab_results(sample_id);
CREATE INDEX ix_lab_results_param   ON laboratory.lab_results(parameter_code);

-- ---------------------------------------------------------------------
-- Màn hình 07: đối chiếu cảm biến với phòng thí nghiệm
-- Lấy trung bình sensor hợp lệ trong ±2 giờ quanh thời điểm lấy mẫu.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW laboratory.v_sensor_vs_lab AS
WITH lab AS (
    SELECT s.sample_id, s.sample_code, s.plot_id, s.sampled_at,
           r.parameter_code, avg(r.value) AS lab_value
    FROM laboratory.soil_samples s
    JOIN laboratory.lab_results r ON r.sample_id = s.sample_id
    WHERE r.result_status IN ('VERIFIED','APPROVED')
      AND r.parameter_code IN ('PH','EC','MOISTURE','N','P','K')
    GROUP BY s.sample_id, s.sample_code, s.plot_id, s.sampled_at, r.parameter_code
)
SELECT lab.*,
       sen.sensor_value,
       sen.n_readings,
       sen.sensor_value - lab.lab_value AS diff,
       CASE WHEN lab.lab_value <> 0
            THEN round((sen.sensor_value - lab.lab_value) / abs(lab.lab_value) * 100, 2) END AS diff_pct
FROM lab
LEFT JOIN LATERAL (
    SELECT avg(CASE lab.parameter_code
                 WHEN 'PH' THEN sr.ph WHEN 'EC' THEN sr.ec WHEN 'MOISTURE' THEN sr.soil_moisture
                 WHEN 'N'  THEN sr.n  WHEN 'P'  THEN sr.p  WHEN 'K' THEN sr.k END) AS sensor_value,
           count(*) AS n_readings
    FROM iot.sensor_readings sr
    WHERE sr.plot_id = lab.plot_id
      AND sr.measured_at BETWEEN lab.sampled_at - INTERVAL '2 hours' AND lab.sampled_at + INTERVAL '2 hours'
      AND sr.quality_status IN ('VALID','CORRECTED')
) sen ON true;

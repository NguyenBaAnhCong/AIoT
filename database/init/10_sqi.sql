-- =====================================================================
-- 10_sqi.sql : chỉ số sức khỏe đất (Soil Quality Index)
-- SQI = Σ (weight_i × score_i) / Σ weight_i  (thang 0–1), score_i chuẩn hóa tuyến tính
-- =====================================================================

CREATE TABLE sqi.sqi_definitions (
    definition_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_code    VARCHAR(32)  NOT NULL UNIQUE,          -- vd: SQI-v1.0
    name            VARCHAR(255) NOT NULL,
    method          VARCHAR(32)  NOT NULL DEFAULT 'LINEAR_WEIGHTED'
                    CHECK (method IN ('LINEAR_WEIGHTED','PCA_MDS','NONLINEAR_WEIGHTED','EXPERT')),
    min_indicator_coverage_pct NUMERIC(5,2) NOT NULL DEFAULT 70,   -- tối thiểu % trọng số có dữ liệu
    status          VARCHAR(16)  NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
    valid_from      DATE,
    approved_by     UUID         REFERENCES iam.users(user_id),
    description     TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE sqi.sqi_indicators (
    indicator_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id   UUID         NOT NULL REFERENCES sqi.sqi_definitions(definition_id) ON DELETE CASCADE,
    parameter_code  VARCHAR(32)  NOT NULL REFERENCES ref.parameters(parameter_code),
    source          VARCHAR(8)   NOT NULL DEFAULT 'SENSOR' CHECK (source IN ('SENSOR','LAB')),
    scoring_function VARCHAR(16) NOT NULL
                    CHECK (scoring_function IN ('MORE_IS_BETTER','LESS_IS_BETTER','OPTIMUM')),
    lower_limit     NUMERIC      NOT NULL,                 -- score = 0 tại/ngoài giới hạn
    upper_limit     NUMERIC      NOT NULL,
    optimum_low     NUMERIC,                               -- OPTIMUM: score = 1 trong [low, high]
    optimum_high    NUMERIC,
    UNIQUE (definition_id, parameter_code),
    CHECK (upper_limit > lower_limit),
    CHECK (scoring_function <> 'OPTIMUM'
           OR (optimum_low IS NOT NULL AND optimum_high IS NOT NULL
               AND lower_limit <= optimum_low AND optimum_low <= optimum_high AND optimum_high <= upper_limit))
);

CREATE TABLE sqi.sqi_weights (
    weight_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id   UUID         NOT NULL REFERENCES sqi.sqi_definitions(definition_id) ON DELETE CASCADE,
    indicator_id    UUID         NOT NULL REFERENCES sqi.sqi_indicators(indicator_id) ON DELETE CASCADE,
    weight          NUMERIC(6,4) NOT NULL CHECK (weight > 0 AND weight <= 1),
    weighting_method VARCHAR(16) NOT NULL DEFAULT 'EXPERT'
                    CHECK (weighting_method IN ('EQUAL','PCA','AHP','EXPERT')),
    UNIQUE (definition_id, indicator_id)
);

-- Ngưỡng phân loại sức khỏe đất; class_code trùng dataset.labels.label_code
CREATE TABLE sqi.sqi_classes (
    definition_id   UUID         NOT NULL REFERENCES sqi.sqi_definitions(definition_id) ON DELETE CASCADE,
    class_code      VARCHAR(32)  NOT NULL,
    min_value       NUMERIC(6,4) NOT NULL,                 -- [min, max)
    max_value       NUMERIC(6,4) NOT NULL,
    PRIMARY KEY (definition_id, class_code),
    CHECK (max_value > min_value)
);

CREATE TABLE sqi.sqi_scores (
    sqi_score_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id   UUID         NOT NULL REFERENCES sqi.sqi_definitions(definition_id),
    dataset_version_id UUID      REFERENCES dataset.dataset_versions(dataset_version_id),
    plot_id         UUID         NOT NULL REFERENCES farm.plots(plot_id),
    treatment_id    UUID         REFERENCES experiment.treatments(treatment_id),
    period_start    TIMESTAMPTZ  NOT NULL,
    period_end      TIMESTAMPTZ  NOT NULL,
    sqi_value       NUMERIC(6,4) NOT NULL CHECK (sqi_value BETWEEN 0 AND 1),
    health_class    VARCHAR(32)  NOT NULL,
    coverage_pct    NUMERIC(5,2) NOT NULL,                 -- % trọng số có dữ liệu
    n_observations  INTEGER,
    computed_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (definition_id, plot_id, period_start),
    CHECK (period_end > period_start)
);

-- Điểm từng chỉ tiêu (màn hình 04: xem chi tiết từng chỉ tiêu, trọng số)
CREATE TABLE sqi.sqi_indicator_scores (
    sqi_score_id    UUID         NOT NULL REFERENCES sqi.sqi_scores(sqi_score_id) ON DELETE CASCADE,
    indicator_id    UUID         NOT NULL REFERENCES sqi.sqi_indicators(indicator_id),
    raw_value       NUMERIC,
    score           NUMERIC(6,4),
    weight          NUMERIC(6,4),
    weighted_score  NUMERIC(8,6),
    PRIMARY KEY (sqi_score_id, indicator_id)
);

CREATE INDEX ix_sqi_scores_plot_time ON sqi.sqi_scores(plot_id, period_start);
CREATE INDEX ix_sqi_scores_treatment ON sqi.sqi_scores(treatment_id, period_start);

-- ---------------------------------------------------------------------
-- Chuẩn hóa 1 chỉ tiêu về [0,1]
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sqi.score_indicator(
    p_value NUMERIC, p_function VARCHAR,
    p_lower NUMERIC, p_upper NUMERIC, p_opt_low NUMERIC, p_opt_high NUMERIC
) RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN p_value IS NULL THEN NULL
        WHEN p_function = 'MORE_IS_BETTER' THEN
            LEAST(GREATEST((p_value - p_lower) / (p_upper - p_lower), 0), 1)
        WHEN p_function = 'LESS_IS_BETTER' THEN
            LEAST(GREATEST((p_upper - p_value) / (p_upper - p_lower), 0), 1)
        WHEN p_function = 'OPTIMUM' THEN
            CASE WHEN p_value BETWEEN p_opt_low AND p_opt_high THEN 1
                 WHEN p_value <= p_lower OR p_value >= p_upper THEN 0
                 WHEN p_value < p_opt_low THEN (p_value - p_lower) / NULLIF(p_opt_low - p_lower, 0)
                 ELSE (p_upper - p_value) / NULLIF(p_upper - p_opt_high, 0) END
    END;
$$;

-- ---------------------------------------------------------------------
-- Tính SQI theo ngày cho mọi ô trong 1 dataset version.
-- Đầu vào: dataset.dataset_records hợp lệ (sensor cột + lab_payload).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sqi.calculate_daily(p_definition_id UUID, p_dataset_version_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    v_cov   NUMERIC;
    v_count INTEGER;
BEGIN
    SELECT min_indicator_coverage_pct INTO v_cov
    FROM sqi.sqi_definitions WHERE definition_id = p_definition_id;

    DELETE FROM sqi.sqi_scores
    WHERE definition_id = p_definition_id AND dataset_version_id = p_dataset_version_id;

    DROP TABLE IF EXISTS _sqi_ind;
    CREATE TEMP TABLE _sqi_ind ON COMMIT DROP AS
    WITH feat AS (
        SELECT r.plot_id, date_trunc('day', r.observed_at) AS day, r.treatment_id,
               kv.key AS parameter_code, kv.value::numeric AS value
        FROM dataset.dataset_records r
        CROSS JOIN LATERAL jsonb_each_text(
            jsonb_strip_nulls(jsonb_build_object(
                'PH', r.ph, 'EC', r.ec, 'MOISTURE', r.soil_moisture, 'SOIL_TEMP', r.soil_temperature,
                'N', r.n, 'P', r.p, 'K', r.k))
            || COALESCE(r.lab_payload, '{}'::jsonb)) kv
        WHERE r.dataset_version_id = p_dataset_version_id AND r.valid_flag
    ),
    daily AS (
        SELECT plot_id, day, parameter_code, avg(value) AS value, count(*) AS n,
               (array_agg(treatment_id))[1] AS treatment_id
        FROM feat GROUP BY plot_id, day, parameter_code
    )
    SELECT d.plot_id, d.day, d.treatment_id, d.n, i.indicator_id, d.value,
           sqi.score_indicator(d.value, i.scoring_function, i.lower_limit, i.upper_limit,
                               i.optimum_low, i.optimum_high) AS score,
           w.weight
    FROM daily d
    JOIN sqi.sqi_indicators i ON i.definition_id = p_definition_id AND i.parameter_code = d.parameter_code
    JOIN sqi.sqi_weights w    ON w.indicator_id = i.indicator_id;

    WITH agg AS (
        SELECT plot_id, day, max(treatment_id::text)::uuid AS treatment_id, max(n) AS n_obs,
               sum(weight * score) / NULLIF(sum(weight), 0) AS sqi_value,
               sum(weight) * 100 / (SELECT sum(weight) FROM sqi.sqi_weights WHERE definition_id = p_definition_id)
                   AS coverage
        FROM _sqi_ind GROUP BY plot_id, day
    ),
    ins AS (
        INSERT INTO sqi.sqi_scores (definition_id, dataset_version_id, plot_id, treatment_id,
                                    period_start, period_end, sqi_value, health_class, coverage_pct, n_observations)
        SELECT p_definition_id, p_dataset_version_id, a.plot_id, a.treatment_id,
               a.day, a.day + INTERVAL '1 day', round(a.sqi_value, 4),
               COALESCE(c.class_code, 'UNKNOWN'), round(a.coverage, 2), a.n_obs
        FROM agg a
        LEFT JOIN sqi.sqi_classes c ON c.definition_id = p_definition_id
             AND a.sqi_value >= c.min_value AND a.sqi_value < c.max_value
        WHERE a.coverage >= v_cov
        RETURNING sqi_score_id, plot_id, period_start
    )
    INSERT INTO sqi.sqi_indicator_scores (sqi_score_id, indicator_id, raw_value, score, weight, weighted_score)
    SELECT ins.sqi_score_id, t.indicator_id, round(t.value, 4), round(t.score, 4), t.weight,
           round(t.score * t.weight, 6)
    FROM ins JOIN _sqi_ind t ON t.plot_id = ins.plot_id AND t.day = ins.period_start;

    SELECT count(*) INTO v_count FROM sqi.sqi_scores
    WHERE definition_id = p_definition_id AND dataset_version_id = p_dataset_version_id;

    DROP TABLE IF EXISTS _sqi_ind;
    RETURN v_count;
END;
$$;

-- Gán nhãn sức khỏe đất cho dataset_records từ SQI ngày tương ứng
CREATE OR REPLACE FUNCTION sqi.assign_labels(p_definition_id UUID, p_dataset_version_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_rows INTEGER;
BEGIN
    UPDATE dataset.dataset_records r
    SET label_id = l.label_id, label_source = 'SQI_RULE'
    FROM sqi.sqi_scores s
    JOIN dataset.labels l ON l.label_set = 'SOIL_HEALTH' AND l.label_code = s.health_class
    WHERE r.dataset_version_id = p_dataset_version_id
      AND s.definition_id = p_definition_id
      AND s.dataset_version_id = p_dataset_version_id
      AND s.plot_id = r.plot_id
      AND r.observed_at >= s.period_start AND r.observed_at < s.period_end
      AND r.valid_flag
      AND (r.label_source IS NULL OR r.label_source = 'SQI_RULE');   -- không ghi đè nhãn chuyên gia
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    UPDATE dataset.dataset_versions
    SET labeled_count = (SELECT count(*) FROM dataset.dataset_records
                         WHERE dataset_version_id = p_dataset_version_id AND label_id IS NOT NULL)
    WHERE dataset_version_id = p_dataset_version_id;
    RETURN v_rows;
END;
$$;

-- Màn hình 04: so sánh SQI giữa các nghiệm thức
CREATE OR REPLACE VIEW sqi.v_treatment_comparison AS
SELECT d.version_code, t.treatment_code, t.name AS treatment_name, t.biochar_dose_kg_m2, t.control_flag,
       count(*)                       AS n_days,
       round(avg(s.sqi_value), 4)     AS mean_sqi,
       round(stddev_samp(s.sqi_value), 4) AS sd_sqi,
       round(min(s.sqi_value), 4)     AS min_sqi,
       round(max(s.sqi_value), 4)     AS max_sqi,
       mode() WITHIN GROUP (ORDER BY s.health_class) AS dominant_class
FROM sqi.sqi_scores s
JOIN sqi.sqi_definitions d ON d.definition_id = s.definition_id
JOIN experiment.treatments t ON t.treatment_id = s.treatment_id
GROUP BY d.version_code, t.treatment_code, t.name, t.biochar_dose_kg_m2, t.control_flag;

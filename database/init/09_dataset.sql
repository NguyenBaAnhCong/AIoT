-- =====================================================================
-- 09_dataset.sql : dataset tham chiếu, phiên bản, bản ghi chuẩn hóa, nhãn,
-- chia train/val/test có kiểm soát leakage
-- =====================================================================

CREATE TABLE dataset.labels (
    label_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label_set       VARCHAR(32)  NOT NULL DEFAULT 'SOIL_HEALTH',
    label_code      VARCHAR(32)  NOT NULL,                 -- VERY_GOOD, GOOD, FAIR, POOR
    name_vi         VARCHAR(128) NOT NULL,
    class_order     SMALLINT     NOT NULL,
    description     TEXT,
    UNIQUE (label_set, label_code)
);

CREATE TABLE dataset.datasets (
    dataset_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_code    VARCHAR(32)  NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    purpose         VARCHAR(16)  NOT NULL DEFAULT 'REFERENCE'
                    CHECK (purpose IN ('REFERENCE','TRAINING','EVALUATION','FIELD_TEST')),
    site_id         UUID         REFERENCES farm.sites(site_id),
    experiment_id   UUID         REFERENCES experiment.experiments(experiment_id),
    owner_id        UUID         REFERENCES iam.users(user_id),
    min_valid_observations INTEGER NOT NULL DEFAULT 10000,  -- yêu cầu hồ sơ
    description     TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE dataset.dataset_versions (
    dataset_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id      UUID         NOT NULL REFERENCES dataset.datasets(dataset_id),
    version_no      INTEGER      NOT NULL,
    status          VARCHAR(16)  NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','BUILT','FROZEN','DEPRECATED')),
    time_from       TIMESTAMPTZ  NOT NULL,
    time_to         TIMESTAMPTZ  NOT NULL,
    aggregation     VARCHAR(16)  NOT NULL DEFAULT 'RAW' CHECK (aggregation IN ('RAW','HOURLY','DAILY')),
    split_strategy  VARCHAR(16)  NOT NULL DEFAULT 'BY_TIME'
                    CHECK (split_strategy IN ('RANDOM','BY_PLOT','BY_TIME','BY_BLOCK')),
    split_ratio     JSONB        NOT NULL DEFAULT '{"TRAIN":0.7,"VAL":0.15,"TEST":0.15}',
    random_seed     INTEGER      NOT NULL DEFAULT 42,
    record_count    INTEGER,
    valid_count     INTEGER,
    labeled_count   INTEGER,
    checksum        TEXT,                                  -- md5 tập record_id khi FROZEN
    created_by      UUID         REFERENCES iam.users(user_id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    frozen_at       TIMESTAMPTZ,
    notes           TEXT,
    UNIQUE (dataset_id, version_no),
    CHECK (time_to > time_from)
);

-- Bản ghi quan sát đã đồng bộ: thời gian + vị trí + nghiệm thức + loại đất
-- + liều biochar + giai đoạn sinh trưởng + sensor + lab + nhãn
CREATE TABLE dataset.dataset_records (
    record_id       UUID         NOT NULL DEFAULT gen_random_uuid(),
    dataset_version_id UUID      NOT NULL REFERENCES dataset.dataset_versions(dataset_version_id) ON DELETE CASCADE,
    observed_at     TIMESTAMPTZ  NOT NULL,
    site_id         UUID         REFERENCES farm.sites(site_id),
    plot_id         UUID         NOT NULL REFERENCES farm.plots(plot_id),
    treatment_id    UUID         REFERENCES experiment.treatments(treatment_id),
    soil_type       VARCHAR(64),
    biochar_dose_kg_m2 NUMERIC(8,3),
    crop_season_id  UUID         REFERENCES farm.crop_seasons(crop_season_id),
    growth_stage_id UUID         REFERENCES experiment.growth_stages(growth_stage_id),
    -- đặc trưng dùng thường xuyên: cột riêng (không để trong JSONB)
    ph              NUMERIC(5,2),
    ec              NUMERIC(8,3),
    soil_moisture   NUMERIC(5,2),
    soil_temperature NUMERIC(5,2),
    n               NUMERIC(8,2),
    p               NUMERIC(8,2),
    k               NUMERIC(8,2),
    sensor_payload  JSONB,                                 -- chỉ tiêu phụ / thống kê cửa sổ
    lab_payload     JSONB,                                 -- {"OC":1.8,"CEC":12.4,...} kết quả lab gần nhất
    source_reading_ids BIGINT[],
    source_lab_result_ids UUID[],
    label_id        UUID         REFERENCES dataset.labels(label_id),
    label_source    VARCHAR(16)  CHECK (label_source IN ('SQI_RULE','EXPERT','LAB')),
    split           VARCHAR(8)   CHECK (split IN ('TRAIN','VAL','TEST')),
    group_key       VARCHAR(128),                          -- nhóm dùng để chia (chống leakage)
    valid_flag      BOOLEAN      NOT NULL DEFAULT false,
    invalid_reason  VARCHAR(255),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (record_id, observed_at),
    UNIQUE (dataset_version_id, plot_id, observed_at)
) PARTITION BY RANGE (observed_at);

CREATE TABLE dataset.dataset_records_default PARTITION OF dataset.dataset_records DEFAULT;

CREATE INDEX ix_records_plot_time    ON dataset.dataset_records (plot_id, observed_at);
CREATE INDEX ix_records_version      ON dataset.dataset_records (dataset_version_id, split);
CREATE INDEX ix_records_treatment    ON dataset.dataset_records (treatment_id, observed_at);

ALTER TABLE data_quality.data_audit
    ADD CONSTRAINT fk_data_audit_dataset FOREIGN KEY (dataset_id) REFERENCES dataset.datasets(dataset_id);

-- Không cho sửa bản ghi của version đã FROZEN
CREATE OR REPLACE FUNCTION dataset.guard_frozen()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status VARCHAR;
BEGIN
    SELECT status INTO v_status FROM dataset.dataset_versions
    WHERE dataset_version_id = COALESCE(NEW.dataset_version_id, OLD.dataset_version_id);
    IF v_status = 'FROZEN' THEN
        RAISE EXCEPTION 'Dataset version % đã FROZEN, không thể thay đổi',
            COALESCE(NEW.dataset_version_id, OLD.dataset_version_id);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_records_guard_frozen
    BEFORE INSERT OR UPDATE OR DELETE ON dataset.dataset_records
    FOR EACH ROW EXECUTE FUNCTION dataset.guard_frozen();

-- ---------------------------------------------------------------------
-- Xây dựng bản ghi cho 1 dataset version từ sensor (đã QC) + lab + ngữ cảnh thí nghiệm
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dataset.build_version(p_version_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    v  dataset.dataset_versions%ROWTYPE;
    v_bucket TEXT;
    v_rows INTEGER;
    v_train NUMERIC;
    v_val   NUMERIC;
BEGIN
    SELECT * INTO v FROM dataset.dataset_versions WHERE dataset_version_id = p_version_id;
    IF v.dataset_version_id IS NULL THEN
        RAISE EXCEPTION 'Dataset version % không tồn tại', p_version_id;
    END IF;
    IF v.status = 'FROZEN' THEN
        RAISE EXCEPTION 'Dataset version % đã FROZEN', p_version_id;
    END IF;

    DELETE FROM dataset.dataset_records WHERE dataset_version_id = p_version_id;

    v_bucket := CASE v.aggregation WHEN 'HOURLY' THEN 'hour' WHEN 'DAILY' THEN 'day' END;
    v_train  := (v.split_ratio->>'TRAIN')::numeric;
    v_val    := (v.split_ratio->>'VAL')::numeric;

    INSERT INTO dataset.dataset_records (
        dataset_version_id, observed_at, site_id, plot_id, treatment_id, soil_type,
        biochar_dose_kg_m2, crop_season_id, growth_stage_id,
        ph, ec, soil_moisture, soil_temperature, n, p, k,
        sensor_payload, lab_payload, source_reading_ids, source_lab_result_ids,
        group_key, valid_flag, invalid_reason)
    WITH obs AS (
        SELECT sr.plot_id,
               CASE WHEN v_bucket IS NULL THEN sr.measured_at
                    ELSE date_trunc(v_bucket, sr.measured_at) END AS observed_at,
               avg(sr.ph) ph, avg(sr.ec) ec, avg(sr.soil_moisture) soil_moisture,
               avg(sr.soil_temperature) soil_temperature,
               avg(sr.n) n, avg(sr.p) p, avg(sr.k) k,
               count(*) n_readings,
               array_agg(sr.reading_id ORDER BY sr.measured_at) reading_ids
        FROM iot.sensor_readings sr
        WHERE sr.measured_at >= v.time_from AND sr.measured_at < v.time_to
          AND sr.quality_status IN ('VALID','CORRECTED')
        GROUP BY 1, 2
    )
    SELECT p_version_id, o.observed_at, ctx.site_id, o.plot_id, ctx.treatment_id, ctx.soil_type,
           ctx.biochar_dose_kg_m2, ctx.crop_season_id, ctx.growth_stage_id,
           round(o.ph, 2), round(o.ec, 3), round(o.soil_moisture, 2), round(o.soil_temperature, 2),
           round(o.n, 2), round(o.p, 2), round(o.k, 2),
           jsonb_build_object('n_readings', o.n_readings),
           lab.payload, o.reading_ids, lab.ids,
           CASE v.split_strategy
                WHEN 'BY_PLOT'  THEN o.plot_id::text
                WHEN 'BY_BLOCK' THEN COALESCE(pl.block_no::text, o.plot_id::text)
                WHEN 'BY_TIME'  THEN to_char(o.observed_at, 'IYYY-IW')    -- khối theo tuần
                ELSE gen_random_uuid()::text END,
           (o.ph IS NOT NULL AND o.ec IS NOT NULL AND o.soil_moisture IS NOT NULL
            AND o.n IS NOT NULL AND o.p IS NOT NULL AND o.k IS NOT NULL AND ctx.treatment_id IS NOT NULL),
           CASE WHEN ctx.treatment_id IS NULL THEN 'Không xác định nghiệm thức'
                WHEN o.ph IS NULL OR o.ec IS NULL OR o.soil_moisture IS NULL
                  OR o.n IS NULL OR o.p IS NULL OR o.k IS NULL THEN 'Thiếu chỉ tiêu cảm biến' END
    FROM obs o
    JOIN farm.plots pl ON pl.plot_id = o.plot_id
    CROSS JOIN LATERAL experiment.plot_context_at(o.plot_id, o.observed_at) ctx
    LEFT JOIN LATERAL (   -- kết quả lab gần nhất trong ±7 ngày
        SELECT jsonb_object_agg(x.parameter_code, x.value) AS payload,
               array_agg(x.lab_result_id) AS ids
        FROM (
            SELECT DISTINCT ON (r.parameter_code) r.parameter_code, r.value, r.lab_result_id
            FROM laboratory.soil_samples s
            JOIN laboratory.lab_results r ON r.sample_id = s.sample_id
            WHERE s.plot_id = o.plot_id
              AND r.result_status IN ('VERIFIED','APPROVED')
              AND s.sampled_at BETWEEN o.observed_at - INTERVAL '7 days' AND o.observed_at + INTERVAL '7 days'
            ORDER BY r.parameter_code, abs(EXTRACT(EPOCH FROM s.sampled_at - o.observed_at))
        ) x
    ) lab ON true;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    -- Chia tập theo group_key (cả nhóm vào cùng 1 tập => không leakage giữa các tập).
    -- BY_TIME: các tuần đầu -> TRAIN, kế tiếp -> VAL, cuối -> TEST (không nhìn tương lai).
    IF v.split_strategy = 'BY_TIME' THEN
        UPDATE dataset.dataset_records r
        SET split = CASE WHEN g.pos <= v_train THEN 'TRAIN'
                         WHEN g.pos <= v_train + v_val THEN 'VAL' ELSE 'TEST' END
        FROM (
            SELECT group_key, cume_dist() OVER (ORDER BY group_key) AS pos
            FROM (SELECT DISTINCT group_key FROM dataset.dataset_records
                  WHERE dataset_version_id = p_version_id) k
        ) g
        WHERE r.dataset_version_id = p_version_id AND r.group_key = g.group_key;
    ELSE
        UPDATE dataset.dataset_records r
        SET split = CASE WHEN h.u < v_train THEN 'TRAIN'
                         WHEN h.u < v_train + v_val THEN 'VAL' ELSE 'TEST' END
        FROM (
            SELECT group_key,
                   ((hashtext(group_key || ':' || v.random_seed)::bigint + 2147483648) % 10000) / 10000.0 AS u
            FROM (SELECT DISTINCT group_key FROM dataset.dataset_records
                  WHERE dataset_version_id = p_version_id) k
        ) h
        WHERE r.dataset_version_id = p_version_id AND r.group_key = h.group_key;
    END IF;

    UPDATE dataset.dataset_versions dv
    SET status = 'BUILT',
        record_count = s.total, valid_count = s.valid, labeled_count = s.labeled
    FROM (
        SELECT count(*) total,
               count(*) FILTER (WHERE valid_flag) valid,
               count(*) FILTER (WHERE label_id IS NOT NULL) labeled
        FROM dataset.dataset_records WHERE dataset_version_id = p_version_id
    ) s
    WHERE dv.dataset_version_id = p_version_id;

    INSERT INTO data_quality.data_audit (dataset_id, source_table, record_id, action, reason, new_value)
    VALUES (v.dataset_id, 'dataset.dataset_versions', p_version_id::text, 'CREATE',
            'build_version', jsonb_build_object('records', v_rows));

    RETURN v_rows;
END;
$$;

-- Đóng băng version: kiểm tra đủ quan sát hợp lệ, tính checksum
CREATE OR REPLACE FUNCTION dataset.freeze_version(p_version_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_min   INTEGER;
    v_valid INTEGER;
    v_sum   TEXT;
BEGIN
    SELECT d.min_valid_observations, dv.valid_count INTO v_min, v_valid
    FROM dataset.dataset_versions dv JOIN dataset.datasets d USING (dataset_id)
    WHERE dv.dataset_version_id = p_version_id;

    IF COALESCE(v_valid, 0) < v_min THEN
        RAISE EXCEPTION 'Chưa đủ quan sát hợp lệ: % / % yêu cầu', COALESCE(v_valid, 0), v_min;
    END IF;

    SELECT md5(string_agg(record_id::text, ',' ORDER BY record_id)) INTO v_sum
    FROM dataset.dataset_records WHERE dataset_version_id = p_version_id;

    UPDATE dataset.dataset_versions
    SET status = 'FROZEN', frozen_at = now(), checksum = v_sum,
        labeled_count = (SELECT count(*) FROM dataset.dataset_records
                         WHERE dataset_version_id = p_version_id AND label_id IS NOT NULL)
    WHERE dataset_version_id = p_version_id;
    RETURN v_sum;
END;
$$;

-- ---------------------------------------------------------------------
-- Màn hình 09: mức sẵn sàng của dataset version + kiểm tra leakage
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW dataset.v_version_readiness AS
SELECT dv.dataset_version_id, d.dataset_code, dv.version_no, dv.status, dv.split_strategy,
       count(r.record_id)                                   AS records,
       count(r.record_id) FILTER (WHERE r.valid_flag)       AS valid_records,
       count(r.record_id) FILTER (WHERE r.label_id IS NOT NULL) AS labeled_records,
       count(r.record_id) FILTER (WHERE r.split = 'TRAIN')  AS train,
       count(r.record_id) FILTER (WHERE r.split = 'VAL')    AS val,
       count(r.record_id) FILTER (WHERE r.split = 'TEST')   AS test,
       d.min_valid_observations,
       count(r.record_id) FILTER (WHERE r.valid_flag) >= d.min_valid_observations AS meets_min_observations,
       (SELECT count(*) FROM (
            SELECT group_key FROM dataset.dataset_records x
            WHERE x.dataset_version_id = dv.dataset_version_id
            GROUP BY group_key HAVING count(DISTINCT split) > 1) z) AS leaking_groups
FROM dataset.dataset_versions dv
JOIN dataset.datasets d USING (dataset_id)
LEFT JOIN dataset.dataset_records r ON r.dataset_version_id = dv.dataset_version_id
GROUP BY dv.dataset_version_id, d.dataset_code, dv.version_no, dv.status, dv.split_strategy,
         d.min_valid_observations;

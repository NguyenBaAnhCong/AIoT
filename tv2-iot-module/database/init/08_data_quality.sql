-- =====================================================================
-- 08_data_quality.sql : luật QC, phiên kiểm tra, lỗi dữ liệu, audit lineage
-- + hàm nạp dữ liệu cảm biến và hàm chạy QC
-- =====================================================================

CREATE TABLE data_quality.quality_rules (
    rule_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_code       VARCHAR(32)  NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    target          VARCHAR(32)  NOT NULL DEFAULT 'SENSOR_READING'
                    CHECK (target IN ('SENSOR_READING','LAB_RESULT','DATASET_RECORD')),
    rule_type       VARCHAR(32)  NOT NULL
                    CHECK (rule_type IN ('RANGE','RATE_OF_CHANGE','FLATLINE','TIMESTAMP','DUPLICATE','MISSING','CROSS_CHECK')),
    parameter_code  VARCHAR(32)  REFERENCES ref.parameters(parameter_code),
    min_value       NUMERIC,
    max_value       NUMERIC,
    max_delta       NUMERIC,                               -- RATE_OF_CHANGE: chênh lệch tối đa giữa 2 lần đo liên tiếp
    window_minutes  INTEGER,                               -- FLATLINE / MISSING
    severity        VARCHAR(8)   NOT NULL DEFAULT 'ERROR' CHECK (severity IN ('WARN','ERROR')),
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    description     TEXT,
    CHECK (rule_type <> 'RANGE' OR (parameter_code IS NOT NULL AND min_value IS NOT NULL AND max_value IS NOT NULL)),
    CHECK (rule_type <> 'RATE_OF_CHANGE' OR (parameter_code IS NOT NULL AND max_delta IS NOT NULL))
);

-- Một lần chạy QC trên một khoảng thời gian
CREATE TABLE data_quality.quality_checks (
    check_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target          VARCHAR(32)  NOT NULL DEFAULT 'SENSOR_READING',
    scope_from      TIMESTAMPTZ  NOT NULL,
    scope_to        TIMESTAMPTZ  NOT NULL,
    started_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    records_checked INTEGER      NOT NULL DEFAULT 0,
    records_valid   INTEGER      NOT NULL DEFAULT 0,
    records_suspect INTEGER      NOT NULL DEFAULT 0,
    records_invalid INTEGER      NOT NULL DEFAULT 0,
    pass_rate_pct   NUMERIC(6,2) GENERATED ALWAYS AS
                    (CASE WHEN records_checked > 0 THEN round(records_valid * 100.0 / records_checked, 2) END) STORED,
    triggered_by    UUID         REFERENCES iam.users(user_id),
    status          VARCHAR(16)  NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','DONE','FAILED')),
    CHECK (scope_to > scope_from)
);

CREATE TABLE data_quality.data_issues (
    issue_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    check_id        UUID         REFERENCES data_quality.quality_checks(check_id),
    rule_id         UUID         REFERENCES data_quality.quality_rules(rule_id),
    issue_type      VARCHAR(32)  NOT NULL
                    CHECK (issue_type IN ('OUT_OF_RANGE','SPIKE','FLATLINE','MISSING','DUPLICATE',
                                          'INVALID_TIMESTAMP','SENSOR_FAULT','LAB_MISMATCH','OTHER')),
    source_table    VARCHAR(64)  NOT NULL,                 -- 'iot.sensor_readings'
    source_record_id VARCHAR(64),
    sensor_id       UUID         REFERENCES iot.sensors(sensor_id),
    plot_id         UUID         REFERENCES farm.plots(plot_id),
    observed_at     TIMESTAMPTZ,
    parameter_code  VARCHAR(32),
    observed_value  NUMERIC,
    details         JSONB,
    severity        VARCHAR(8)   NOT NULL DEFAULT 'ERROR' CHECK (severity IN ('WARN','ERROR')),
    status          VARCHAR(16)  NOT NULL DEFAULT 'OPEN'
                    CHECK (status IN ('OPEN','CONFIRMED','CORRECTED','IGNORED')),
    detected_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    resolved_by     UUID         REFERENCES iam.users(user_id),
    resolved_at     TIMESTAMPTZ
);

-- Lineage: mọi thao tác làm sạch / loại bỏ / sửa bản ghi trước khi vào SQI/ML
CREATE TABLE data_quality.data_audit (
    audit_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dataset_id      UUID,                                  -- FK thêm ở 09_dataset.sql
    source_table    VARCHAR(64)  NOT NULL,
    record_id       VARCHAR(64)  NOT NULL,
    action          VARCHAR(16)  NOT NULL CHECK (action IN ('CREATE','UPDATE','REJECT','CLEAN','RESTORE')),
    reason          TEXT,
    old_value       JSONB,
    new_value       JSONB,
    actor_id        UUID,                                  -- user hoặc NULL = hệ thống
    actor_type      VARCHAR(16)  NOT NULL DEFAULT 'SYSTEM' CHECK (actor_type IN ('USER','SYSTEM','GATEWAY')),
    occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ix_issues_time     ON data_quality.data_issues(observed_at);
CREATE INDEX ix_issues_status   ON data_quality.data_issues(status, issue_type);
CREATE INDEX ix_issues_sensor   ON data_quality.data_issues(sensor_id, observed_at);
CREATE INDEX ix_data_audit_rec  ON data_quality.data_audit(source_table, record_id);
CREATE INDEX ix_data_audit_ds   ON data_quality.data_audit(dataset_id, occurred_at);

-- ---------------------------------------------------------------------
-- Ánh xạ mã chỉ tiêu -> cột trong iot.sensor_readings
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION iot.reading_column(p_parameter_code VARCHAR)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_parameter_code
        WHEN 'PH'        THEN 'ph'
        WHEN 'EC'        THEN 'ec'
        WHEN 'MOISTURE'  THEN 'soil_moisture'
        WHEN 'SOIL_TEMP' THEN 'soil_temperature'
        WHEN 'N'         THEN 'n'
        WHEN 'P'         THEN 'p'
        WHEN 'K'         THEN 'k'
    END;
$$;

-- ---------------------------------------------------------------------
-- Nạp 1 bản tin từ Edge Gateway.
-- p_raw: {"PH":6.1,"EC":0.42,"MOISTURE":31.5,"SOIL_TEMP":27.1,"N":45,"P":18,"K":120}
-- Áp dụng hệ số hiệu chuẩn, chống trùng; bản tin trùng được ghi vào data_issues.
-- Trả về reading_id, hoặc NULL nếu trùng.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION iot.ingest_reading(
    p_sensor_id   UUID,
    p_measured_at TIMESTAMPTZ,
    p_raw         JSONB,
    p_seq_no      BIGINT DEFAULT NULL,
    p_battery_v   NUMERIC DEFAULT NULL,
    p_rssi_dbm    SMALLINT DEFAULT NULL,
    p_snr_db      NUMERIC DEFAULT NULL,
    p_received_at TIMESTAMPTZ DEFAULT now()
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
    v_node    iot.sensor_nodes%ROWTYPE;
    v_id      BIGINT;
    v_has_cal BOOLEAN;
BEGIN
    SELECT n.* INTO v_node
    FROM iot.sensors s JOIN iot.sensor_nodes n ON n.node_id = s.node_id
    WHERE s.sensor_id = p_sensor_id;
    IF v_node.node_id IS NULL THEN
        RAISE EXCEPTION 'Sensor % không tồn tại', p_sensor_id;
    END IF;

    SELECT EXISTS (SELECT 1 FROM calibration.calibration_results
                   WHERE sensor_id = p_sensor_id AND passed
                     AND valid_from <= p_measured_at
                     AND (valid_to IS NULL OR valid_to > p_measured_at))
      INTO v_has_cal;

    INSERT INTO iot.sensor_readings (
        sensor_id, node_id, gateway_id, plot_id, measured_at, received_at, seq_no,
        ph, ec, soil_moisture, soil_temperature, n, p, k,
        battery_v, rssi_dbm, snr_db, raw_payload, calibration_applied)
    VALUES (
        p_sensor_id, v_node.node_id, v_node.gateway_id, v_node.plot_id, p_measured_at, p_received_at, p_seq_no,
        calibration.apply(p_sensor_id, 'PH',        (p_raw->>'PH')::numeric,        p_measured_at),
        calibration.apply(p_sensor_id, 'EC',        (p_raw->>'EC')::numeric,        p_measured_at),
        calibration.apply(p_sensor_id, 'MOISTURE',  (p_raw->>'MOISTURE')::numeric,  p_measured_at),
        calibration.apply(p_sensor_id, 'SOIL_TEMP', (p_raw->>'SOIL_TEMP')::numeric, p_measured_at),
        calibration.apply(p_sensor_id, 'N',         (p_raw->>'N')::numeric,         p_measured_at),
        calibration.apply(p_sensor_id, 'P',         (p_raw->>'P')::numeric,         p_measured_at),
        calibration.apply(p_sensor_id, 'K',         (p_raw->>'K')::numeric,         p_measured_at),
        p_battery_v, p_rssi_dbm, p_snr_db, p_raw, v_has_cal)
    ON CONFLICT (sensor_id, measured_at) DO NOTHING
    RETURNING reading_id INTO v_id;

    IF v_id IS NULL THEN
        INSERT INTO data_quality.data_issues
            (issue_type, source_table, sensor_id, plot_id, observed_at, details, severity)
        VALUES ('DUPLICATE', 'iot.sensor_readings', p_sensor_id, v_node.plot_id, p_measured_at,
                jsonb_build_object('seq_no', p_seq_no, 'payload', p_raw), 'WARN');
    END IF;

    UPDATE iot.sensor_nodes
    SET last_seen_at = GREATEST(COALESCE(last_seen_at, p_received_at), p_received_at),
        battery_v    = COALESCE(p_battery_v, battery_v)
    WHERE node_id = v_node.node_id;

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------
-- Chạy QC cho dữ liệu cảm biến trong [p_from, p_to):
--   1. timestamp hợp lệ (không ở tương lai, không trễ quá p_max_delay)
--   2. RANGE / RATE_OF_CHANGE theo quality_rules
--   3. gán quality_status: INVALID (vi phạm ERROR), SUSPECT (WARN), VALID
-- Bản ghi đã CORRECTED (sửa tay) không bị ghi đè.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION data_quality.run_sensor_checks(
    p_from TIMESTAMPTZ,
    p_to   TIMESTAMPTZ,
    p_max_delay INTERVAL DEFAULT INTERVAL '7 days',
    p_user UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    v_check UUID;
    r       RECORD;
    v_col   TEXT;
BEGIN
    INSERT INTO data_quality.quality_checks (scope_from, scope_to, triggered_by)
    VALUES (p_from, p_to, p_user) RETURNING check_id INTO v_check;

    -- reset cờ của lần chạy trước trong phạm vi
    UPDATE iot.sensor_readings
    SET quality_flags = '{}'
    WHERE measured_at >= p_from AND measured_at < p_to AND quality_status <> 'CORRECTED';

    -- 1. timestamp
    UPDATE iot.sensor_readings
    SET timestamp_valid = (measured_at <= received_at + INTERVAL '5 minutes'
                           AND measured_at >= received_at - p_max_delay),
        quality_flags = CASE WHEN measured_at <= received_at + INTERVAL '5 minutes'
                                  AND measured_at >= received_at - p_max_delay
                             THEN quality_flags ELSE array_append(quality_flags, 'TS_INVALID') END
    WHERE measured_at >= p_from AND measured_at < p_to AND quality_status <> 'CORRECTED';

    INSERT INTO data_quality.data_issues
        (check_id, issue_type, source_table, source_record_id, sensor_id, plot_id, observed_at, details, severity)
    SELECT v_check, 'INVALID_TIMESTAMP', 'iot.sensor_readings', reading_id::text, sensor_id, plot_id, measured_at,
           jsonb_build_object('received_at', received_at), 'ERROR'
    FROM iot.sensor_readings
    WHERE measured_at >= p_from AND measured_at < p_to AND timestamp_valid = false;

    -- 2. RANGE
    FOR r IN SELECT * FROM data_quality.quality_rules
             WHERE is_active AND target = 'SENSOR_READING' AND rule_type = 'RANGE' LOOP
        v_col := iot.reading_column(r.parameter_code);
        CONTINUE WHEN v_col IS NULL;
        EXECUTE format($q$
            WITH bad AS (
                UPDATE iot.sensor_readings
                SET quality_flags = array_append(quality_flags, %L)
                WHERE measured_at >= $1 AND measured_at < $2
                  AND quality_status <> 'CORRECTED'
                  AND %I IS NOT NULL AND (%I < $3 OR %I > $4)
                RETURNING reading_id, sensor_id, plot_id, measured_at, %I AS v
            )
            INSERT INTO data_quality.data_issues
                (check_id, rule_id, issue_type, source_table, source_record_id, sensor_id, plot_id,
                 observed_at, parameter_code, observed_value, severity, details)
            SELECT $5, $6, 'OUT_OF_RANGE', 'iot.sensor_readings', reading_id::text, sensor_id, plot_id,
                   measured_at, %L, v, %L, jsonb_build_object('min', $3, 'max', $4)
            FROM bad $q$,
            r.rule_code, v_col, v_col, v_col, v_col, r.parameter_code, r.severity)
        USING p_from, p_to, r.min_value, r.max_value, v_check, r.rule_id;
    END LOOP;

    -- 2b. RATE_OF_CHANGE (spike) so với lần đo trước của cùng sensor
    FOR r IN SELECT * FROM data_quality.quality_rules
             WHERE is_active AND target = 'SENSOR_READING' AND rule_type = 'RATE_OF_CHANGE' LOOP
        v_col := iot.reading_column(r.parameter_code);
        CONTINUE WHEN v_col IS NULL;
        EXECUTE format($q$
            WITH d AS (
                SELECT reading_id, measured_at, sensor_id, plot_id, %I AS v,
                       %I - lag(%I) OVER (PARTITION BY sensor_id ORDER BY measured_at) AS delta
                FROM iot.sensor_readings
                WHERE measured_at >= $1 - INTERVAL '1 day' AND measured_at < $2
            ),
            bad AS (
                UPDATE iot.sensor_readings sr
                SET quality_flags = array_append(sr.quality_flags, %L)
                FROM d
                WHERE sr.reading_id = d.reading_id AND sr.measured_at = d.measured_at
                  AND d.measured_at >= $1 AND abs(d.delta) > $3
                  AND sr.quality_status <> 'CORRECTED'
                RETURNING d.reading_id, d.sensor_id, d.plot_id, d.measured_at, d.v, d.delta
            )
            INSERT INTO data_quality.data_issues
                (check_id, rule_id, issue_type, source_table, source_record_id, sensor_id, plot_id,
                 observed_at, parameter_code, observed_value, severity, details)
            SELECT $4, $5, 'SPIKE', 'iot.sensor_readings', reading_id::text, sensor_id, plot_id,
                   measured_at, %L, v, %L, jsonb_build_object('delta', delta, 'max_delta', $3)
            FROM bad $q$,
            v_col, v_col, v_col, r.rule_code, r.parameter_code, r.severity)
        USING p_from, p_to, r.max_delta, v_check, r.rule_id;
    END LOOP;

    -- 3. gán trạng thái
    UPDATE iot.sensor_readings sr
    SET quality_status = CASE
            WHEN 'TS_INVALID' = ANY(sr.quality_flags) THEN 'INVALID'
            WHEN EXISTS (SELECT 1 FROM data_quality.quality_rules q
                         WHERE q.rule_code = ANY(sr.quality_flags) AND q.severity = 'ERROR') THEN 'INVALID'
            WHEN cardinality(sr.quality_flags) > 0 THEN 'SUSPECT'
            ELSE 'VALID' END
    WHERE sr.measured_at >= p_from AND sr.measured_at < p_to AND sr.quality_status <> 'CORRECTED';

    -- lineage cho bản ghi bị loại
    INSERT INTO data_quality.data_audit (source_table, record_id, action, reason, new_value)
    SELECT 'iot.sensor_readings', reading_id::text, 'REJECT',
           'QC check ' || v_check, jsonb_build_object('flags', quality_flags)
    FROM iot.sensor_readings
    WHERE measured_at >= p_from AND measured_at < p_to AND quality_status = 'INVALID';

    UPDATE data_quality.quality_checks c
    SET finished_at = now(), status = 'DONE',
        records_checked = s.total, records_valid = s.valid,
        records_suspect = s.suspect, records_invalid = s.invalid
    FROM (
        SELECT count(*) AS total,
               count(*) FILTER (WHERE quality_status IN ('VALID','CORRECTED')) AS valid,
               count(*) FILTER (WHERE quality_status = 'SUSPECT') AS suspect,
               count(*) FILTER (WHERE quality_status = 'INVALID') AS invalid
        FROM iot.sensor_readings
        WHERE measured_at >= p_from AND measured_at < p_to
    ) s
    WHERE c.check_id = v_check;

    RETURN v_check;
END;
$$;

-- =====================================================================
-- 06_calibration.sql : hiệu chuẩn cảm biến, thiết bị tham chiếu,
-- sai số, độ trôi, độ lặp lại
-- =====================================================================

CREATE TABLE calibration.reference_devices (
    reference_device_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_code     VARCHAR(32)  NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,                 -- vd: Máy đo pH để bàn, máy đo EC chuẩn
    manufacturer    VARCHAR(128),
    model           VARCHAR(128),
    parameters      VARCHAR(32)[] NOT NULL,
    certificate_no  VARCHAR(64),
    certified_until DATE
);

CREATE TABLE calibration.calibration_sessions (
    session_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sensor_id       UUID         NOT NULL REFERENCES iot.sensors(sensor_id),
    reference_device_id UUID     REFERENCES calibration.reference_devices(reference_device_id),
    session_type    VARCHAR(16)  NOT NULL DEFAULT 'LAB'
                    CHECK (session_type IN ('LAB','FIELD','DRIFT_CHECK','REPEATABILITY')),
    performed_at    TIMESTAMPTZ  NOT NULL,
    performed_by    UUID         REFERENCES iam.users(user_id),
    ambient_temp_c  NUMERIC(5,2),
    notes           TEXT
);

CREATE TABLE calibration.calibration_points (
    point_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID         NOT NULL REFERENCES calibration.calibration_sessions(session_id) ON DELETE CASCADE,
    parameter_code  VARCHAR(32)  NOT NULL REFERENCES ref.parameters(parameter_code),
    reference_value NUMERIC      NOT NULL,                 -- giá trị chuẩn
    sensor_value    NUMERIC      NOT NULL,                 -- giá trị cảm biến đọc
    replicate_no    SMALLINT     NOT NULL DEFAULT 1,
    measured_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Kết quả hiệu chuẩn: corrected = slope * raw + intercept
CREATE TABLE calibration.calibration_results (
    calibration_result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID         NOT NULL REFERENCES calibration.calibration_sessions(session_id),
    sensor_id       UUID         NOT NULL REFERENCES iot.sensors(sensor_id),
    parameter_code  VARCHAR(32)  NOT NULL REFERENCES ref.parameters(parameter_code),
    n_points        INTEGER      NOT NULL,
    slope           NUMERIC      NOT NULL,
    intercept       NUMERIC      NOT NULL,
    r2              NUMERIC(6,5),
    rmse            NUMERIC,
    mae             NUMERIC,
    max_abs_error   NUMERIC,
    bias            NUMERIC,                               -- sai số hệ thống trung bình
    repeatability_cv_pct NUMERIC(7,3),                     -- độ lặp lại (CV%)
    drift_per_day   NUMERIC,                               -- độ trôi so với lần hiệu chuẩn trước
    tolerance       NUMERIC,                               -- sai số cho phép
    passed          BOOLEAN      NOT NULL,
    valid_from      TIMESTAMPTZ  NOT NULL,
    valid_to        TIMESTAMPTZ,
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE INDEX ix_cal_sessions_sensor ON calibration.calibration_sessions(sensor_id, performed_at);
CREATE INDEX ix_cal_points_session  ON calibration.calibration_points(session_id, parameter_code);
CREATE UNIQUE INDEX ux_cal_results_active
    ON calibration.calibration_results(sensor_id, parameter_code) WHERE is_active;

-- ---------------------------------------------------------------------
-- Tính kết quả hiệu chuẩn (hồi quy tuyến tính reference ~ sensor) cho một phiên.
-- Hệ số cũ của cùng sensor/chỉ tiêu bị vô hiệu, độ trôi tính so với bias cũ.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calibration.compute_results(
    p_session_id UUID,
    p_tolerance  JSONB DEFAULT '{"PH":0.2,"EC":0.1,"MOISTURE":3,"N":20,"P":20,"K":20,"SOIL_TEMP":0.5}'
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    r       RECORD;
    v_prev  calibration.calibration_results%ROWTYPE;
    v_tol   NUMERIC;
    v_count INTEGER := 0;
    v_sensor UUID;
    v_at    TIMESTAMPTZ;
BEGIN
    SELECT sensor_id, performed_at INTO v_sensor, v_at
    FROM calibration.calibration_sessions WHERE session_id = p_session_id;
    IF v_sensor IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy phiên hiệu chuẩn %', p_session_id;
    END IF;

    FOR r IN
        WITH fit AS (
            SELECT parameter_code,
                   count(*)                                   AS n,
                   regr_slope(reference_value, sensor_value)  AS slope,
                   regr_intercept(reference_value, sensor_value) AS intercept,
                   regr_r2(reference_value, sensor_value)     AS r2,
                   avg(sensor_value - reference_value)        AS bias
            FROM calibration.calibration_points
            WHERE session_id = p_session_id
            GROUP BY parameter_code
            HAVING count(*) >= 2
        ),
        err AS (
            SELECT p.parameter_code,
                   sqrt(avg(power(f.slope * p.sensor_value + f.intercept - p.reference_value, 2))) AS rmse,
                   avg(abs(f.slope * p.sensor_value + f.intercept - p.reference_value))           AS mae,
                   max(abs(f.slope * p.sensor_value + f.intercept - p.reference_value))           AS max_err
            FROM calibration.calibration_points p
            JOIN fit f USING (parameter_code)
            WHERE p.session_id = p_session_id
            GROUP BY p.parameter_code
        ),
        rep AS (   -- CV% của các lần lặp tại cùng điểm chuẩn
            SELECT parameter_code, avg(cv) AS cv
            FROM (
                SELECT parameter_code, reference_value,
                       stddev_samp(sensor_value) / NULLIF(abs(avg(sensor_value)), 0) * 100 AS cv
                FROM calibration.calibration_points
                WHERE session_id = p_session_id
                GROUP BY parameter_code, reference_value
                HAVING count(*) > 1
            ) x GROUP BY parameter_code
        )
        SELECT f.*, e.rmse, e.mae, e.max_err, rep.cv
        FROM fit f JOIN err e USING (parameter_code)
        LEFT JOIN rep USING (parameter_code)
    LOOP
        SELECT * INTO v_prev FROM calibration.calibration_results
        WHERE sensor_id = v_sensor AND parameter_code = r.parameter_code AND is_active;

        UPDATE calibration.calibration_results
        SET is_active = false, valid_to = v_at
        WHERE sensor_id = v_sensor AND parameter_code = r.parameter_code AND is_active;

        v_tol := (p_tolerance ->> r.parameter_code)::numeric;

        INSERT INTO calibration.calibration_results (
            session_id, sensor_id, parameter_code, n_points, slope, intercept, r2,
            rmse, mae, max_abs_error, bias, repeatability_cv_pct, drift_per_day,
            tolerance, passed, valid_from)
        VALUES (
            p_session_id, v_sensor, r.parameter_code, r.n, r.slope, r.intercept, r.r2,
            r.rmse, r.mae, r.max_err, r.bias, r.cv,
            CASE WHEN v_prev.calibration_result_id IS NOT NULL
                 THEN (r.bias - v_prev.bias)
                      / GREATEST(EXTRACT(EPOCH FROM v_at - v_prev.valid_from) / 86400, 1)
            END,
            v_tol,
            COALESCE(r.rmse <= v_tol, r.r2 >= 0.95),
            v_at);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$;

-- Áp dụng hệ số hiệu chuẩn đang hiệu lực tại thời điểm đo
CREATE OR REPLACE FUNCTION calibration.apply(
    p_sensor_id UUID, p_parameter_code VARCHAR, p_raw NUMERIC, p_at TIMESTAMPTZ
) RETURNS NUMERIC LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        (SELECT round(r.slope * p_raw + r.intercept, 3)
         FROM calibration.calibration_results r
         WHERE r.sensor_id = p_sensor_id
           AND r.parameter_code = p_parameter_code
           AND r.passed
           AND r.valid_from <= p_at
           AND (r.valid_to IS NULL OR r.valid_to > p_at)
         ORDER BY r.valid_from DESC LIMIT 1),
        p_raw);
$$;

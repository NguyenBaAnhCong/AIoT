-- =====================================================================
-- 13_alert.sql : luật cảnh báo, cảnh báo, khuyến nghị
-- (bảng recommendations đặt trong schema alert theo danh sách bảng của tài liệu)
-- =====================================================================

CREATE TABLE alert.alert_rules (
    rule_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_code       VARCHAR(32)  NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    source          VARCHAR(16)  NOT NULL CHECK (source IN ('SENSOR','SQI','ML','DEVICE','DATA_QUALITY')),
    parameter_code  VARCHAR(32)  REFERENCES ref.parameters(parameter_code),
    condition       VARCHAR(16)  NOT NULL
                    CHECK (condition IN ('LT','GT','OUTSIDE','CLASS_IN','ANOMALY','OFFLINE')),
    threshold_low   NUMERIC,
    threshold_high  NUMERIC,
    class_values    VARCHAR(32)[],                         -- CLASS_IN: {'POOR'}
    window_minutes  INTEGER      NOT NULL DEFAULT 60,      -- đánh giá trung bình trong cửa sổ
    cooldown_minutes INTEGER     NOT NULL DEFAULT 360,     -- không tạo cảnh báo trùng trong khoảng này
    severity        VARCHAR(8)   NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    plot_id         UUID         REFERENCES farm.plots(plot_id),   -- NULL = áp dụng mọi ô
    recommendation_category VARCHAR(32),
    recommendation_template TEXT,                          -- có thể dùng {value}, {plot}
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    created_by      UUID         REFERENCES iam.users(user_id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (condition <> 'LT'      OR threshold_low  IS NOT NULL),
    CHECK (condition <> 'GT'      OR threshold_high IS NOT NULL),
    CHECK (condition <> 'OUTSIDE' OR (threshold_low IS NOT NULL AND threshold_high IS NOT NULL)),
    CHECK (condition <> 'CLASS_IN' OR class_values IS NOT NULL)
);

CREATE TABLE alert.alerts (
    alert_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plot_id         UUID         REFERENCES farm.plots(plot_id),
    node_id         UUID         REFERENCES iot.sensor_nodes(node_id),
    rule_id         UUID         REFERENCES alert.alert_rules(rule_id),
    severity        VARCHAR(8)   NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    source          VARCHAR(16)  NOT NULL CHECK (source IN ('SENSOR','SQI','ML','DEVICE','DATA_QUALITY')),
    parameter_code  VARCHAR(32),
    triggered_value NUMERIC,
    message         TEXT         NOT NULL,
    evidence        JSONB,                                 -- bằng chứng SQI/AI: điểm, xác suất, chuỗi giá trị
    sqi_score_id    UUID         REFERENCES sqi.sqi_scores(sqi_score_id),
    inference_id    UUID         REFERENCES ml.inference_results(inference_id),
    status          VARCHAR(8)   NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACK','RESOLVED')),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    acknowledged_by UUID         REFERENCES iam.users(user_id),
    acknowledged_at TIMESTAMPTZ,
    resolved_by     UUID         REFERENCES iam.users(user_id),
    resolved_at     TIMESTAMPTZ,
    resolution_note TEXT,
    CHECK (status <> 'RESOLVED' OR resolved_at IS NOT NULL)
);

CREATE TABLE alert.recommendations (
    recommendation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id        UUID         REFERENCES alert.alerts(alert_id) ON DELETE SET NULL,
    plot_id         UUID         REFERENCES farm.plots(plot_id),
    category        VARCHAR(32)  NOT NULL
                    CHECK (category IN ('IRRIGATION','FERTILIZATION','BIOCHAR_DOSE','LIMING','DRAINAGE',
                                        'DEVICE_MAINTENANCE','RECALIBRATION','OTHER')),
    action_text     TEXT         NOT NULL,
    rationale       TEXT,
    source          VARCHAR(8)   NOT NULL DEFAULT 'RULE' CHECK (source IN ('RULE','ML','EXPERT')),
    priority        SMALLINT     NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    status          VARCHAR(16)  NOT NULL DEFAULT 'PROPOSED'
                    CHECK (status IN ('PROPOSED','ACCEPTED','REJECTED','DONE')),
    decided_by      UUID         REFERENCES iam.users(user_id),
    decided_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ix_alerts_plot_time ON alert.alerts(plot_id, created_at);
CREATE INDEX ix_alerts_status    ON alert.alerts(status, severity);
CREATE INDEX ix_reco_alert       ON alert.recommendations(alert_id);

-- ---------------------------------------------------------------------
-- Đánh giá luật cảnh báo tại thời điểm p_at:
--   SENSOR: trung bình dữ liệu hợp lệ trong window_minutes
--   SQI   : điểm SQI mới nhất của ô
--   ML    : inference bất thường trong cửa sổ
--   DEVICE: node không gửi dữ liệu quá window_minutes
-- Tạo alert + recommendation; bỏ qua nếu đã có alert cùng luật/ô trong cooldown.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION alert.evaluate_rules(p_at TIMESTAMPTZ DEFAULT now())
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    r       RECORD;
    c       RECORD;
    v_col   TEXT;
    v_alert UUID;
    v_count INTEGER := 0;
BEGIN
    FOR r IN SELECT * FROM alert.alert_rules WHERE is_active LOOP
        FOR c IN EXECUTE
            CASE r.source
            WHEN 'SENSOR' THEN format($q$
                SELECT sr.plot_id, (array_agg(sr.node_id))[1] AS node_id,
                       avg(%I) AS value, NULL::uuid AS sqi_score_id, NULL::uuid AS inference_id,
                       NULL::varchar AS class_value,
                       jsonb_build_object('window_min', $2, 'n', count(*), 'min', min(%I), 'max', max(%I)) AS evidence
                FROM iot.sensor_readings sr
                WHERE sr.measured_at > $1 - make_interval(mins => $2) AND sr.measured_at <= $1
                  AND sr.quality_status IN ('VALID','CORRECTED')
                  AND ($3::uuid IS NULL OR sr.plot_id = $3)
                GROUP BY sr.plot_id $q$,
                iot.reading_column(r.parameter_code), iot.reading_column(r.parameter_code),
                iot.reading_column(r.parameter_code))
            WHEN 'SQI' THEN $q$
                SELECT DISTINCT ON (s.plot_id) s.plot_id, NULL::uuid AS node_id, s.sqi_value AS value,
                       s.sqi_score_id, NULL::uuid AS inference_id, s.health_class::varchar AS class_value,
                       jsonb_build_object('sqi', s.sqi_value, 'class', s.health_class,
                                          'period_start', s.period_start, 'coverage_pct', s.coverage_pct) AS evidence
                FROM sqi.sqi_scores s
                WHERE s.period_start <= $1 AND s.period_start > $1 - make_interval(mins => GREATEST($2, 2880))
                  AND ($3::uuid IS NULL OR s.plot_id = $3)
                ORDER BY s.plot_id, s.period_start DESC $q$
            WHEN 'ML' THEN $q$
                SELECT DISTINCT ON (i.plot_id) i.plot_id, i.node_id, i.anomaly_score AS value,
                       NULL::uuid AS sqi_score_id, i.inference_id, i.predicted_label AS class_value,
                       jsonb_build_object('prediction', i.prediction, 'confidence', i.confidence,
                                          'anomaly_score', i.anomaly_score) AS evidence
                FROM ml.inference_results i
                WHERE i.inferred_at > $1 - make_interval(mins => $2) AND i.inferred_at <= $1
                  AND i.plot_id IS NOT NULL AND ($3::uuid IS NULL OR i.plot_id = $3)
                ORDER BY i.plot_id, i.is_anomaly DESC NULLS LAST, i.anomaly_score DESC NULLS LAST $q$
            WHEN 'DEVICE' THEN $q$
                SELECT n.plot_id, n.node_id,
                       EXTRACT(EPOCH FROM $1 - n.last_seen_at) / 60 AS value,
                       NULL::uuid AS sqi_score_id, NULL::uuid AS inference_id, NULL::varchar AS class_value,
                       jsonb_build_object('last_seen_at', n.last_seen_at, 'node_code', n.node_code) AS evidence
                FROM iot.sensor_nodes n
                WHERE n.status <> 'RETIRED'
                  AND (n.last_seen_at IS NULL OR n.last_seen_at < $1 - make_interval(mins => $2))
                  AND ($3::uuid IS NULL OR n.plot_id = $3) $q$
            ELSE 'SELECT NULL::uuid plot_id, NULL::uuid node_id, NULL::numeric value, NULL::uuid sqi_score_id,
                         NULL::uuid inference_id, NULL::varchar class_value, NULL::jsonb evidence
                  WHERE false AND $1 IS NULL AND $2 IS NULL AND $3 IS NULL'
            END
        USING p_at, r.window_minutes, r.plot_id
        LOOP
            CONTINUE WHEN NOT (
                   (r.condition = 'LT'       AND c.value < r.threshold_low)
                OR (r.condition = 'GT'       AND c.value > r.threshold_high)
                OR (r.condition = 'OUTSIDE'  AND (c.value < r.threshold_low OR c.value > r.threshold_high))
                OR (r.condition = 'CLASS_IN' AND c.class_value = ANY(r.class_values))
                OR (r.condition = 'ANOMALY'  AND (c.evidence->>'anomaly_score')::numeric >= COALESCE(r.threshold_high, 0.5))
                OR (r.condition = 'OFFLINE'));
            CONTINUE WHEN c.value IS NULL AND r.condition NOT IN ('CLASS_IN','OFFLINE');

            -- cooldown
            CONTINUE WHEN EXISTS (
                SELECT 1 FROM alert.alerts a
                WHERE a.rule_id = r.rule_id AND a.plot_id IS NOT DISTINCT FROM c.plot_id
                  AND a.status <> 'RESOLVED'
                  AND a.created_at > p_at - make_interval(mins => r.cooldown_minutes));

            v_alert := NULL;
            INSERT INTO alert.alerts (plot_id, node_id, rule_id, severity, source, parameter_code,
                                      triggered_value, message, evidence, sqi_score_id, inference_id, created_at)
            SELECT c.plot_id, c.node_id, r.rule_id, r.severity, r.source, r.parameter_code,
                   round(c.value, 4),
                   format('%s – ô %s: %s', r.name, p.plot_code, COALESCE(round(c.value, 2)::text, c.class_value, '')),
                   c.evidence, c.sqi_score_id, c.inference_id, p_at
            FROM farm.plots p WHERE p.plot_id = c.plot_id
            RETURNING alert_id INTO v_alert;

            IF v_alert IS NOT NULL AND r.recommendation_template IS NOT NULL THEN
                INSERT INTO alert.recommendations (alert_id, plot_id, category, action_text, rationale, priority)
                VALUES (v_alert, c.plot_id, COALESCE(r.recommendation_category, 'OTHER'),
                        replace(r.recommendation_template, '{value}', COALESCE(round(c.value, 2)::text, '')),
                        format('Luật %s (%s)', r.rule_code, r.condition),
                        CASE r.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END);
            END IF;
            v_count := v_count + 1;
        END LOOP;
    END LOOP;
    RETURN v_count;
END;
$$;

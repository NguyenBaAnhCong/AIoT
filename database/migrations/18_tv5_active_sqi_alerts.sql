-- TV5: evaluate SQI alerts against the active definition and ignore future alerts in cooldown.
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
                JOIN sqi.sqi_definitions d ON d.definition_id = s.definition_id AND d.status = 'ACTIVE'
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
                  AND a.created_at <= p_at
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

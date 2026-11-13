-- TV5: preserve SQI IDs during recalculation so alerts retain their references.
CREATE OR REPLACE FUNCTION sqi.calculate_daily(p_definition_id UUID, p_dataset_version_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    v_cov   NUMERIC;
    v_count INTEGER;
    v_run   TIMESTAMPTZ := clock_timestamp();
BEGIN
    SELECT min_indicator_coverage_pct INTO v_cov
    FROM sqi.sqi_definitions WHERE definition_id = p_definition_id;

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

    IF EXISTS (
        SELECT 1
        FROM _sqi_ind i
        JOIN sqi.sqi_scores s ON s.definition_id = p_definition_id
          AND s.plot_id = i.plot_id AND s.period_start = i.day
        WHERE s.dataset_version_id IS DISTINCT FROM p_dataset_version_id
        GROUP BY i.plot_id, i.day
        HAVING sum(i.weight) * 100 / (SELECT sum(weight) FROM sqi.sqi_weights
                                     WHERE definition_id = p_definition_id) >= v_cov
    ) THEN
        RAISE EXCEPTION 'Phạm vi tính SQI bị trùng với một dataset khác' USING ERRCODE = '23P01';
    END IF;

    WITH agg AS (
        SELECT plot_id, day, max(treatment_id::text)::uuid AS treatment_id, max(n) AS n_obs,
               sum(weight * score) / NULLIF(sum(weight), 0) AS sqi_value,
               sum(weight) * 100 / (SELECT sum(weight) FROM sqi.sqi_weights WHERE definition_id = p_definition_id)
                   AS coverage
        FROM _sqi_ind GROUP BY plot_id, day
    ),
    ins AS (
        INSERT INTO sqi.sqi_scores (definition_id, dataset_version_id, plot_id, treatment_id,
                                    period_start, period_end, sqi_value, health_class, coverage_pct, n_observations, computed_at)
        SELECT p_definition_id, p_dataset_version_id, a.plot_id, a.treatment_id,
               a.day, a.day + INTERVAL '1 day', round(a.sqi_value, 4),
               COALESCE(c.class_code, 'UNKNOWN'), round(a.coverage, 2), a.n_obs, v_run
        FROM agg a
        LEFT JOIN sqi.sqi_classes c ON c.definition_id = p_definition_id
             AND a.sqi_value >= c.min_value AND a.sqi_value < c.max_value
        WHERE a.coverage >= v_cov
        ON CONFLICT (definition_id, plot_id, period_start) DO UPDATE
        SET treatment_id = EXCLUDED.treatment_id,
            period_end = EXCLUDED.period_end,
            sqi_value = EXCLUDED.sqi_value,
            health_class = EXCLUDED.health_class,
            coverage_pct = EXCLUDED.coverage_pct,
            n_observations = EXCLUDED.n_observations,
            computed_at = EXCLUDED.computed_at
        WHERE sqi_scores.dataset_version_id = EXCLUDED.dataset_version_id
        RETURNING sqi_score_id, plot_id, period_start
    )
    INSERT INTO sqi.sqi_indicator_scores (sqi_score_id, indicator_id, raw_value, score, weight, weighted_score)
    SELECT ins.sqi_score_id, t.indicator_id, round(t.value, 4), round(t.score, 4), t.weight,
           round(t.score * t.weight, 6)
    FROM ins JOIN _sqi_ind t ON ins.plot_id = t.plot_id AND t.day = ins.period_start
    ON CONFLICT (sqi_score_id, indicator_id) DO UPDATE
    SET raw_value = EXCLUDED.raw_value, score = EXCLUDED.score,
        weight = EXCLUDED.weight, weighted_score = EXCLUDED.weighted_score;

    -- Keep historical points referenced by alerts. Their original evidence is stored on the alert.
    DELETE FROM sqi.sqi_scores s
    WHERE s.definition_id = p_definition_id AND s.dataset_version_id = p_dataset_version_id
      AND s.computed_at <> v_run
      AND NOT EXISTS (SELECT 1 FROM alert.alerts a WHERE a.sqi_score_id = s.sqi_score_id);

    DELETE FROM sqi.sqi_indicator_scores x USING sqi.sqi_scores s
    WHERE x.sqi_score_id = s.sqi_score_id AND s.definition_id = p_definition_id
      AND s.dataset_version_id = p_dataset_version_id AND s.computed_at = v_run
      AND NOT EXISTS (SELECT 1 FROM _sqi_ind t WHERE t.plot_id = s.plot_id
        AND t.day = s.period_start AND t.indicator_id = x.indicator_id);

    SELECT count(*) INTO v_count FROM sqi.sqi_scores
    WHERE definition_id = p_definition_id AND dataset_version_id = p_dataset_version_id;

    DROP TABLE IF EXISTS _sqi_ind;
    RETURN v_count;
END;
$$;

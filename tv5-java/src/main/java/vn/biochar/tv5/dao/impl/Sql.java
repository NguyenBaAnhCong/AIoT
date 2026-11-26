package vn.biochar.tv5.dao.impl;

import java.util.*;

final class Sql {
    private Sql() {}
    static final String PLOTS = """
SELECT p.plot_id, p.plot_code, site.site_code, d.definition_id, d.version_code,
             to_char(min(s.period_start) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS first_day,
             to_char(max(s.period_start) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS last_day
      FROM sqi.sqi_scores s
      JOIN sqi.sqi_definitions d USING (definition_id)
      JOIN farm.plots p USING (plot_id)
      JOIN farm.sites site ON site.site_id = p.site_id
      GROUP BY p.plot_id, site.site_code, d.definition_id
      ORDER BY site.site_code, p.plot_code, (d.status = 'ACTIVE') DESC, d.created_at DESC
""";
    static final String SCORES = """
SELECT s.sqi_score_id, to_char(s.period_start AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS day,
             s.sqi_value, COALESCE(l.name_vi, s.health_class) AS health_class,
             s.coverage_pct, s.n_observations, t.treatment_code
      FROM sqi.sqi_scores s
      LEFT JOIN dataset.labels l ON l.label_code = s.health_class AND l.label_set = 'SOIL_HEALTH'
      LEFT JOIN experiment.treatments t USING (treatment_id)
      WHERE s.plot_id = $1 AND s.definition_id = $2
        AND s.period_start >= ($3::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND s.period_start < (($4::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      ORDER BY s.period_start
""";
    static final String SCORE_DETAIL = """
SELECT s.sqi_score_id, d.version_code,
             COALESCE(jsonb_agg(jsonb_build_object(
               'name', p.name_vi, 'source', i.source, 'unit', p.unit,
               'raw_value', x.raw_value, 'score', x.score,
               'weight', x.weight, 'weighted_score', x.weighted_score
             ) ORDER BY p.parameter_code) FILTER (WHERE x.indicator_id IS NOT NULL), '[]') AS indicators
      FROM sqi.sqi_scores s
      JOIN sqi.sqi_definitions d USING (definition_id)
      LEFT JOIN sqi.sqi_indicator_scores x USING (sqi_score_id)
      LEFT JOIN sqi.sqi_indicators i ON i.indicator_id = x.indicator_id
      LEFT JOIN ref.parameters p ON p.parameter_code = i.parameter_code
      WHERE s.sqi_score_id = $1
      GROUP BY s.sqi_score_id, d.version_code
""";
    static final String CONFIGURATION = """
SELECT (SELECT COALESCE(jsonb_agg(to_jsonb(d) || jsonb_build_object(
      'indicators', (SELECT jsonb_agg(jsonb_build_object('parameter_code', i.parameter_code,
        'source', i.source, 'scoring_function', i.scoring_function, 'lower_limit', i.lower_limit,
        'upper_limit', i.upper_limit, 'optimum_low', i.optimum_low, 'optimum_high', i.optimum_high,
        'weight', w.weight) ORDER BY i.parameter_code)
        FROM sqi.sqi_indicators i JOIN sqi.sqi_weights w USING (indicator_id)
        WHERE i.definition_id = d.definition_id),
      'classes', (SELECT jsonb_agg(jsonb_build_object('class_code', c.class_code,
        'min_value', c.min_value, 'max_value', c.max_value) ORDER BY c.min_value)
        FROM sqi.sqi_classes c WHERE c.definition_id = d.definition_id)
    ) ORDER BY (status = 'ACTIVE') DESC, created_at DESC), '[]') FROM sqi.sqi_definitions d) AS definitions,
    (SELECT COALESCE(jsonb_agg(to_jsonb(v)), '[]') FROM (
      SELECT dv.dataset_version_id, d.dataset_code, dv.version_no, dv.status
      FROM dataset.dataset_versions dv JOIN dataset.datasets d USING (dataset_id)
      WHERE dv.status IN ('BUILT', 'FROZEN') ORDER BY d.dataset_code, dv.version_no DESC
    ) v) AS datasets,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', parameter_code, 'name', name_vi)
      ORDER BY parameter_code), '[]') FROM ref.parameters) AS parameters,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', label_code, 'name', name_vi)
      ORDER BY class_order), '[]') FROM dataset.labels WHERE label_set = 'SOIL_HEALTH') AS labels
""";
    static final String COMPARISON = """
SELECT v.* FROM sqi.v_treatment_comparison v JOIN sqi.sqi_definitions d USING (version_code)
    WHERE d.definition_id = $1 ORDER BY v.treatment_code
""";
    static final String CREATE_DEFINITION = """
INSERT INTO sqi.sqi_definitions (version_code,name,min_indicator_coverage_pct)
      VALUES ($1,$2,$3) RETURNING definition_id
""";
    static final String CREATE_INDICATOR = """
INSERT INTO sqi.sqi_indicators (definition_id,parameter_code,source,scoring_function,
          lower_limit,upper_limit,optimum_low,optimum_high)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING indicator_id
""";
    static final String CREATE_CLASS = """
INSERT INTO sqi.sqi_classes (definition_id,class_code,min_value,max_value)
        SELECT $1,label_code,$3,$4 FROM dataset.labels WHERE label_set='SOIL_HEALTH' AND label_code=$2
""";
    static final String CAN_ACTIVATE = """
SELECT 1 FROM sqi.sqi_definitions WHERE definition_id=$1 AND status='DRAFT'
      AND EXISTS (SELECT 1 FROM sqi.sqi_scores WHERE definition_id=$1)
""";
    static final String ACTIVATE = """
UPDATE sqi.sqi_definitions SET status='ACTIVE', approved_by=$2, valid_from=current_date
      WHERE definition_id=$1
""";
    static final String CALCULATION_VERSION = """
SELECT dv.status, d.status AS definition_status
      FROM dataset.dataset_versions dv CROSS JOIN sqi.sqi_definitions d
      WHERE dv.dataset_version_id=$1 AND d.definition_id=$2 FOR UPDATE OF dv
""";
    static final String ALERT_SUMMARY = """
SELECT count(*) FILTER (WHERE status = 'OPEN')::integer AS open,
           count(*) FILTER (WHERE status <> 'RESOLVED' AND severity IN ('HIGH','CRITICAL'))::integer AS urgent,
           count(*) FILTER (WHERE status = 'RESOLVED')::integer AS resolved
    FROM alert.alerts
""";
    static final String ALERTS = """
SELECT a.alert_id, a.status, a.source, a.severity, a.message, a.evidence,
           a.created_at, a.resolution_note, p.plot_code,
           ack.full_name AS acknowledged_by, a.acknowledged_at,
           resolver.full_name AS resolved_by, a.resolved_at,
           COALESCE(recos.items, '[]') AS recommendations
    FROM alert.alerts a
    LEFT JOIN farm.plots p USING (plot_id)
    LEFT JOIN iam.users ack ON ack.user_id = a.acknowledged_by
    LEFT JOIN iam.users resolver ON resolver.user_id = a.resolved_by
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('id', r.recommendation_id, 'action', r.action_text,
             'status', r.status, 'rationale', r.rationale,
             'decidedBy', u.full_name, 'decidedAt', r.decided_at) ORDER BY r.priority, r.created_at) AS items
      FROM alert.recommendations r LEFT JOIN iam.users u ON u.user_id = r.decided_by
      WHERE r.alert_id = a.alert_id
    ) recos ON true
    WHERE ($1::text IS NULL OR a.status = $1)
      AND ($2::text IS NULL OR a.severity = $2) AND ($3::text IS NULL OR a.source = $3)
    ORDER BY a.created_at DESC, a.alert_id
""";
    static final String ACK = """
UPDATE alert.alerts SET status='ACK', acknowledged_by=$2, acknowledged_at=now()
          WHERE alert_id=$1 AND status='OPEN'
""";
    static final String RESOLVE = """
UPDATE alert.alerts SET status='RESOLVED', resolved_by=$2, resolved_at=now(), resolution_note=$3
          WHERE alert_id=$1 AND status='ACK'
""";
    static final String DONE = """
UPDATE alert.recommendations SET status='DONE'
          WHERE recommendation_id=$1 AND status='ACCEPTED'
""";
    static final String DECIDE = """
UPDATE alert.recommendations SET status=$2, decided_by=$3, decided_at=now()
          WHERE recommendation_id=$1 AND status='PROPOSED'
""";
    static final String UPDATE_RULE = """
UPDATE alert.alert_rules SET rule_code=$1,name=$2,source=$3,parameter_code=$4,
          condition=$5,threshold_low=$6,threshold_high=$7,class_values=$8::varchar[],window_minutes=$9,
          cooldown_minutes=$10,severity=$11,recommendation_template=$12,is_active=$13
          WHERE rule_id=$14 RETURNING rule_id
""";
    static final String INSERT_RULE = """
INSERT INTO alert.alert_rules (rule_code,name,source,parameter_code,condition,
          threshold_low,threshold_high,class_values,window_minutes,cooldown_minutes,severity,
          recommendation_template,is_active,created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8::varchar[],$9,$10,$11,$12,$13,$14) RETURNING rule_id
""";
    static final String NEW_ALERTS = """
SELECT alert_id,severity,message FROM alert.alerts
      WHERE xmin=pg_current_xact_id()::xid ORDER BY alert_id
""";
    static final String REPORT_OPTIONS = """
SELECT (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.experiment_code) FROM (
      SELECT experiment_id, experiment_code, title FROM experiment.experiments) e) AS experiments,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.treatment_code) FROM (
      SELECT experiment_id, treatment_id, treatment_code, name FROM experiment.treatments) t) AS treatments,
    (SELECT jsonb_agg(DISTINCT jsonb_build_object('experiment_id', t.experiment_id,
      'crop_season_id', s.crop_season_id, 'season_code', s.season_code, 'plot_code', p.plot_code))
      FROM experiment.treatment_applications a JOIN experiment.treatments t USING (treatment_id)
      JOIN farm.crop_seasons s USING (crop_season_id) JOIN farm.plots p ON p.plot_id=s.plot_id) AS seasons
""";
    static final String REPORTS = """
SELECT report_id,title,report_type,file_format,status,created_at,
    parameters->>'error' AS error FROM reporting.reports ORDER BY created_at DESC, report_id
""";
    static final String TECHNICAL = """
SELECT t.treatment_code,p.plot_code,d.version_code,count(*)::integer AS days,
             round(avg(s.sqi_value),4)::float8 AS mean_sqi,round(avg(s.coverage_pct),2)::float8 AS coverage
      FROM sqi.sqi_scores s JOIN experiment.treatments t USING (treatment_id)
      JOIN farm.plots p USING (plot_id) JOIN sqi.sqi_definitions d USING (definition_id)
      WHERE t.experiment_id=$1 AND ($2::uuid IS NULL OR t.treatment_id=$2)
        AND ($3::uuid IS NULL OR EXISTS (
          SELECT 1 FROM experiment.treatment_applications a
          WHERE a.crop_season_id=$3 AND a.treatment_id=t.treatment_id AND a.plot_id=p.plot_id
            AND a.effective_from<=s.period_start AND (a.effective_to IS NULL OR a.effective_to>s.period_start)
        ))
        AND ($4::date IS NULL OR s.period_start >= ($4::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))
        AND ($5::date IS NULL OR s.period_start < (($5::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))
      GROUP BY t.treatment_code,p.plot_code,d.version_code ORDER BY 1,2,3
""";
    static final String ECONOMIC = """
SELECT t.treatment_code,p.plot_code,r.yield_t_ha::float8,r.revenue_vnd_ha::float8,r.total_cost_vnd_ha::float8,r.profit_vnd_ha::float8,r.bcr::float8,r.carbon_sequestered_kg_ha::float8
    FROM reporting.economic_results r JOIN experiment.treatments t USING (treatment_id)
    LEFT JOIN farm.plots p USING (plot_id)
    WHERE r.experiment_id=$1 AND ($2::uuid IS NULL OR r.treatment_id=$2)
      AND ($3::uuid IS NULL OR r.crop_season_id=$3)
    ORDER BY t.treatment_code,p.plot_code
""";
    static final String REPORT_SCOPE = """
SELECT e.experiment_code,t.treatment_code,s.season_code
      FROM experiment.experiments e
      LEFT JOIN experiment.treatments t ON t.experiment_id=e.experiment_id AND t.treatment_id=$2
      LEFT JOIN farm.crop_seasons s ON s.crop_season_id=$3 AND EXISTS (
        SELECT 1 FROM experiment.treatment_applications a JOIN experiment.treatments tr USING (treatment_id)
        WHERE a.crop_season_id=s.crop_season_id AND tr.experiment_id=e.experiment_id
          AND ($2::uuid IS NULL OR tr.treatment_id=$2)
      )
      WHERE e.experiment_id=$1
""";
    static final String INSERT_REPORT = """
INSERT INTO reporting.reports (report_type,title,experiment_id,crop_season_id,
        period_start,period_end,parameters,file_format,generated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING report_id
""";
    static final String FAILED_REPORT = """
UPDATE reporting.reports SET status='FAILED',
      parameters=parameters || '{"error":"Không tạo được tệp báo cáo. Xem log Java TV5."}'::jsonb WHERE report_id=$1
""";
    static final String DOWNLOAD = """
SELECT file_format FROM reporting.reports WHERE report_id=$1 AND status='READY'
""";
}

export const rulesSql = `SELECT * FROM data_quality.quality_rules ORDER BY rule_code`;
export const ruleSql = `SELECT * FROM data_quality.quality_rules WHERE rule_id = $1`;
export const createRuleSql = `INSERT INTO data_quality.quality_rules
 (rule_code,name,target,rule_type,parameter_code,min_value,max_value,max_delta,window_minutes,severity,is_active,description)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,true),$12) RETURNING *`;
export const updateRuleSql = `UPDATE data_quality.quality_rules SET
 name=COALESCE($2,name), min_value=COALESCE($3,min_value), max_value=COALESCE($4,max_value),
 max_delta=COALESCE($5,max_delta), window_minutes=COALESCE($6,window_minutes),
 severity=COALESCE($7,severity), is_active=COALESCE($8,is_active), description=COALESCE($9,description)
 WHERE rule_id=$1 RETURNING *`;
export const issuesSql = `SELECT i.*, s.sensor_code, p.plot_code FROM data_quality.data_issues i
 LEFT JOIN iot.sensors s ON s.sensor_id=i.sensor_id LEFT JOIN farm.plots p ON p.plot_id=i.plot_id
 WHERE ($1::varchar IS NULL OR i.issue_type=$1) AND ($2::varchar IS NULL OR i.status=$2)
 AND ($3::uuid IS NULL OR i.sensor_id=$3) AND ($4::uuid IS NULL OR i.plot_id=$4)
 AND ($5::timestamptz IS NULL OR i.observed_at >= $5) AND ($6::timestamptz IS NULL OR i.observed_at < $6)
 ORDER BY i.detected_at DESC LIMIT $7 OFFSET $8`;
export const issueCountSql = `SELECT count(*)::int AS total FROM data_quality.data_issues i
 WHERE ($1::varchar IS NULL OR i.issue_type=$1) AND ($2::varchar IS NULL OR i.status=$2)
 AND ($3::uuid IS NULL OR i.sensor_id=$3) AND ($4::uuid IS NULL OR i.plot_id=$4)
 AND ($5::timestamptz IS NULL OR i.observed_at >= $5) AND ($6::timestamptz IS NULL OR i.observed_at < $6)`;
export const issueSql = `SELECT * FROM data_quality.data_issues WHERE issue_id=$1`;
export const updateIssueSql = `UPDATE data_quality.data_issues SET status=$2,resolved_by=$3,resolved_at=now() WHERE issue_id=$1 RETURNING *`;
export const auditSql = `SELECT * FROM data_quality.data_audit WHERE ($1::varchar IS NULL OR source_table=$1)
 AND ($2::varchar IS NULL OR record_id=$2) ORDER BY occurred_at DESC LIMIT $3 OFFSET $4`;
export const auditCountSql = `SELECT count(*)::int AS total FROM data_quality.data_audit WHERE ($1::varchar IS NULL OR source_table=$1) AND ($2::varchar IS NULL OR record_id=$2)`;
export const qcStatsSql = `SELECT (SELECT count(*)::int FROM iot.sensor_readings WHERE measured_at >= $1 AND measured_at < $2) observations,
 (SELECT count(*)::int FROM iot.sensor_readings WHERE measured_at >= $1 AND measured_at < $2 AND quality_status IN ('VALID','CORRECTED')) valid,
 (SELECT count(*)::int FROM iot.sensor_readings WHERE measured_at >= $1 AND measured_at < $2 AND quality_status='INVALID') invalid,
 (SELECT count(*)::int FROM data_quality.data_issues WHERE observed_at >= $1 AND observed_at < $2 AND issue_type='DUPLICATE') duplicates,
 (SELECT count(*)::int FROM data_quality.data_issues WHERE observed_at >= $1 AND observed_at < $2 AND issue_type='MISSING') missing,
 (SELECT count(*)::int FROM data_quality.data_issues WHERE observed_at >= $1 AND observed_at < $2 AND issue_type IN ('OUT_OF_RANGE','SPIKE','FLATLINE')) outliers`;
export const dailySql = `SELECT day, sum(expected)::int expected, sum(received)::int received, sum(valid)::int valid,
 sum(invalid)::int invalid, sum(duplicates)::int duplicates FROM reporting.v_data_collection_daily
 WHERE day >= $1 AND day < $2 GROUP BY day ORDER BY day`;
export const lastCheckSql = `SELECT * FROM data_quality.quality_checks ORDER BY started_at DESC LIMIT 1`;
export const kpisSql = `SELECT kpi_code,name_vi,unit,target_value,current_value,passed FROM reporting.v_acceptance_summary WHERE kpi_code IN ('ERROR_DUPLICATE_PCT','MISSING_AFTER_QC_PCT','VALID_OBSERVATIONS') ORDER BY kpi_code`;
export const rangeSql = `SELECT min(measured_at) AS from_at,max(measured_at)+interval '1 second' AS to_at FROM iot.sensor_readings`;
export const runChecksSql = `SELECT data_quality.run_sensor_checks($1,$2, $3::interval, $4) AS check_id`;
export const correctionSql = `UPDATE iot.sensor_readings SET ph=COALESCE($3,ph),ec=COALESCE($4,ec),soil_moisture=COALESCE($5,soil_moisture),soil_temperature=COALESCE($6,soil_temperature),n=COALESCE($7,n),p=COALESCE($8,p),k=COALESCE($9,k),quality_status='CORRECTED' WHERE reading_id=$1 AND measured_at=$2 RETURNING *`;

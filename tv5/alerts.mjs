import { actor, fail, transaction, uuid } from './db.mjs';

const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const sources = ['SENSOR', 'SQI', 'ML', 'DEVICE'];
const statuses = ['OPEN', 'ACK', 'RESOLVED'];
const conditions = {
  SENSOR: ['LT', 'GT', 'OUTSIDE'], SQI: ['LT', 'GT', 'OUTSIDE', 'CLASS_IN'],
  ML: ['ANOMALY'], DEVICE: ['OFFLINE'],
};
const sensorParameters = ['PH', 'EC', 'MOISTURE', 'N', 'P', 'K', 'SOIL_TEMP'];

export async function alertSummary(db) {
  const { rows: [summary] } = await db.query(`
    SELECT count(*) FILTER (WHERE status = 'OPEN')::integer AS open,
           count(*) FILTER (WHERE status <> 'RESOLVED' AND severity IN ('HIGH','CRITICAL'))::integer AS urgent,
           count(*) FILTER (WHERE status = 'RESOLVED')::integer AS resolved
    FROM alert.alerts
  `);
  return summary;
}

export async function listAlerts(db, filters) {
  const status = filters.get('status') || null;
  const severity = filters.get('severity') || null;
  const source = filters.get('source') || null;
  if ((status && !statuses.includes(status)) || (severity && !severities.includes(severity)) ||
      (source && ![...sources, 'DATA_QUALITY'].includes(source))) fail(400, 'Bộ lọc không hợp lệ.');
  const { rows } = await db.query(`
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
    ORDER BY a.created_at DESC, a.alert_id LIMIT 100
  `, [status, severity, source]);
  return rows;
}

export async function changeAlert(db, id, { status, note }, options) {
  if (!uuid.test(id) || !['ACK', 'RESOLVED'].includes(status) ||
      (status === 'RESOLVED' && (typeof note !== 'string' || !note.trim() || note.length > 2000))) {
    fail(400, 'Trạng thái hoặc ghi chú xử lý không hợp lệ.');
  }
  return transaction(db, async client => {
    const user = await actor(client, options?.userId);
    const result = status === 'ACK'
      ? await client.query(`UPDATE alert.alerts SET status='ACK', acknowledged_by=$2, acknowledged_at=now()
          WHERE alert_id=$1 AND status='OPEN'`, [id, user])
      : await client.query(`UPDATE alert.alerts SET status='RESOLVED', resolved_by=$2, resolved_at=now(), resolution_note=$3
          WHERE alert_id=$1 AND status='ACK'`, [id, user, note.trim()]);
    if (!result.rowCount) fail(409, 'Cảnh báo không tồn tại hoặc đã đổi trạng thái. Hãy tải lại.');
    return { status };
  }, options);
}

export async function changeRecommendation(db, id, { status }, options) {
  if (!uuid.test(id) || !['ACCEPTED', 'REJECTED', 'DONE'].includes(status)) fail(400, 'Quyết định không hợp lệ.');
  return transaction(db, async client => {
    const user = await actor(client, options?.userId);
    const result = status === 'DONE'
      ? await client.query(`UPDATE alert.recommendations SET status='DONE'
          WHERE recommendation_id=$1 AND status='ACCEPTED'`, [id])
      : await client.query(`UPDATE alert.recommendations SET status=$2, decided_by=$3, decided_at=now()
          WHERE recommendation_id=$1 AND status='PROPOSED'`, [id, status, user]);
    if (!result.rowCount) fail(409, 'Khuyến nghị không tồn tại hoặc đã đổi trạng thái. Hãy tải lại.');
    return { status };
  }, options);
}

export async function listRules(db) {
  return (await db.query('SELECT * FROM alert.alert_rules ORDER BY rule_code')).rows;
}

export async function saveRule(db, id, body, options) {
  const { code, name, source, parameter, condition, low, high, classes, windowMinutes,
    cooldownMinutes, severity, recommendation, active = true } = body;
  if ((id && !uuid.test(id)) || !/^[A-Za-z0-9_-]{1,32}$/.test(code || '') ||
      typeof name !== 'string' || !name.trim() || name.length > 255 ||
      !sources.includes(source) || !conditions[source].includes(condition) ||
      !severities.includes(severity) || typeof active !== 'boolean' ||
      !Number.isInteger(windowMinutes) || windowMinutes < 1 ||
      !Number.isInteger(cooldownMinutes) || cooldownMinutes < 0 ||
      (source === 'SENSOR' && !sensorParameters.includes(parameter)) ||
      (low != null && !Number.isFinite(low)) || (high != null && !Number.isFinite(high)) ||
      (['LT', 'OUTSIDE'].includes(condition) && low == null) ||
      (['GT', 'OUTSIDE'].includes(condition) && high == null) ||
      (condition === 'OUTSIDE' && low >= high) ||
      (condition === 'CLASS_IN' && (!Array.isArray(classes) || !classes.length ||
        classes.some(value => typeof value !== 'string' || !/^[A-Z_]{1,32}$/.test(value)))) ||
      (recommendation != null && (typeof recommendation !== 'string' || recommendation.length > 2000))) {
    fail(400, 'Kiểm tra mã, nguồn, điều kiện, ngưỡng, mức độ và thời gian của luật.');
  }
  return transaction(db, async client => {
    const user = await actor(client, options?.userId);
    const values = [code, name.trim(), source, source === 'SENSOR' ? parameter : null, condition,
      low ?? null, high ?? null, condition === 'CLASS_IN' ? classes : null, windowMinutes, cooldownMinutes,
      severity, recommendation?.trim() || null, active];
    const { rows: [rule] } = id
      ? await client.query(`UPDATE alert.alert_rules SET rule_code=$1,name=$2,source=$3,parameter_code=$4,
          condition=$5,threshold_low=$6,threshold_high=$7,class_values=$8,window_minutes=$9,
          cooldown_minutes=$10,severity=$11,recommendation_template=$12,is_active=$13
          WHERE rule_id=$14 RETURNING rule_id`, [...values, id])
      : await client.query(`INSERT INTO alert.alert_rules (rule_code,name,source,parameter_code,condition,
          threshold_low,threshold_high,class_values,window_minutes,cooldown_minutes,severity,
          recommendation_template,is_active,created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING rule_id`, [...values, user]);
    if (!rule) fail(404, 'Không tìm thấy luật cảnh báo.');
    return rule;
  }, options);
}

export async function evaluate(db, at, options = {}) {
  if (at != null && (typeof at !== 'string' || !Number.isFinite(Date.parse(at)))) fail(400, 'Thời điểm không hợp lệ.');
  return transaction(db, async client => {
    await client.query('SELECT pg_advisory_xact_lock(42005, 12)');
    const { rows: [result] } = await client.query(
      'SELECT alert.evaluate_rules(COALESCE($1::timestamptz, now())) AS created', [at ?? null],
    );
    const { rows: alerts } = await client.query(`
      SELECT alert_id,severity,message FROM alert.alerts
      WHERE xmin=pg_current_xact_id()::xid ORDER BY alert_id
    `);
    return { ...result, alerts };
  }, options);
}

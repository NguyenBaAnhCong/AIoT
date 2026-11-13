import { actor, fail, transaction, uuid } from './db.mjs';

export async function configuration(db) {
  const { rows: [data] } = await db.query(`
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
  `);
  return data;
}

export async function comparison(db, id) {
  if (!uuid.test(id)) fail(400, 'Mã phiên bản SQI không hợp lệ.');
  return (await db.query(`
    SELECT v.* FROM sqi.v_treatment_comparison v JOIN sqi.sqi_definitions d USING (version_code)
    WHERE d.definition_id = $1 ORDER BY v.treatment_code
  `, [id])).rows;
}

export async function createDefinition(db, { code, name, coverage, indicators, classes }) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9._-]{1,32}$/.test(code) ||
      typeof name !== 'string' || !name.trim() || name.length > 255 ||
      !Number.isFinite(coverage) || coverage < 0 || coverage > 100 ||
      !Array.isArray(indicators) || !indicators.length || indicators.length > 50 ||
      !Array.isArray(classes) || !classes.length || classes.length > 20 ||
      indicators.some(i => !i || typeof i.parameter_code !== 'string' ||
        !['SENSOR', 'LAB'].includes(i.source) ||
        !['MORE_IS_BETTER', 'LESS_IS_BETTER', 'OPTIMUM'].includes(i.scoring_function) ||
        ![i.lower_limit, i.upper_limit, i.weight].every(Number.isFinite) ||
        i.lower_limit >= i.upper_limit || i.weight < 0.0001 || i.weight > 1 ||
        (i.scoring_function === 'OPTIMUM' && (![i.optimum_low, i.optimum_high].every(Number.isFinite) ||
          i.optimum_low < i.lower_limit || i.optimum_high > i.upper_limit || i.optimum_low > i.optimum_high))) ||
      classes.some(c => !c || typeof c.class_code !== 'string' ||
        ![c.min_value, c.max_value].every(Number.isFinite) || c.min_value < 0 ||
        c.max_value > 1.0001 || c.min_value >= c.max_value)) fail(400, 'Kiểm tra tên, trọng số và ngưỡng SQI.');
  const ordered = [...classes].sort((a, b) => a.min_value - b.min_value);
  if (ordered[0].min_value !== 0 || ordered.at(-1).max_value !== 1.0001 ||
      ordered.slice(1).some((item, index) => item.min_value !== ordered[index].max_value)) {
    fail(400, 'Các lớp SQI phải nối tiếp nhau từ 0 đến cận trên 1.0001 để bao gồm điểm 1.');
  }
  return transaction(db, async client => {
    await actor(client);
    const { rows: [{ definition_id: id }] } = await client.query(`
      INSERT INTO sqi.sqi_definitions (version_code,name,min_indicator_coverage_pct)
      VALUES ($1,$2,$3) RETURNING definition_id
    `, [code, name.trim(), coverage]);
    for (const i of indicators) {
      const { rows: [{ indicator_id: indicator }] } = await client.query(`
        INSERT INTO sqi.sqi_indicators (definition_id,parameter_code,source,scoring_function,
          lower_limit,upper_limit,optimum_low,optimum_high)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING indicator_id
      `, [id, i.parameter_code, i.source, i.scoring_function, i.lower_limit, i.upper_limit,
        i.scoring_function === 'OPTIMUM' ? i.optimum_low : null,
        i.scoring_function === 'OPTIMUM' ? i.optimum_high : null]);
      await client.query('INSERT INTO sqi.sqi_weights (definition_id,indicator_id,weight) VALUES ($1,$2,$3)',
        [id, indicator, i.weight]);
    }
    for (const c of classes) {
      const result = await client.query(`
        INSERT INTO sqi.sqi_classes (definition_id,class_code,min_value,max_value)
        SELECT $1,label_code,$3,$4 FROM dataset.labels WHERE label_set='SOIL_HEALTH' AND label_code=$2
      `, [id, c.class_code, c.min_value, c.max_value]);
      if (!result.rowCount) fail(400, `Lớp ${c.class_code} chưa có trong danh mục nhãn sức khỏe đất.`);
    }
    return { definition_id: id };
  });
}

export async function activate(db, id) {
  if (!uuid.test(id)) fail(400, 'Mã phiên bản không hợp lệ.');
  return transaction(db, async client => {
    const user = await actor(client);
    await client.query('SELECT pg_advisory_xact_lock(42005, 4)');
    const next = await client.query(`SELECT 1 FROM sqi.sqi_definitions WHERE definition_id=$1 AND status='DRAFT'
      AND EXISTS (SELECT 1 FROM sqi.sqi_scores WHERE definition_id=$1)`, [id]);
    if (!next.rowCount) fail(409, 'Chỉ kích hoạt phiên bản nháp đã tính được điểm.');
    await client.query("UPDATE sqi.sqi_definitions SET status='RETIRED' WHERE status='ACTIVE'");
    await client.query(`UPDATE sqi.sqi_definitions SET status='ACTIVE', approved_by=$2, valid_from=current_date
      WHERE definition_id=$1`, [id, user]);
    return { status: 'ACTIVE' };
  });
}

export async function calculate(db, definition, dataset, label = false, { preview = false } = {}) {
  if (!uuid.test(definition) || !uuid.test(dataset) || typeof label !== 'boolean') fail(400, 'Chọn phiên bản SQI và dataset.');
  return transaction(db, async client => {
    await client.query('SELECT pg_advisory_xact_lock(42005, 4)');
    const { rows: [version] } = await client.query(`
      SELECT dv.status, d.status AS definition_status
      FROM dataset.dataset_versions dv CROSS JOIN sqi.sqi_definitions d
      WHERE dv.dataset_version_id=$1 AND d.definition_id=$2 FOR UPDATE OF dv
    `, [dataset, definition]);
    if (!version || !['BUILT','FROZEN'].includes(version.status) || version.definition_status === 'RETIRED') {
      fail(409, 'Cần dataset đã build và phiên bản SQI đang dùng hoặc nháp.');
    }
    if (label && (version.status !== 'BUILT' || version.definition_status !== 'ACTIVE')) {
      fail(409, 'Gán nhãn cần dataset BUILT và phiên bản SQI ACTIVE.');
    }
    const { rows: [result] } = await client.query('SELECT sqi.calculate_daily($1,$2) AS scores', [definition, dataset]);
    if (label) {
      const { rows: [labels] } = await client.query('SELECT sqi.assign_labels($1,$2) AS labels', [definition, dataset]);
      return { ...result, ...labels };
    }
    return result;
  }, { preview });
}

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const localDate = /^(?!0000)\d{4}-\d{2}-\d{2}$/;
const validDate = date => localDate.test(date) &&
  new Date(`${date}T00:00:00Z`).toJSON()?.slice(0, 10) === date;

export async function sqiApi(db, { pathname, searchParams }) {
  if (pathname === '/sqi/plots') {
    const { rows } = await db.query(`
      SELECT p.plot_id, p.plot_code, site.site_code, d.definition_id, d.version_code,
             to_char(min(s.period_start) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS first_day,
             to_char(max(s.period_start) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS last_day
      FROM sqi.sqi_scores s
      JOIN sqi.sqi_definitions d USING (definition_id)
      JOIN farm.plots p USING (plot_id)
      JOIN farm.sites site ON site.site_id = p.site_id
      GROUP BY p.plot_id, site.site_code, d.definition_id
      ORDER BY site.site_code, p.plot_code, (d.status = 'ACTIVE') DESC, d.created_at DESC
    `);
    return { status: 200, body: rows };
  }

  if (pathname === '/sqi/scores') {
    const plot = searchParams.get('plotId');
    const definition = searchParams.get('definitionId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (!uuid.test(plot) || !uuid.test(definition) || !validDate(from) || !validDate(to) || from > to) {
      return { status: 400, body: { error: 'Cần mã ô, mã phiên bản và khoảng ngày hợp lệ (YYYY-MM-DD).' } };
    }
    const { rows } = await db.query(`
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
    `, [plot, definition, from, to]);
    return { status: 200, body: rows };
  }

  const scoreId = pathname.match(/^\/sqi\/scores\/([^/]+)$/)?.[1];
  if (scoreId) {
    if (!uuid.test(scoreId)) return { status: 400, body: { error: 'Mã điểm SQI không hợp lệ.' } };
    const { rows: [detail] } = await db.query(`
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
    `, [scoreId]);
    if (!detail) return { status: 404, body: { error: 'Không tìm thấy điểm SQI.' } };
    return { status: 200, body: detail };
  }

  return { status: 404, body: { error: 'Không tìm thấy đường dẫn.' } };
}

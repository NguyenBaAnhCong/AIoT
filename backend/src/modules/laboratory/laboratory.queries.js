// Câu SELECT của module laboratory (TV3).

export const METHODS = `
  SELECT m.method_id, m.method_code, m.parameter_code, p.name_vi AS parameter_name, m.name, m.standard_ref,
         m.instrument, m.detection_limit, m.quantification_limit, m.unit
  FROM laboratory.lab_methods m
  LEFT JOIN ref.parameters p ON p.parameter_code = m.parameter_code`;

export const SAMPLES = `
  SELECT s.sample_id, s.sample_code, s.plot_id, p.plot_code, s.sample_type, s.sampled_at,
         s.depth_from_cm, s.depth_to_cm, s.latitude, s.longitude, s.near_node_id, n.node_code AS near_node_code,
         s.composite_of, s.collected_by, u.full_name AS collected_by_name, s.received_at, s.status, s.notes,
         COALESCE(rc.total, 0) AS result_count, COALESCE(rc.draft, 0) AS draft_count,
         COALESCE(rc.verified, 0) AS verified_count, COALESCE(rc.approved, 0) AS approved_count,
         COALESCE(rc.rejected, 0) AS rejected_count
  FROM laboratory.soil_samples s
  JOIN farm.plots p ON p.plot_id = s.plot_id
  LEFT JOIN iot.sensor_nodes n ON n.node_id = s.near_node_id
  LEFT JOIN iam.users u ON u.user_id = s.collected_by
  LEFT JOIN LATERAL (
      SELECT count(*) AS total,
             count(*) FILTER (WHERE r.result_status = 'DRAFT')    AS draft,
             count(*) FILTER (WHERE r.result_status = 'VERIFIED') AS verified,
             count(*) FILTER (WHERE r.result_status = 'APPROVED') AS approved,
             count(*) FILTER (WHERE r.result_status = 'REJECTED') AS rejected
      FROM laboratory.lab_results r WHERE r.sample_id = s.sample_id
  ) rc ON true`;

export const RESULTS = `
  SELECT r.lab_result_id, r.sample_id, s.sample_code, s.plot_id, p.plot_code, s.sampled_at,
         r.parameter_code, r.value, r.unit, r.method_id, m.method_code, r.replicate_no, r.below_lod,
         r.analyzed_at, r.analyst_id, ua.full_name AS analyst_name,
         r.approved_by, ub.full_name AS approved_by_name, r.result_status
  FROM laboratory.lab_results r
  JOIN laboratory.soil_samples s ON s.sample_id = r.sample_id
  JOIN farm.plots p ON p.plot_id = s.plot_id
  LEFT JOIN laboratory.lab_methods m ON m.method_id = r.method_id
  LEFT JOIN iam.users ua ON ua.user_id = r.analyst_id
  LEFT JOIN iam.users ub ON ub.user_id = r.approved_by`;

// Đối chiếu cảm biến với phòng thí nghiệm (màn hình 07), dùng view có sẵn trong database
export const SENSOR_VS_LAB = `
  SELECT v.sample_id, v.sample_code, v.plot_id, p.plot_code, v.sampled_at, v.parameter_code,
         round(v.lab_value::numeric, 3) AS lab_value, round(v.sensor_value::numeric, 3) AS sensor_value,
         v.n_readings, round(v.diff::numeric, 3) AS diff, v.diff_pct
  FROM laboratory.v_sensor_vs_lab v
  JOIN farm.plots p ON p.plot_id = v.plot_id`;

// Tổng hợp sai lệch cảm biến – lab theo chỉ tiêu
export const SENSOR_VS_LAB_SUMMARY = `
  SELECT parameter_code, count(*) AS pairs,
         round(avg(abs(diff_pct))::numeric, 2) AS mean_abs_diff_pct,
         round(max(abs(diff_pct))::numeric, 2) AS max_abs_diff_pct
  FROM (${SENSOR_VS_LAB}) t
  WHERE t.sensor_value IS NOT NULL AND ($1::uuid IS NULL OR t.plot_id = $1)
  GROUP BY parameter_code ORDER BY parameter_code`;

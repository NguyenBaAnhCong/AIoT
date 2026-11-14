// Câu SELECT của module biochar (TV3).

export const FEEDSTOCK = `
  SELECT f.feedstock_batch_id, f.batch_code, f.feedstock_type, f.source_location,
         f.collected_on::text AS collected_on, f.mass_kg, f.moisture_pct, f.pretreatment, f.notes, f.created_at,
         COALESCE((SELECT sum(b.input_mass_kg) FROM biochar.biochar_batches b
                   WHERE b.feedstock_batch_id = f.feedstock_batch_id), 0) AS used_mass_kg,
         (SELECT count(*) FROM biochar.biochar_batches b WHERE b.feedstock_batch_id = f.feedstock_batch_id) AS biochar_batch_count
  FROM biochar.feedstock_batches f`;

export const BIOCHAR = `
  SELECT b.biochar_batch_id, b.batch_code, b.feedstock_batch_id, f.batch_code AS feedstock_batch_code,
         b.produced_on::text AS produced_on, b.reactor_type, b.pyrolysis_temp_c, b.residence_time_min,
         b.heating_rate_c_min, b.input_mass_kg, b.output_mass_kg, b.yield_pct,
         b.ph, b.ec_ds_m, b.carbon_pct, b.ash_pct, b.surface_area_m2_g, b.cec_cmol_kg,
         b.heavy_metals_mg_kg, b.safety_status, b.notes, b.created_at
  FROM biochar.biochar_batches b
  JOIN biochar.feedstock_batches f ON f.feedstock_batch_id = b.feedstock_batch_id`;

export const ENRICHMENT = `
  SELECT e.enrichment_batch_id, e.batch_code, e.biochar_batch_id, b.batch_code AS biochar_batch_code,
         e.enrichment_type, e.microbial_formula, e.nutrient_formula, e.ratio_desc,
         e.started_on::text AS started_on, e.finished_on::text AS finished_on, e.incubation_days, e.notes,
         (SELECT count(*) FROM biochar.enrichment_results r WHERE r.enrichment_batch_id = e.enrichment_batch_id) AS result_count
  FROM biochar.enrichment_batches e
  JOIN biochar.biochar_batches b ON b.biochar_batch_id = e.biochar_batch_id`;

export const ENRICHMENT_RESULTS = `
  SELECT r.enrichment_result_id, r.enrichment_batch_id, e.batch_code AS enrichment_batch_code,
         r.parameter_code, r.value, r.unit, r.measured_on::text AS measured_on, r.method, r.pass_flag
  FROM biochar.enrichment_results r
  JOIN biochar.enrichment_batches e ON e.enrichment_batch_id = r.enrichment_batch_id`;

// Nơi lô biochar / lô làm giàu được dùng ngoài đồng: nghiệm thức -> ô
export const USAGE = `
  SELECT t.treatment_id, t.treatment_code, t.name AS treatment_name, e.experiment_code,
         COALESCE(json_agg(json_build_object(
             'plot_code', p.plot_code, 'applied_on', a.applied_on::text,
             'dose_kg_m2', COALESCE(a.actual_dose_kg_m2, t.biochar_dose_kg_m2))
           ORDER BY p.plot_code) FILTER (WHERE a.application_id IS NOT NULL), '[]') AS plots
  FROM experiment.treatments t
  JOIN experiment.experiments e ON e.experiment_id = t.experiment_id
  LEFT JOIN experiment.treatment_applications a ON a.treatment_id = t.treatment_id
  LEFT JOIN farm.plots p ON p.plot_id = a.plot_id
  WHERE t.biochar_batch_id = ANY($1::uuid[]) OR t.enrichment_batch_id = ANY($2::uuid[])
  GROUP BY t.treatment_id, e.experiment_code
  ORDER BY t.treatment_code`;

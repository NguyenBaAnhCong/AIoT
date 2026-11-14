// Câu SELECT của module experiment (TV3).

export const EXPERIMENTS = `
  SELECT e.experiment_id, e.site_id, s.site_code, e.experiment_code, e.title, e.design_type, e.replicates,
         e.started_on::text AS started_on, e.ended_on::text AS ended_on,
         e.principal_investigator, u.full_name AS principal_investigator_name,
         e.status, e.objective, e.created_at, e.updated_at,
         (SELECT count(*) FROM experiment.treatments t WHERE t.experiment_id = e.experiment_id) AS treatment_count,
         (SELECT count(DISTINCT a.plot_id) FROM experiment.treatment_applications a
            JOIN experiment.treatments t ON t.treatment_id = a.treatment_id
           WHERE t.experiment_id = e.experiment_id) AS plot_count
  FROM experiment.experiments e
  JOIN farm.sites s ON s.site_id = e.site_id
  LEFT JOIN iam.users u ON u.user_id = e.principal_investigator`;

export const TREATMENTS = `
  SELECT t.treatment_id, t.experiment_id, e.experiment_code, t.treatment_code, t.name,
         t.biochar_dose_kg_m2, t.biochar_batch_id, bb.batch_code AS biochar_batch_code,
         t.enrichment_batch_id, eb.batch_code AS enrichment_batch_code,
         t.microbial_formula, t.fertilizer_desc, t.control_flag, t.description,
         (SELECT count(*) FROM experiment.treatment_applications a WHERE a.treatment_id = t.treatment_id) AS application_count
  FROM experiment.treatments t
  JOIN experiment.experiments e ON e.experiment_id = t.experiment_id
  LEFT JOIN biochar.biochar_batches bb ON bb.biochar_batch_id = t.biochar_batch_id
  LEFT JOIN biochar.enrichment_batches eb ON eb.enrichment_batch_id = t.enrichment_batch_id`;

export const APPLICATIONS = `
  SELECT a.application_id, a.treatment_id, t.treatment_code, t.experiment_id, e.experiment_code,
         a.plot_id, p.plot_code, a.crop_season_id, cs.season_code, a.replicate_no,
         a.applied_on::text AS applied_on, a.effective_from, a.effective_to,
         a.actual_dose_kg_m2, COALESCE(a.actual_dose_kg_m2, t.biochar_dose_kg_m2) AS effective_dose_kg_m2,
         a.applied_by, u.full_name AS applied_by_name, a.notes,
         (a.effective_from <= now() AND (a.effective_to IS NULL OR a.effective_to > now())) AS is_active
  FROM experiment.treatment_applications a
  JOIN experiment.treatments t ON t.treatment_id = a.treatment_id
  JOIN experiment.experiments e ON e.experiment_id = t.experiment_id
  JOIN farm.plots p ON p.plot_id = a.plot_id
  LEFT JOIN farm.crop_seasons cs ON cs.crop_season_id = a.crop_season_id
  LEFT JOIN iam.users u ON u.user_id = a.applied_by`;

export const GROWTH_STAGES = `
  SELECT g.growth_stage_id, g.crop_id, c.crop_code, g.stage_code, g.name_vi, g.stage_order,
         g.typical_days_from_planting
  FROM experiment.growth_stages g
  JOIN farm.crops c ON c.crop_id = g.crop_id`;

export const PLOT_GROWTH_STAGES = `
  SELECT pg.plot_growth_stage_id, pg.crop_season_id, cs.season_code, cs.plot_id, p.plot_code,
         pg.growth_stage_id, g.stage_code, g.name_vi AS stage_name, g.stage_order,
         pg.started_at, pg.ended_at, pg.observed_by, u.full_name AS observed_by_name
  FROM experiment.plot_growth_stages pg
  JOIN farm.crop_seasons cs ON cs.crop_season_id = pg.crop_season_id
  JOIN farm.plots p ON p.plot_id = cs.plot_id
  JOIN experiment.growth_stages g ON g.growth_stage_id = pg.growth_stage_id
  LEFT JOIN iam.users u ON u.user_id = pg.observed_by`;

// Bảng so sánh nghiệm thức của một thí nghiệm (màn hình 05)
export const TREATMENT_SUMMARY = `
  SELECT t.treatment_code, t.name, t.control_flag, t.biochar_dose_kg_m2,
         array_agg(DISTINCT p.plot_code ORDER BY p.plot_code) FILTER (WHERE p.plot_code IS NOT NULL) AS plots,
         count(DISTINCT a.application_id) AS applications
  FROM experiment.treatments t
  LEFT JOIN experiment.treatment_applications a ON a.treatment_id = t.treatment_id
  LEFT JOIN farm.plots p ON p.plot_id = a.plot_id
  WHERE t.experiment_id = $1
  GROUP BY t.treatment_id
  ORDER BY t.control_flag DESC, t.biochar_dose_kg_m2, t.treatment_code`;

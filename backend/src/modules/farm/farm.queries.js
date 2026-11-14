// Câu SELECT của module farm (TV3). Cột DATE ép ::text để trả 'YYYY-MM-DD'.

export const SITES = `
  SELECT s.site_id, s.organization_id, s.site_code, s.name, s.province, s.district,
         s.latitude, s.longitude, s.elevation_m, s.climate_zone, s.created_at, s.updated_at,
         (SELECT count(*) FROM farm.plots p WHERE p.site_id = s.site_id) AS plot_count
  FROM farm.sites s`;

// Kèm nghiệm thức đang hiệu lực của ô (dùng cho màn hình 02 và 05)
export const PLOTS = `
  SELECT p.plot_id, p.site_id, s.site_code, p.plot_code, p.area_m2, p.soil_type, p.soil_texture,
         p.latitude, p.longitude, p.boundary_geojson, p.block_no, p.status, p.created_at, p.updated_at,
         cur.treatment_id AS current_treatment_id, cur.treatment_code AS current_treatment_code,
         cur.biochar_dose_kg_m2 AS current_biochar_dose_kg_m2
  FROM farm.plots p
  JOIN farm.sites s ON s.site_id = p.site_id
  LEFT JOIN LATERAL (
      SELECT t.treatment_id, t.treatment_code, COALESCE(a.actual_dose_kg_m2, t.biochar_dose_kg_m2) AS biochar_dose_kg_m2
      FROM experiment.treatment_applications a
      JOIN experiment.treatments t ON t.treatment_id = a.treatment_id
      WHERE a.plot_id = p.plot_id AND a.effective_from <= now()
        AND (a.effective_to IS NULL OR a.effective_to > now())
      ORDER BY a.effective_from DESC LIMIT 1
  ) cur ON true`;

export const CROPS = `
  SELECT c.crop_id, c.crop_code, c.name_vi, c.scientific_name, c.variety
  FROM farm.crops c`;

export const CROP_SEASONS = `
  SELECT cs.crop_season_id, cs.plot_id, p.plot_code, cs.crop_id, c.crop_code, c.name_vi AS crop_name,
         cs.season_code, cs.planted_on::text AS planted_on, cs.harvested_on::text AS harvested_on,
         cs.planting_density, cs.notes
  FROM farm.crop_seasons cs
  JOIN farm.plots p ON p.plot_id = cs.plot_id
  JOIN farm.crops c ON c.crop_id = cs.crop_id`;

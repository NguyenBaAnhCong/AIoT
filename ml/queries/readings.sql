-- Toàn bộ bản tin cảm biến (kể cả bản tin bị QC đánh dấu) kèm ngữ cảnh nghiệm thức.
-- Dùng cho bài toán phát hiện bất thường.
SELECT r.reading_id,
       s.sensor_code,
       p.plot_code,
       t.treatment_code,
       t.biochar_dose_kg_m2,
       p.soil_type,
       r.measured_at::text AS measured_at,
       r.received_at::text AS received_at,
       r.ph, r.ec, r.soil_moisture, r.soil_temperature, r.n, r.p, r.k,
       r.quality_status,
       array_to_string(r.quality_flags, '|') AS quality_flags,
       r.timestamp_valid
FROM iot.sensor_readings r
JOIN iot.sensors s USING (sensor_id)
JOIN farm.plots p USING (plot_id)
LEFT JOIN experiment.treatment_applications ta
       ON ta.plot_id = r.plot_id
      AND ta.effective_from <= r.measured_at
      AND (ta.effective_to IS NULL OR ta.effective_to > r.measured_at)
LEFT JOIN experiment.treatments t ON t.treatment_id = ta.treatment_id
ORDER BY s.sensor_code, r.measured_at

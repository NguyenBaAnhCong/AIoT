-- Bản ghi của dataset version FROZEN mới nhất: đặc trưng cảm biến, nhãn sức khỏe đất, tập train/val/test.
-- Dùng cho bài toán phân loại sức khỏe đất.
SELECT r.record_id::text AS record_id,
       dv.version_no,
       r.observed_at::text AS observed_at,
       p.plot_code,
       t.treatment_code,
       r.ph, r.ec, r.soil_moisture, r.soil_temperature, r.n, r.p, r.k,
       l.label_code,
       r.split
FROM dataset.dataset_records r
JOIN dataset.dataset_versions dv USING (dataset_version_id)
JOIN farm.plots p ON p.plot_id = r.plot_id
LEFT JOIN experiment.treatments t ON t.treatment_id = r.treatment_id
LEFT JOIN dataset.labels l ON l.label_id = r.label_id
WHERE r.valid_flag
  AND r.dataset_version_id = (SELECT dataset_version_id FROM dataset.dataset_versions
                              WHERE status = 'FROZEN' ORDER BY frozen_at DESC LIMIT 1)
ORDER BY r.observed_at, p.plot_code

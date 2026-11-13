-- Điểm SQI và phân loại sức khỏe đất theo ngày của từng ô.
-- Dùng cho biến thể "dự báo nhãn ngày mai".
SELECT p.plot_code,
       t.treatment_code,
       (s.period_start AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS day,
       s.sqi_value,
       s.health_class
FROM sqi.sqi_scores s
JOIN farm.plots p ON p.plot_id = s.plot_id
LEFT JOIN experiment.treatments t ON t.treatment_id = s.treatment_id
ORDER BY 3, 1

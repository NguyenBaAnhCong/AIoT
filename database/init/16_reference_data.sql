-- =====================================================================
-- 16_reference_data.sql : dữ liệu danh mục bắt buộc
-- (vai trò, quyền, KPI nghiệm thu, luật QC, nhãn, SQI v1.0, luật cảnh báo)
-- =====================================================================

-- ---------- IAM ----------
INSERT INTO iam.roles (role_code, name, description) VALUES
    ('ADMIN',         'Quản trị hệ thống',     'Toàn quyền'),
    ('RESEARCHER',    'Nghiên cứu viên',       'Quản lý thí nghiệm, dataset, SQI, model'),
    ('LAB_TECH',      'Kỹ thuật viên PTN',     'Nhập/duyệt kết quả phòng thí nghiệm'),
    ('FIELD_TECH',    'Kỹ thuật viên hiện trường', 'Thiết bị, hiệu chuẩn, lấy mẫu'),
    ('DATA_ENGINEER', 'Kỹ sư dữ liệu / ML',    'QC dữ liệu, dataset, model, OTA'),
    ('VIEWER',        'Người xem',             'Chỉ đọc dashboard và báo cáo');

INSERT INTO iam.permissions (permission_code, domain, action)
SELECT d || '.' || lower(a), d, a
FROM unnest(ARRAY['farm','experiment','biochar','iot','calibration','laboratory','data_quality',
                  'dataset','sqi','ml','ota','alert','reporting','audit','iam']) d
CROSS JOIN unnest(ARRAY['READ','WRITE']) a
UNION ALL SELECT 'laboratory.approve', 'laboratory', 'APPROVE'
UNION ALL SELECT 'ml.approve',         'ml',         'APPROVE'
UNION ALL SELECT 'ota.deploy',         'ota',        'DEPLOY'
UNION ALL SELECT 'iam.admin',          'iam',        'ADMIN';

INSERT INTO iam.role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM iam.roles r JOIN iam.permissions p ON
     r.role_code = 'ADMIN'
  OR (r.role_code = 'VIEWER'        AND p.action = 'READ' AND p.domain NOT IN ('iam','audit'))
  OR (r.role_code = 'RESEARCHER'    AND (p.action = 'READ' OR p.domain IN ('experiment','biochar','dataset','sqi','alert','reporting'))
                                    AND p.domain NOT IN ('iam'))
  OR (r.role_code = 'LAB_TECH'      AND (p.permission_code IN ('laboratory.read','laboratory.write','laboratory.approve',
                                                               'farm.read','experiment.read','biochar.read','biochar.write')))
  OR (r.role_code = 'FIELD_TECH'    AND (p.permission_code IN ('iot.read','iot.write','calibration.read','calibration.write',
                                                               'farm.read','laboratory.read','laboratory.write','alert.read','alert.write')))
  OR (r.role_code = 'DATA_ENGINEER' AND (p.action = 'READ' OR p.domain IN ('data_quality','dataset','ml','ota','iot'))
                                    AND p.domain NOT IN ('iam') AND p.permission_code <> 'ml.approve');

-- ---------- KPI nghiệm thu (giữ nguyên ngưỡng theo hồ sơ) ----------
INSERT INTO reporting.kpis (kpi_code, name_vi, domain, unit, comparator, target_value) VALUES
    ('DATA_COLLECTION_SUCCESS_PCT', 'Tỷ lệ dữ liệu thu thập thành công', 'iot',          '%',    'GTE', 90),
    ('TIMESTAMP_VALID_PCT',         'Tỷ lệ timestamp hợp lệ',            'iot',          '%',    'GTE', 90),
    ('ERROR_DUPLICATE_PCT',         'Tỷ lệ lỗi/trùng',                    'data_quality', '%',    'LTE', 5),
    ('MISSING_AFTER_QC_PCT',        'Tỷ lệ thiếu sau xử lý',              'data_quality', '%',    'LTE', 5),
    ('VALID_OBSERVATIONS',          'Số quan sát hợp lệ trong dataset',   'dataset',      'obs',  'GTE', 10000),
    ('ML_ACCURACY_PCT',             'Accuracy mô hình',                   'ml',           '%',    'GTE', 90),
    ('ML_PRECISION_PCT',            'Precision mô hình',                  'ml',           '%',    'GTE', 90),
    ('ML_RECALL_PCT',               'Recall mô hình',                     'ml',           '%',    'GTE', 80),
    ('ML_F1_PCT',                   'F1-score mô hình',                   'ml',           '%',    'GTE', 85),
    ('ML_INFERENCE_MS',             'Thời gian suy luận (p95)',           'ml',           'ms',   'LTE', 2000),
    ('OTA_SUCCESS_PCT',             'Tỷ lệ OTA thành công',               'ota',          '%',    'GTE', 95),
    ('OTA_UPDATE_MINUTES',          'Thời gian cập nhật OTA (max)',       'ota',          'phút', 'LTE', 10);

-- ---------- Luật QC cảm biến ----------
INSERT INTO data_quality.quality_rules (rule_code, name, rule_type, parameter_code, min_value, max_value, max_delta, severity) VALUES
    ('PH_RANGE',        'pH ngoài miền vật lý',          'RANGE',          'PH',        0,   14,   NULL, 'ERROR'),
    ('PH_PLAUSIBLE',    'pH bất thường cho đất canh tác','RANGE',          'PH',        3,   10,   NULL, 'WARN'),
    ('EC_RANGE',        'EC ngoài miền đo',              'RANGE',          'EC',        0,   20,   NULL, 'ERROR'),
    ('MOIST_RANGE',     'Độ ẩm ngoài 0–100%',            'RANGE',          'MOISTURE',  0,   100,  NULL, 'ERROR'),
    ('TEMP_RANGE',      'Nhiệt độ đất bất thường',       'RANGE',          'SOIL_TEMP', -5,  60,   NULL, 'ERROR'),
    ('N_RANGE',         'N ngoài miền đo',               'RANGE',          'N',         0,   1999, NULL, 'ERROR'),
    ('P_RANGE',         'P ngoài miền đo',               'RANGE',          'P',         0,   1999, NULL, 'ERROR'),
    ('K_RANGE',         'K ngoài miền đo',               'RANGE',          'K',         0,   1999, NULL, 'ERROR'),
    ('PH_SPIKE',        'pH thay đổi đột ngột',          'RATE_OF_CHANGE', 'PH',        NULL, NULL, 1.0, 'WARN'),
    ('MOIST_SPIKE',     'Độ ẩm thay đổi đột ngột',       'RATE_OF_CHANGE', 'MOISTURE',  NULL, NULL, 25,  'WARN');

-- ---------- Nhãn sức khỏe đất ----------
INSERT INTO dataset.labels (label_code, name_vi, class_order, description) VALUES
    ('VERY_GOOD', 'Rất tốt',    1, 'SQI ≥ 0.80'),
    ('GOOD',      'Tốt',        2, '0.60 ≤ SQI < 0.80'),
    ('FAIR',      'Trung bình', 3, '0.40 ≤ SQI < 0.60'),
    ('POOR',      'Kém',        4, 'SQI < 0.40');

-- ---------- SQI v1.0 (đề xuất ban đầu, cần hiệu chỉnh bằng PCA/chuyên gia) ----------
WITH d AS (
    INSERT INTO sqi.sqi_definitions (version_code, name, method, status, valid_from, description)
    VALUES ('SQI-v1.0', 'SQI tuyến tính có trọng số – cảm biến + lab', 'LINEAR_WEIGHTED', 'ACTIVE', DATE '2026-01-01',
            'Chỉ tiêu cảm biến pH, EC, ẩm, N, P, K và chỉ tiêu lab OC, CEC')
    RETURNING definition_id
),
ind AS (
    INSERT INTO sqi.sqi_indicators (definition_id, parameter_code, source, scoring_function,
                                    lower_limit, upper_limit, optimum_low, optimum_high)
    SELECT d.definition_id, x.* FROM d, (VALUES
        ('PH',       'SENSOR', 'OPTIMUM',        4.0,  8.5,  5.5, 7.0),
        ('EC',       'SENSOR', 'LESS_IS_BETTER', 0.0,  4.0,  NULL, NULL),
        ('MOISTURE', 'SENSOR', 'OPTIMUM',        5.0,  60.0, 20.0, 35.0),
        ('N',        'SENSOR', 'MORE_IS_BETTER', 10.0, 150.0, NULL, NULL),
        ('P',        'SENSOR', 'MORE_IS_BETTER', 5.0,  60.0,  NULL, NULL),
        ('K',        'SENSOR', 'MORE_IS_BETTER', 40.0, 250.0, NULL, NULL),
        ('OC',       'LAB',    'MORE_IS_BETTER', 0.5,  3.0,   NULL, NULL),
        ('CEC',      'LAB',    'MORE_IS_BETTER', 5.0,  25.0,  NULL, NULL)
    ) AS x(parameter_code, source, scoring_function, lower_limit, upper_limit, optimum_low, optimum_high)
    RETURNING definition_id, indicator_id, parameter_code
),
w AS (
    INSERT INTO sqi.sqi_weights (definition_id, indicator_id, weight, weighting_method)
    SELECT ind.definition_id, ind.indicator_id,
           CASE ind.parameter_code WHEN 'PH' THEN 0.18 WHEN 'EC' THEN 0.10 WHEN 'MOISTURE' THEN 0.12
                WHEN 'N' THEN 0.15 WHEN 'P' THEN 0.12 WHEN 'K' THEN 0.12
                WHEN 'OC' THEN 0.13 WHEN 'CEC' THEN 0.08 END,
           'EXPERT'
    FROM ind
    RETURNING definition_id
)
INSERT INTO sqi.sqi_classes (definition_id, class_code, min_value, max_value)
SELECT d.definition_id, c.* FROM d, (VALUES
    ('VERY_GOOD', 0.80, 1.0001), ('GOOD', 0.60, 0.80), ('FAIR', 0.40, 0.60), ('POOR', 0.0, 0.40)
) AS c(class_code, min_value, max_value);

-- ---------- Luật cảnh báo ----------
INSERT INTO alert.alert_rules (rule_code, name, source, parameter_code, condition, threshold_low, threshold_high,
                               class_values, window_minutes, severity, recommendation_category, recommendation_template) VALUES
    ('MOIST_LOW',  'Độ ẩm đất thấp',         'SENSOR', 'MOISTURE', 'LT',      15,   NULL, NULL, 60,  'HIGH',
        'IRRIGATION',    'Tưới bổ sung: độ ẩm trung bình 1 giờ qua {value}% < 15%.'),
    ('MOIST_HIGH', 'Độ ẩm đất quá cao',      'SENSOR', 'MOISTURE', 'GT',      NULL, 45,   NULL, 120, 'MEDIUM',
        'DRAINAGE',      'Kiểm tra thoát nước: độ ẩm {value}% > 45%.'),
    ('PH_OUT',     'pH ngoài khoảng tối ưu', 'SENSOR', 'PH',       'OUTSIDE', 5.0,  7.5,  NULL, 180, 'MEDIUM',
        'LIMING',        'pH {value} ngoài 5.0–7.5: cân nhắc bón vôi / điều chỉnh liều biochar.'),
    ('EC_HIGH',    'EC cao (nguy cơ mặn)',   'SENSOR', 'EC',       'GT',      NULL, 2.0,  NULL, 180, 'HIGH',
        'IRRIGATION',    'EC {value} dS/m > 2.0: rửa mặn, giảm phân bón hóa học.'),
    ('SQI_POOR',   'Sức khỏe đất kém',       'SQI',    NULL,       'CLASS_IN', NULL, NULL, '{POOR}', 1440, 'HIGH',
        'BIOCHAR_DOSE',  'SQI {value} ở mức Kém: xem xét tăng liều biochar làm giàu và bổ sung hữu cơ.'),
    ('ML_ANOMALY', 'AI phát hiện bất thường','ML',     NULL,       'ANOMALY', NULL, 0.8,  NULL, 60,  'MEDIUM',
        'DEVICE_MAINTENANCE', 'Mô hình phát hiện bất thường (score {value}): kiểm tra cảm biến hoặc hiện trường.'),
    ('NODE_OFFLINE','Sensor Node mất kết nối','DEVICE', NULL,      'OFFLINE', NULL, NULL, NULL, 60,  'CRITICAL',
        'DEVICE_MAINTENANCE', 'Node không gửi dữ liệu > 60 phút ({value} phút): kiểm tra nguồn/LoRa.');

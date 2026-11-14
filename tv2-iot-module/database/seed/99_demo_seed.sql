-- =====================================================================
-- 99_demo_seed.sql : DỮ LIỆU DEMO (không chạy trên production)
-- 01 Gateway + 03 Sensor Node / 03 ô / 03 nghiệm thức, đo 15 phút/lần trong 45 ngày
-- => ~12.9k bản tin, có lỗi/trùng/thiếu giả lập để kiểm tra QC và KPI.
-- =====================================================================

SELECT setseed(0.42);

-- Partition theo tháng cho dữ liệu time-series (production: chạy định kỳ bằng pg_cron / job)
SELECT ref.ensure_monthly_partitions('iot.sensor_readings',     DATE '2026-07-01', 6);
SELECT ref.ensure_monthly_partitions('dataset.dataset_records', DATE '2026-07-01', 6);

DO $$
DECLARE
    v_org UUID; v_admin UUID; v_res UUID; v_lab UUID;
    v_site UUID; v_crop UUID; v_exp UUID; v_gw UUID;
    v_fs UUID; v_bc UUID; v_en UUID;
    v_t UUID[] := '{}'; v_plot UUID[] := '{}'; v_node UUID[] := '{}'; v_sensor UUID[] := '{}';
    v_season UUID; v_refdev UUID; v_sess UUID;
    v_start TIMESTAMPTZ := TIMESTAMPTZ '2026-08-01 00:00:00+07';
    v_days  INTEGER := 45;
    v_ts TIMESTAMPTZ; v_rec TIMESTAMPTZ;
    i INTEGER; j INTEGER; k INTEGER;
    v_ph NUMERIC; v_moist NUMERIC; v_ec NUMERIC; v_n NUMERIC; v_p NUMERIC; v_kk NUMERIC; v_temp NUMERIC;
    v_effect NUMERIC; v_hours NUMERIC; v_raw JSONB; v_seq BIGINT;
    v_stage RECORD;
    v_tmp UUID;
BEGIN
    -- ---------- tổ chức, người dùng ----------
    INSERT INTO iam.organizations (code, name) VALUES ('VIEN-NC', 'Viện nghiên cứu Đất & Môi trường')
        RETURNING organization_id INTO v_org;
    INSERT INTO iam.users (organization_id, username, email, full_name) VALUES
        (v_org, 'admin', 'admin@example.test', 'Quản trị viên') RETURNING user_id INTO v_admin;
    INSERT INTO iam.users (organization_id, username, email, full_name) VALUES
        (v_org, 'researcher01', 'researcher01@example.test', 'Nghiên cứu viên 01') RETURNING user_id INTO v_res;
    INSERT INTO iam.users (organization_id, username, email, full_name) VALUES
        (v_org, 'labtech01', 'labtech01@example.test', 'Kỹ thuật viên PTN 01') RETURNING user_id INTO v_lab;
    INSERT INTO iam.user_roles (user_id, role_id)
    SELECT u, r.role_id FROM (VALUES (v_admin, 'ADMIN'), (v_res, 'RESEARCHER'), (v_lab, 'LAB_TECH')) x(u, code)
    JOIN iam.roles r ON r.role_code = x.code;

    -- ---------- địa điểm, ô, cây trồng ----------
    INSERT INTO farm.sites (organization_id, site_code, name, province, district, latitude, longitude, elevation_m)
    VALUES (v_org, 'LN-01', 'Khu thí nghiệm vải Lục Ngạn', 'Bắc Giang', 'Lục Ngạn', 21.378600, 106.555900, 45)
    RETURNING site_id INTO v_site;

    FOR i IN 1..3 LOOP
        INSERT INTO farm.plots (site_id, plot_code, area_m2, soil_type, soil_texture, latitude, longitude, block_no)
        VALUES (v_site, 'P0' || i, 50, 'Feralit đỏ vàng', 'Thịt pha sét',
                21.378600 + i * 0.0002, 106.555900 + i * 0.0002, 1)
        RETURNING plot_id INTO v_tmp; v_plot[i] := v_tmp;
    END LOOP;

    INSERT INTO farm.crops (crop_code, name_vi, scientific_name, variety)
    VALUES ('VAI', 'Vải thiều', 'Litchi chinensis', 'Thanh Hà') RETURNING crop_id INTO v_crop;

    INSERT INTO experiment.growth_stages (crop_id, stage_code, name_vi, stage_order, typical_days_from_planting) VALUES
        (v_crop, 'POST_HARVEST', 'Phục hồi sau thu hoạch', 1, 0),
        (v_crop, 'SHOOT_1',      'Ra lộc thu đợt 1',        2, 15),
        (v_crop, 'SHOOT_2',      'Ra lộc thu đợt 2',        3, 30);

    -- ---------- biochar ----------
    INSERT INTO biochar.feedstock_batches (batch_code, feedstock_type, source_location, collected_on, mass_kg, moisture_pct, pretreatment)
    VALUES ('FS-2026-01', 'LITCHI_PRUNING', 'Vườn vải Lục Ngạn', DATE '2026-07-05', 500, 32.5, 'Phơi khô, băm 3–5 cm')
    RETURNING feedstock_batch_id INTO v_fs;
    INSERT INTO biochar.biochar_batches (batch_code, feedstock_batch_id, produced_on, reactor_type, pyrolysis_temp_c,
        residence_time_min, input_mass_kg, output_mass_kg, ph, ec_ds_m, carbon_pct, ash_pct, surface_area_m2_g,
        cec_cmol_kg, heavy_metals_mg_kg, safety_status)
    VALUES ('BC-2026-01', v_fs, DATE '2026-07-15', 'Lò yếm khí TLUD', 500, 90, 300, 96, 9.1, 1.8, 68.4, 9.2, 245,
            32.0, '{"Pb":2.1,"Cd":0.08,"As":0.6}', 'PASSED')
    RETURNING biochar_batch_id INTO v_bc;
    INSERT INTO biochar.enrichment_batches (batch_code, biochar_batch_id, enrichment_type, microbial_formula,
        nutrient_formula, ratio_desc, started_on, finished_on)
    VALUES ('EN-2026-01', v_bc, 'MIXED', 'Trichoderma + Bacillus subtilis', 'Phân chuồng hoai', 'Biochar:phân 1:1, 10^8 CFU/g',
            DATE '2026-07-16', DATE '2026-07-30')
    RETURNING enrichment_batch_id INTO v_en;
    INSERT INTO biochar.enrichment_results (enrichment_batch_id, parameter_code, value, unit, measured_on, pass_flag) VALUES
        (v_en, 'CFU_TRICHODERMA', 1.2e8, 'CFU/g', DATE '2026-07-30', true),
        (v_en, 'N_TOTAL',         1.35,  '%',     DATE '2026-07-30', true);

    -- ---------- thí nghiệm, nghiệm thức ----------
    INSERT INTO experiment.experiments (site_id, experiment_code, title, design_type, replicates, started_on,
                                        principal_investigator, status)
    VALUES (v_site, 'EXP-BC-2026', 'Ảnh hưởng của biochar phụ phẩm vải đến sức khỏe đất', 'RCBD', 1,
            DATE '2026-08-01', v_res, 'RUNNING')
    RETURNING experiment_id INTO v_exp;

    INSERT INTO experiment.treatments (experiment_id, treatment_code, name, biochar_dose_kg_m2, control_flag)
    VALUES (v_exp, 'T0', 'Đối chứng (không biochar)', 0, true) RETURNING treatment_id INTO v_tmp; v_t[1] := v_tmp;
    INSERT INTO experiment.treatments (experiment_id, treatment_code, name, biochar_dose_kg_m2, biochar_batch_id)
    VALUES (v_exp, 'T1', 'Biochar 1.0 kg/m²', 1.0, v_bc) RETURNING treatment_id INTO v_tmp; v_t[2] := v_tmp;
    INSERT INTO experiment.treatments (experiment_id, treatment_code, name, biochar_dose_kg_m2, biochar_batch_id,
                                       enrichment_batch_id, microbial_formula)
    VALUES (v_exp, 'T2', 'Biochar làm giàu 1.0 kg/m²', 1.0, v_bc, v_en, 'Trichoderma + B. subtilis')
    RETURNING treatment_id INTO v_tmp; v_t[3] := v_tmp;

    FOR i IN 1..3 LOOP
        INSERT INTO farm.crop_seasons (plot_id, crop_id, season_code, planted_on)
        VALUES (v_plot[i], v_crop, '2026-THU', DATE '2026-07-25') RETURNING crop_season_id INTO v_season;

        INSERT INTO experiment.treatment_applications (treatment_id, plot_id, crop_season_id, replicate_no,
                                                       applied_on, effective_from, actual_dose_kg_m2, applied_by)
        VALUES (v_t[i], v_plot[i], v_season, 1, DATE '2026-07-31', v_start, CASE WHEN i = 1 THEN 0 ELSE 1.0 END, v_res);

        FOR v_stage IN SELECT * FROM experiment.growth_stages WHERE crop_id = v_crop ORDER BY stage_order LOOP
            INSERT INTO experiment.plot_growth_stages (crop_season_id, growth_stage_id, started_at, ended_at, observed_by)
            VALUES (v_season, v_stage.growth_stage_id,
                    v_start + (v_stage.stage_order - 1) * INTERVAL '15 days',
                    CASE WHEN v_stage.stage_order < 3 THEN v_start + v_stage.stage_order * INTERVAL '15 days' END,
                    v_res);
        END LOOP;
    END LOOP;

    -- ---------- thiết bị IoT ----------
    INSERT INTO iot.gateways (site_id, gateway_code, hardware_model, serial_no, firmware_version, lorawan_gateway_eui,
                              network_backhaul, local_buffer_capacity_mb, latitude, longitude, installed_at, last_seen_at)
    VALUES (v_site, 'GW01', 'Raspberry Pi 5 + RAK2287', 'RPI5-0001', '1.0.0', 'AA555A0000000001',
            '4G', 2048, 21.378900, 106.556200, v_start - INTERVAL '3 days', v_start + v_days * INTERVAL '1 day')
    RETURNING gateway_id INTO v_gw;

    FOR i IN 1..3 LOOP
        INSERT INTO iot.sensor_nodes (gateway_id, plot_id, node_code, dev_eui, mcu_model, firmware_version,
                                      power_source, sampling_interval_s, installed_at)
        VALUES (v_gw, v_plot[i], 'N0' || i, '70B3D57ED00000' || lpad(i::text, 2, '0'), 'ESP32-S3 + SX1276', '0.9.0',
                'SOLAR', 900, v_start - INTERVAL '2 days')
        RETURNING node_id INTO v_tmp; v_node[i] := v_tmp;
        INSERT INTO iot.sensors (node_id, sensor_code, sensor_model, serial_no, interface, measured_parameters,
                                 install_depth_cm, installed_at)
        VALUES (v_node[i], 'S0' || i, 'Soil 7-in-1 RS485 (pH/EC/ẩm/nhiệt/NPK)', 'SN-7IN1-00' || i, 'RS485',
                '{PH,EC,MOISTURE,SOIL_TEMP,N,P,K}', 20, v_start - INTERVAL '2 days')
        RETURNING sensor_id INTO v_tmp; v_sensor[i] := v_tmp;
        INSERT INTO iot.sensor_configs (node_id, sensor_id, config_version, sampling_interval_s, lora_spreading_factor,
                                        tx_power_dbm, edge_thresholds, valid_from, applied_status, created_by)
        VALUES (v_node[i], v_sensor[i], 1, 900, 9, 14, '{"MOISTURE":{"min":15,"max":45}}',
                v_start - INTERVAL '2 days', 'APPLIED', v_admin);
    END LOOP;

    -- ---------- hiệu chuẩn (pH và độ ẩm, 3 mức × 2 lần lặp) ----------
    INSERT INTO calibration.reference_devices (device_code, name, manufacturer, model, parameters, certificate_no, certified_until)
    VALUES ('REF-PH-01', 'Máy đo pH/EC để bàn', 'Hanna', 'HI5522', '{PH,EC}', 'KD-2026-0153', DATE '2027-06-30')
    RETURNING reference_device_id INTO v_refdev;

    FOR i IN 1..3 LOOP
        INSERT INTO calibration.calibration_sessions (sensor_id, reference_device_id, session_type, performed_at, performed_by, ambient_temp_c)
        VALUES (v_sensor[i], v_refdev, 'LAB', v_start - INTERVAL '2 days', v_admin, 26.5)
        RETURNING session_id INTO v_sess;
        FOR j IN 1..2 LOOP
            INSERT INTO calibration.calibration_points (session_id, parameter_code, reference_value, sensor_value, replicate_no)
            VALUES (v_sess, 'PH', 4.01, 4.01 + 0.15 + (random() - 0.5) * 0.04, j),
                   (v_sess, 'PH', 6.86, 6.86 + 0.12 + (random() - 0.5) * 0.04, j),
                   (v_sess, 'PH', 9.18, 9.18 + 0.08 + (random() - 0.5) * 0.04, j),
                   (v_sess, 'MOISTURE', 10, 11.4 + (random() - 0.5) * 0.6, j),
                   (v_sess, 'MOISTURE', 30, 32.6 + (random() - 0.5) * 0.6, j),
                   (v_sess, 'MOISTURE', 50, 53.8 + (random() - 0.5) * 0.6, j);
        END LOOP;
        PERFORM calibration.compute_results(v_sess);
    END LOOP;

    -- ---------- dữ liệu cảm biến ----------
    FOR i IN 1..3 LOOP
        v_effect := CASE i WHEN 1 THEN 0 WHEN 2 THEN 0.6 ELSE 1.0 END;   -- hiệu ứng nghiệm thức
        v_seq := 0;
        FOR k IN 0 .. v_days * 96 - 1 LOOP
            v_ts := v_start + k * INTERVAL '15 minutes';
            v_seq := v_seq + 1;
            CONTINUE WHEN random() < 0.03;                               -- ~3% mất gói
            v_hours := EXTRACT(EPOCH FROM v_ts - v_start) / 3600;
            v_moist := 22 + 4 * v_effect + 6 * sin(v_hours / 24 * 2 * pi() / 7) - 1.5 * sin(v_hours / 24 * 2 * pi())
                       + (random() - 0.5) * 2;
            v_ph    := 4.9 + 0.9 * v_effect * LEAST(v_hours / 24 / 20, 1) + (random() - 0.5) * 0.2;
            v_ec    := 0.35 + 0.15 * v_effect + (random() - 0.5) * 0.08;
            v_temp  := 26 + 3 * sin((v_hours - 9) / 24 * 2 * pi()) + (random() - 0.5);
            v_n     := 38 + 45 * v_effect + (random() - 0.5) * 10;
            v_p     := 14 + 18 * v_effect + (random() - 0.5) * 5;
            v_kk    := 95 + 70 * v_effect + (random() - 0.5) * 20;
            -- giả lập lỗi cảm biến (~1%)
            IF random() < 0.006 THEN v_moist := 120; END IF;
            IF random() < 0.004 THEN v_ph := 15.2; END IF;
            v_raw := jsonb_build_object('PH', round(v_ph + 0.12, 2), 'EC', round(v_ec, 3),
                                        'MOISTURE', round(v_moist * 1.06 + 0.8, 2),   -- trước hiệu chuẩn
                                        'SOIL_TEMP', round(v_temp, 2),
                                        'N', round(v_n, 1), 'P', round(v_p, 1), 'K', round(v_kk, 1));
            v_rec := v_ts + INTERVAL '20 seconds';
            IF random() < 0.003 THEN v_rec := v_ts - INTERVAL '2 hours'; END IF;   -- đồng hồ node lệch
            PERFORM iot.ingest_reading(v_sensor[i], v_ts, v_raw, v_seq, 3.9::numeric, -97::smallint, 7.5, v_rec);
            IF random() < 0.005 THEN                                     -- gửi lại (store-and-forward)
                PERFORM iot.ingest_reading(v_sensor[i], v_ts, v_raw, v_seq, 3.9::numeric, -97::smallint, 7.5,
                                           v_rec + INTERVAL '10 minutes');
            END IF;
        END LOOP;
    END LOOP;

    -- ---------- phòng thí nghiệm: mẫu hàng tuần ----------
    INSERT INTO laboratory.lab_methods (method_code, parameter_code, name, standard_ref, unit) VALUES
        ('M-PH',  'PH',  'pH KCl',              'TCVN 5979',  'pH'),
        ('M-EC',  'EC',  'EC dịch chiết 1:5',   'TCVN 6650',  'dS/m'),
        ('M-N',   'N',   'N dễ tiêu',           'TCVN 5255',  'mg/kg'),
        ('M-P',   'P',   'P dễ tiêu Bray',      'TCVN 8942',  'mg/kg'),
        ('M-K',   'K',   'K dễ tiêu',           'TCVN 8662',  'mg/kg'),
        ('M-OC',  'OC',  'Walkley-Black',       'TCVN 8941',  '%'),
        ('M-CEC', 'CEC', 'Amoni axetat pH7',    'TCVN 8568',  'cmol/kg');

    FOR i IN 1..3 LOOP
        v_effect := CASE i WHEN 1 THEN 0 WHEN 2 THEN 0.6 ELSE 1.0 END;
        FOR j IN 0..6 LOOP
            WITH s AS (
                INSERT INTO laboratory.soil_samples (sample_code, plot_id, sample_type, sampled_at, depth_from_cm,
                                                     depth_to_cm, near_node_id, composite_of, collected_by, received_at, status)
                VALUES (format('SS-P0%s-W%s', i, j + 1), v_plot[i], 'SOIL',
                        v_start + j * INTERVAL '7 days' + INTERVAL '33 hours', 0, 20, v_node[i], 5, v_lab,
                        v_start + j * INTERVAL '7 days' + INTERVAL '40 hours', 'COMPLETED')
                RETURNING sample_id
            )
            INSERT INTO laboratory.lab_results (sample_id, parameter_code, value, unit, method_id, analyzed_at,
                                                analyst_id, approved_by, result_status)
            SELECT s.sample_id, m.parameter_code,
                   round(CASE m.parameter_code
                       WHEN 'PH'  THEN 4.9 + 0.9 * v_effect * LEAST(j * 7 / 20.0, 1)
                       WHEN 'EC'  THEN 0.35 + 0.15 * v_effect
                       WHEN 'N'   THEN 38 + 45 * v_effect
                       WHEN 'P'   THEN 14 + 18 * v_effect
                       WHEN 'K'   THEN 95 + 70 * v_effect
                       WHEN 'OC'  THEN 1.1 + 1.2 * v_effect + j * 0.03 * v_effect
                       WHEN 'CEC' THEN 8 + 7 * v_effect END * (1 + (random() - 0.5) * 0.06)::numeric, 3),
                   m.unit, m.method_id, v_start + j * INTERVAL '7 days' + INTERVAL '3 days', v_lab, v_res, 'APPROVED'
            FROM s CROSS JOIN laboratory.lab_methods m;
        END LOOP;
    END LOOP;
END;
$$;

-- ---------- QC toàn bộ dữ liệu ----------
SELECT data_quality.run_sensor_checks(TIMESTAMPTZ '2026-08-01 00:00+07', TIMESTAMPTZ '2026-09-15 00:00+07');

-- ---------- Dataset tham chiếu + SQI + nhãn ----------
DO $$
DECLARE
    v_ds UUID; v_ver UUID; v_def UUID;
BEGIN
    INSERT INTO dataset.datasets (dataset_code, name, purpose, site_id, experiment_id, owner_id)
    SELECT 'REF-LN-2026', 'Bộ dữ liệu tham chiếu Lục Ngạn 2026', 'REFERENCE', s.site_id, e.experiment_id, u.user_id
    FROM farm.sites s, experiment.experiments e, iam.users u
    WHERE s.site_code = 'LN-01' AND e.experiment_code = 'EXP-BC-2026' AND u.username = 'researcher01'
    RETURNING dataset_id INTO v_ds;

    INSERT INTO dataset.dataset_versions (dataset_id, version_no, time_from, time_to, aggregation, split_strategy)
    VALUES (v_ds, 1, TIMESTAMPTZ '2026-08-01 00:00+07', TIMESTAMPTZ '2026-09-15 00:00+07', 'RAW', 'BY_TIME')
    RETURNING dataset_version_id INTO v_ver;

    PERFORM dataset.build_version(v_ver);
    SELECT definition_id INTO v_def FROM sqi.sqi_definitions WHERE version_code = 'SQI-v1.0';
    PERFORM sqi.calculate_daily(v_def, v_ver);
    PERFORM sqi.assign_labels(v_def, v_ver);
    PERFORM dataset.freeze_version(v_ver);
END;
$$;

-- ---------- Embedded ML: model, metrics, OTA, suy luận ----------
DO $$
DECLARE
    v_ver UUID; v_m1 UUID; v_mv1 UUID; v_m2 UUID; v_mv2 UUID;
    v_pkg UUID; v_fw UUID; v_dep UUID; v_gw UUID; v_res UUID;
    v_t0 TIMESTAMPTZ := TIMESTAMPTZ '2026-09-08 09:00+07';
    r RECORD;
BEGIN
    SELECT dataset_version_id INTO v_ver FROM dataset.dataset_versions WHERE status = 'FROZEN' LIMIT 1;
    SELECT gateway_id INTO v_gw FROM iot.gateways WHERE gateway_code = 'GW01';
    SELECT user_id INTO v_res FROM iam.users WHERE username = 'researcher01';

    INSERT INTO ml.models (model_code, name, task_type, target, algorithm, owner_id)
    VALUES ('SOIL-HEALTH-CLS', 'Phân loại sức khỏe đất', 'CLASSIFICATION', 'SOIL_HEALTH_CLASS', 'RandomForest→TFLite', v_res)
    RETURNING model_id INTO v_m1;
    INSERT INTO ml.model_versions (model_id, version, dataset_version_id, framework, quantization, artifact_uri,
                                   artifact_sha256, size_kb, input_schema, target_hardware, trained_at)
    VALUES (v_m1, '1.0.0', v_ver, 'TFLITE', 'INT8', 's3://models/soil-health-cls/1.0.0/model.tflite',
            repeat('a1', 32), 184.5, '{"features":["ph","ec","soil_moisture","soil_temperature","n","p","k"]}',
            'Raspberry Pi 5', v_t0 - INTERVAL '2 days')
    RETURNING model_version_id INTO v_mv1;
    INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, metric_name, metric_value) VALUES
        (v_mv1, v_ver, 'TEST', 'ACCURACY', 0.934), (v_mv1, v_ver, 'TEST', 'PRECISION', 0.921),
        (v_mv1, v_ver, 'TEST', 'RECALL', 0.887),   (v_mv1, v_ver, 'TEST', 'F1', 0.903),
        (v_mv1, v_ver, 'VAL',  'ACCURACY', 0.941), (v_mv1, v_ver, 'VAL',  'F1', 0.915);
    PERFORM ml.approve_model_version(v_mv1, v_res);

    INSERT INTO ml.models (model_code, name, task_type, target, algorithm, owner_id)
    VALUES ('SENSOR-ANOMALY', 'Phát hiện bất thường cảm biến', 'ANOMALY_DETECTION', 'SENSOR_ANOMALY', 'Autoencoder', v_res)
    RETURNING model_id INTO v_m2;
    INSERT INTO ml.model_versions (model_id, version, dataset_version_id, framework, quantization, artifact_uri,
                                   artifact_sha256, size_kb, target_hardware, trained_at)
    VALUES (v_m2, '0.3.0', v_ver, 'TFLITE', 'INT8', 's3://models/sensor-anomaly/0.3.0/model.tflite',
            repeat('b2', 32), 96.0, 'Raspberry Pi 5', v_t0 - INTERVAL '2 days')
    RETURNING model_version_id INTO v_mv2;
    INSERT INTO ml.model_metrics (model_version_id, dataset_version_id, split, metric_name, metric_value) VALUES
        (v_mv2, v_ver, 'TEST', 'ACCURACY', 0.912), (v_mv2, v_ver, 'TEST', 'PRECISION', 0.903),
        (v_mv2, v_ver, 'TEST', 'RECALL', 0.842),   (v_mv2, v_ver, 'TEST', 'F1', 0.871);

    -- OTA: gói model -> gateway
    INSERT INTO ota.ota_packages (package_code, package_type, model_version_id, version, artifact_uri, sha256,
                                  size_bytes, compatible_hardware, status, created_by)
    VALUES ('PKG-SHC-1.0.0', 'MODEL', v_mv1, '1.0.0', 's3://ota/soil-health-cls-1.0.0.tar.gz', repeat('c3', 32),
            201000, '{"Raspberry Pi 5"}', 'RELEASED', v_res)
    RETURNING package_id INTO v_pkg;
    INSERT INTO ota.ota_deployments (package_id, gateway_id, initiated_by) VALUES (v_pkg, v_gw, v_res)
        RETURNING deployment_id INTO v_dep;
    UPDATE ota.ota_deployments SET status = 'DOWNLOADING', started_at = v_t0, progress_pct = 10 WHERE deployment_id = v_dep;
    UPDATE ota.ota_deployments SET progress_pct = 80 WHERE deployment_id = v_dep;
    UPDATE ota.ota_deployments SET status = 'VERIFY', integrity_ok = true, compatibility_ok = true WHERE deployment_id = v_dep;
    UPDATE ota.ota_deployments SET status = 'ACTIVE', finished_at = v_t0 + INTERVAL '4 minutes 20 seconds' WHERE deployment_id = v_dep;

    -- OTA: firmware cho 3 node
    INSERT INTO ota.ota_packages (package_code, package_type, version, artifact_uri, sha256, size_bytes,
                                  compatible_hardware, status, created_by)
    VALUES ('PKG-FW-NODE-1.0.0', 'FIRMWARE', '1.0.0', 's3://ota/node-fw-1.0.0.bin', repeat('d4', 32), 1450000,
            '{"ESP32-S3 + SX1276"}', 'RELEASED', v_res)
    RETURNING package_id INTO v_fw;
    FOR r IN SELECT node_id, row_number() OVER (ORDER BY node_code) rn FROM iot.sensor_nodes LOOP
        INSERT INTO ota.ota_deployments (package_id, gateway_id, node_id, initiated_by)
        VALUES (v_fw, v_gw, r.node_id, v_res) RETURNING deployment_id INTO v_dep;
        UPDATE ota.ota_deployments SET status = 'DOWNLOADING', started_at = v_t0 + r.rn * INTERVAL '1 hour' WHERE deployment_id = v_dep;
        UPDATE ota.ota_deployments SET status = 'VERIFY', integrity_ok = true, compatibility_ok = true WHERE deployment_id = v_dep;
        UPDATE ota.ota_deployments SET status = 'ACTIVE',
               finished_at = v_t0 + r.rn * INTERVAL '1 hour' + (5 + r.rn) * INTERVAL '1 minute' WHERE deployment_id = v_dep;
    END LOOP;

    -- Suy luận tại Edge: mỗi giờ, mỗi ô, 7 ngày cuối
    INSERT INTO ml.inference_results (model_version_id, gateway_id, node_id, plot_id, inferred_at, task_type,
                                      input_reading_id, input_features, prediction, predicted_label, confidence, latency_ms)
    SELECT v_mv1, v_gw, sr.node_id, sr.plot_id, sr.measured_at + INTERVAL '5 seconds', 'CLASSIFICATION',
           sr.reading_id,
           jsonb_build_object('ph', sr.ph, 'ec', sr.ec, 'soil_moisture', sr.soil_moisture, 'n', sr.n, 'p', sr.p, 'k', sr.k),
           jsonb_build_object('class', s.health_class), s.health_class,
           round((0.80 + random() * 0.19)::numeric, 4), round((250 + random() * 900)::numeric, 2)
    FROM iot.sensor_readings sr
    JOIN sqi.sqi_scores s ON s.plot_id = sr.plot_id AND sr.measured_at >= s.period_start AND sr.measured_at < s.period_end
    WHERE sr.measured_at >= v_t0 AND sr.quality_status = 'VALID' AND EXTRACT(MINUTE FROM sr.measured_at) = 0;

    INSERT INTO ml.inference_results (model_version_id, gateway_id, node_id, plot_id, inferred_at, task_type,
                                      input_reading_id, prediction, anomaly_score, is_anomaly, latency_ms)
    SELECT v_mv2, v_gw, sr.node_id, sr.plot_id, sr.measured_at + INTERVAL '3 seconds', 'ANOMALY_DETECTION', sr.reading_id,
           jsonb_build_object('anomaly', sr.quality_status <> 'VALID'),
           CASE WHEN sr.quality_status <> 'VALID' THEN 0.9 + random() * 0.09 ELSE random() * 0.3 END,
           sr.quality_status <> 'VALID', round((120 + random() * 300)::numeric, 2)
    FROM iot.sensor_readings sr
    WHERE sr.measured_at >= v_t0;
END;
$$;

-- ---------- Cảnh báo tại vài thời điểm ----------
SELECT alert.evaluate_rules(TIMESTAMPTZ '2026-08-03 14:00+07');
SELECT alert.evaluate_rules(TIMESTAMPTZ '2026-08-20 14:00+07');
SELECT alert.evaluate_rules(TIMESTAMPTZ '2026-09-14 14:00+07');

-- ---------- Kinh tế (giả định) ----------
INSERT INTO reporting.economic_results (experiment_id, treatment_id, plot_id, yield_kg_m2, price_vnd_kg,
       cost_biochar_vnd_ha, cost_fertilizer_vnd_ha, cost_labor_vnd_ha, cost_other_vnd_ha, carbon_sequestered_kg_ha)
SELECT t.experiment_id, t.treatment_id, ta.plot_id,
       CASE t.treatment_code WHEN 'T0' THEN 0.95 WHEN 'T1' THEN 1.10 ELSE 1.22 END,
       25000,
       CASE t.treatment_code WHEN 'T0' THEN 0 ELSE 15000000 END
         + CASE t.treatment_code WHEN 'T2' THEN 4000000 ELSE 0 END,
       12000000, 30000000, 8000000,
       CASE t.treatment_code WHEN 'T0' THEN 0 ELSE 6800 END
FROM experiment.treatments t
JOIN experiment.treatment_applications ta ON ta.treatment_id = t.treatment_id;

SELECT reporting.snapshot_acceptance(TIMESTAMPTZ '2026-08-01 00:00+07', TIMESTAMPTZ '2026-09-15 00:00+07');

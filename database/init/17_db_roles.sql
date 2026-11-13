-- =====================================================================
-- 17_db_roles.sql : tách quyền đọc/ghi theo domain ở mức database
-- Tạo role nhóm NOLOGIN; tài khoản đăng nhập thực tế được GRANT vào các role này.
-- Chạy bằng superuser / owner của database.
-- =====================================================================

DO $$
DECLARE
    s TEXT;
BEGIN
    FOREACH s IN ARRAY ARRAY['ref','iam','farm','experiment','biochar','iot','calibration','laboratory',
                             'data_quality','dataset','sqi','ml','ota','alert','reporting','audit'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = s || '_reader') THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', s || '_reader');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = s || '_writer') THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', s || '_writer');
        END IF;
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I, %I', s, s || '_reader', s || '_writer');
        EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO %I', s, s || '_reader');
        EXECUTE format('GRANT %I TO %I', s || '_reader', s || '_writer');
        EXECUTE format('GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I', s, s || '_writer');
        EXECUTE format('GRANT USAGE ON ALL SEQUENCES IN SCHEMA %I TO %I', s, s || '_writer');
        EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO %I', s, s || '_writer');
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT ON TABLES TO %I', s, s || '_reader');
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT INSERT, UPDATE, DELETE ON TABLES TO %I', s, s || '_writer');
    END LOOP;

    -- audit chỉ được thêm, không sửa/xóa
    EXECUTE 'REVOKE UPDATE, DELETE ON ALL TABLES IN SCHEMA audit FROM audit_writer';

    -- Role cho Edge Gateway: chỉ nạp dữ liệu và kết quả suy luận, cập nhật tiến độ OTA
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edge_gateway') THEN
        CREATE ROLE edge_gateway NOLOGIN;
    END IF;
    GRANT USAGE ON SCHEMA ref, iot, calibration, data_quality, ml, ota TO edge_gateway;
    GRANT SELECT ON iot.sensors, iot.sensor_nodes, iot.sensor_configs, calibration.calibration_results,
                    ota.ota_packages TO edge_gateway;
    GRANT EXECUTE ON FUNCTION iot.ingest_reading(UUID, TIMESTAMPTZ, JSONB, BIGINT, NUMERIC, SMALLINT, NUMERIC, TIMESTAMPTZ)
        TO edge_gateway;
    GRANT INSERT ON ml.inference_results TO edge_gateway;
    GRANT SELECT, UPDATE (status, progress_pct, integrity_ok, compatibility_ok, error_message, finished_at)
        ON ota.ota_deployments TO edge_gateway;

    -- Role cho ứng dụng web/dashboard: đọc toàn bộ, ghi các domain nghiệp vụ
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_backend') THEN
        CREATE ROLE app_backend NOLOGIN;
    END IF;
    GRANT farm_writer, experiment_writer, biochar_writer, iot_writer, calibration_writer, laboratory_writer,
          data_quality_writer, dataset_writer, sqi_writer, ml_writer, ota_writer, alert_writer,
          reporting_writer, iam_writer, audit_writer, ref_reader TO app_backend;
END;
$$;

-- Ví dụ tạo tài khoản đăng nhập (đổi mật khẩu khi triển khai):
-- CREATE ROLE gw_site01 LOGIN PASSWORD '***' IN ROLE edge_gateway;
-- CREATE ROLE webapp    LOGIN PASSWORD '***' IN ROLE app_backend;

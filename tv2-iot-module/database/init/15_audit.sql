-- =====================================================================
-- 15_audit.sql : audit log hệ thống, nhật ký truy cập, trigger ghi thay đổi
-- Ứng dụng đặt người thực hiện bằng: SET LOCAL app.user_id = '<uuid>';
-- =====================================================================

CREATE TABLE audit.audit_logs (
    audit_log_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actor_id        UUID,
    actor_type      VARCHAR(16)  NOT NULL DEFAULT 'USER' CHECK (actor_type IN ('USER','SYSTEM','GATEWAY')),
    db_user         TEXT         NOT NULL DEFAULT current_user,
    schema_name     TEXT         NOT NULL,
    table_name      TEXT         NOT NULL,
    operation       VARCHAR(8)   NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
    record_pk       JSONB,
    old_data        JSONB,
    new_data        JSONB,
    changed_fields  TEXT[],
    application     TEXT         DEFAULT current_setting('application_name', true),
    client_ip       INET
);

CREATE TABLE audit.access_logs (
    access_log_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    user_id         UUID         REFERENCES iam.users(user_id),
    api_key_id      UUID         REFERENCES iam.api_keys(api_key_id),
    action          VARCHAR(16)  NOT NULL
                    CHECK (action IN ('LOGIN','LOGOUT','LOGIN_FAILED','API_CALL','VIEW','EXPORT','DOWNLOAD')),
    resource        TEXT,
    http_method     VARCHAR(8),
    status_code     SMALLINT,
    ip_address      INET,
    user_agent      TEXT
);

CREATE INDEX ix_audit_logs_table_time ON audit.audit_logs(schema_name, table_name, occurred_at);
CREATE INDEX ix_audit_logs_actor      ON audit.audit_logs(actor_id, occurred_at);
CREATE INDEX ix_access_logs_user      ON audit.access_logs(user_id, occurred_at);

-- ---------------------------------------------------------------------
-- Trigger audit chung. TG_ARGV[0] = tên cột khóa chính.
-- Không ghi các cột nhạy cảm (password_hash, key_hash).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_old JSONB := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - 'password_hash' - 'key_hash' END;
    v_new JSONB := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - 'password_hash' - 'key_hash' END;
    v_pk  TEXT  := TG_ARGV[0];
    v_changed TEXT[];
    v_actor TEXT := NULLIF(current_setting('app.user_id', true), '');
BEGIN
    IF TG_OP = 'UPDATE' THEN
        SELECT array_agg(n.key ORDER BY n.key) INTO v_changed
        FROM jsonb_each(v_new) n
        WHERE n.value IS DISTINCT FROM v_old -> n.key
          AND n.key NOT IN ('updated_at','last_seen_at','battery_v');   -- trường heartbeat, không audit
        IF v_changed IS NULL THEN RETURN NULL; END IF;     -- không có thay đổi đáng kể
    END IF;

    INSERT INTO audit.audit_logs (actor_id, actor_type, schema_name, table_name, operation,
                                  record_pk, old_data, new_data, changed_fields)
    VALUES (v_actor::uuid,
            CASE WHEN v_actor IS NULL THEN 'SYSTEM' ELSE 'USER' END,
            TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP,
            jsonb_build_object(v_pk, COALESCE(v_new, v_old) -> v_pk),
            v_old, v_new, v_changed);
    RETURN NULL;
END;
$$;

-- Gắn audit cho các bảng quan trọng ("All critical changes → audit")
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN SELECT * FROM (VALUES
        ('iam.users',                         'user_id'),
        ('iam.user_roles',                    'user_id'),
        ('iam.role_permissions',              'role_id'),
        ('iam.api_keys',                      'api_key_id'),
        ('farm.plots',                        'plot_id'),
        ('experiment.experiments',            'experiment_id'),
        ('experiment.treatments',             'treatment_id'),
        ('experiment.treatment_applications', 'application_id'),
        ('biochar.biochar_batches',           'biochar_batch_id'),
        ('iot.gateways',                      'gateway_id'),
        ('iot.sensor_nodes',                  'node_id'),
        ('iot.sensor_configs',                'config_id'),
        ('calibration.calibration_results',   'calibration_result_id'),
        ('laboratory.lab_results',            'lab_result_id'),
        ('data_quality.quality_rules',        'rule_id'),
        ('dataset.dataset_versions',          'dataset_version_id'),
        ('sqi.sqi_definitions',               'definition_id'),
        ('sqi.sqi_indicators',                'indicator_id'),
        ('sqi.sqi_weights',                   'weight_id'),
        ('ml.model_versions',                 'model_version_id'),
        ('ota.ota_packages',                  'package_id'),
        ('ota.ota_deployments',               'deployment_id'),
        ('alert.alert_rules',                 'rule_id'),
        ('alert.alerts',                      'alert_id'),
        ('alert.recommendations',             'recommendation_id'),
        ('reporting.kpis',                    'kpi_id')
    ) AS x(tbl, pk) LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON %s
             FOR EACH ROW EXECUTE FUNCTION audit.log_change(%L)', t.tbl, t.pk);
    END LOOP;
END;
$$;

-- Sửa tay dữ liệu cảm biến (CORRECTED) -> lineage vào data_quality.data_audit
CREATE OR REPLACE FUNCTION audit.log_reading_correction()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.quality_status = 'CORRECTED' AND OLD.quality_status IS DISTINCT FROM 'CORRECTED' THEN
        INSERT INTO data_quality.data_audit (source_table, record_id, action, reason, old_value, new_value,
                                             actor_id, actor_type)
        VALUES ('iot.sensor_readings', NEW.reading_id::text, 'CLEAN',
                COALESCE(NULLIF(current_setting('app.change_reason', true), ''), 'Manual correction'),
                jsonb_build_object('ph', OLD.ph, 'ec', OLD.ec, 'soil_moisture', OLD.soil_moisture,
                                   'n', OLD.n, 'p', OLD.p, 'k', OLD.k, 'quality_status', OLD.quality_status),
                jsonb_build_object('ph', NEW.ph, 'ec', NEW.ec, 'soil_moisture', NEW.soil_moisture,
                                   'n', NEW.n, 'p', NEW.p, 'k', NEW.k, 'quality_status', NEW.quality_status),
                NULLIF(current_setting('app.user_id', true), '')::uuid,
                CASE WHEN NULLIF(current_setting('app.user_id', true), '') IS NULL THEN 'SYSTEM' ELSE 'USER' END);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_reading_correction AFTER UPDATE OF quality_status ON iot.sensor_readings
    FOR EACH ROW EXECUTE FUNCTION audit.log_reading_correction();

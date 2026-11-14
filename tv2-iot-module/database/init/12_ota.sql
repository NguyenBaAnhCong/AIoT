-- =====================================================================
-- 12_ota.sql : gói cập nhật mô hình / firmware và triển khai OTA
-- Vòng đời: PENDING → DOWNLOADING → VERIFY → ACTIVE | FAILED → ROLLBACK
-- Tiêu chí: OTA thành công ≥95%, thời gian cập nhật ≤10 phút
-- =====================================================================

CREATE TABLE ota.ota_packages (
    package_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_code    VARCHAR(64)  NOT NULL UNIQUE,
    package_type    VARCHAR(16)  NOT NULL CHECK (package_type IN ('MODEL','FIRMWARE','CONFIG')),
    model_version_id UUID        REFERENCES ml.model_versions(model_version_id),
    version         VARCHAR(32)  NOT NULL,
    artifact_uri    TEXT         NOT NULL,
    sha256          CHAR(64)     NOT NULL,
    signature       TEXT,                                  -- chữ ký số của gói
    size_bytes      BIGINT       NOT NULL CHECK (size_bytes > 0),
    compatible_hardware VARCHAR(64)[] NOT NULL DEFAULT '{}',
    min_firmware_version VARCHAR(32),
    release_notes   TEXT,
    status          VARCHAR(16)  NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','RELEASED','REVOKED')),
    created_by      UUID         REFERENCES iam.users(user_id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (package_type <> 'MODEL' OR model_version_id IS NOT NULL)
);

CREATE TABLE ota.ota_deployments (
    deployment_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id      UUID         NOT NULL REFERENCES ota.ota_packages(package_id),
    gateway_id      UUID         NOT NULL REFERENCES iot.gateways(gateway_id),
    node_id         UUID         REFERENCES iot.sensor_nodes(node_id),   -- NULL = cập nhật chính gateway
    previous_package_id UUID     REFERENCES ota.ota_packages(package_id), -- gói để rollback về
    attempt_no      SMALLINT     NOT NULL DEFAULT 1,
    status          VARCHAR(16)  NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','DOWNLOADING','VERIFY','ACTIVE','FAILED','ROLLBACK')),
    progress_pct    NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
    integrity_ok    BOOLEAN,                               -- checksum/chữ ký khớp
    compatibility_ok BOOLEAN,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    duration_s      NUMERIC GENERATED ALWAYS AS (EXTRACT(EPOCH FROM finished_at - started_at)) STORED,
    error_message   TEXT,
    initiated_by    UUID         REFERENCES iam.users(user_id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at),
    CHECK (status <> 'ACTIVE' OR integrity_ok IS TRUE)     -- không kích hoạt gói sai checksum
);

-- Lịch sử chuyển trạng thái (timeline cho màn hình 11)
CREATE TABLE ota.deployment_events (
    event_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    deployment_id   UUID         NOT NULL REFERENCES ota.ota_deployments(deployment_id) ON DELETE CASCADE,
    from_status     VARCHAR(16),
    to_status       VARCHAR(16)  NOT NULL,
    progress_pct    NUMERIC(5,2),
    message         TEXT,
    occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE ota.rollback_events (
    rollback_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id   UUID         NOT NULL REFERENCES ota.ota_deployments(deployment_id),
    from_package_id UUID         NOT NULL REFERENCES ota.ota_packages(package_id),
    to_package_id   UUID         REFERENCES ota.ota_packages(package_id),
    reason          TEXT         NOT NULL,
    trigger_type    VARCHAR(8)   NOT NULL DEFAULT 'AUTO' CHECK (trigger_type IN ('AUTO','MANUAL')),
    triggered_by    UUID         REFERENCES iam.users(user_id),
    triggered_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    success         BOOLEAN
);

CREATE INDEX ix_ota_deploy_gateway ON ota.ota_deployments(gateway_id, created_at);
CREATE INDEX ix_ota_deploy_status  ON ota.ota_deployments(status);
CREATE INDEX ix_ota_events_deploy  ON ota.deployment_events(deployment_id, occurred_at);

-- ---------------------------------------------------------------------
-- Trigger chuyển trạng thái:
--  * ghi deployment_events
--  * kiểm tra luồng hợp lệ
--  * ACTIVE (gói MODEL)  -> cập nhật model đang chạy trên gateway, model_version = DEPLOYED
--  * ROLLBACK            -> trả gateway về model của previous_package, ghi rollback_events
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ota.on_deployment_status()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_pkg  ota.ota_packages%ROWTYPE;
    v_prev ota.ota_packages%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND NOT (
           (OLD.status = 'PENDING'     AND NEW.status IN ('DOWNLOADING','FAILED'))
        OR (OLD.status = 'DOWNLOADING' AND NEW.status IN ('VERIFY','FAILED'))
        OR (OLD.status = 'VERIFY'      AND NEW.status IN ('ACTIVE','FAILED'))
        OR (OLD.status = 'ACTIVE'      AND NEW.status = 'ROLLBACK')
        OR (OLD.status = 'FAILED'      AND NEW.status = 'ROLLBACK')) THEN
        RAISE EXCEPTION 'Chuyển trạng thái OTA không hợp lệ: % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.status = 'DOWNLOADING' AND NEW.started_at IS NULL THEN
        NEW.started_at := now();
    END IF;
    IF NEW.status IN ('ACTIVE','FAILED') AND NEW.finished_at IS NULL THEN
        NEW.finished_at := now();
    END IF;
    IF NEW.status = 'ACTIVE' THEN
        NEW.progress_pct := 100;
    END IF;

    SELECT * INTO v_pkg FROM ota.ota_packages WHERE package_id = NEW.package_id;

    IF NEW.status = 'ACTIVE' AND v_pkg.package_type = 'MODEL' AND NEW.node_id IS NULL THEN
        UPDATE iot.gateways SET current_model_version_id = v_pkg.model_version_id
        WHERE gateway_id = NEW.gateway_id;
        UPDATE ml.model_versions SET status = 'DEPLOYED'
        WHERE model_version_id = v_pkg.model_version_id;
    ELSIF NEW.status = 'ACTIVE' AND v_pkg.package_type = 'FIRMWARE' THEN
        IF NEW.node_id IS NULL THEN
            UPDATE iot.gateways SET firmware_version = v_pkg.version WHERE gateway_id = NEW.gateway_id;
        ELSE
            UPDATE iot.sensor_nodes SET firmware_version = v_pkg.version WHERE node_id = NEW.node_id;
        END IF;
    END IF;

    IF NEW.status = 'ROLLBACK' THEN
        SELECT * INTO v_prev FROM ota.ota_packages WHERE package_id = NEW.previous_package_id;
        IF v_pkg.package_type = 'MODEL' AND NEW.node_id IS NULL THEN
            UPDATE iot.gateways SET current_model_version_id = v_prev.model_version_id
            WHERE gateway_id = NEW.gateway_id;
        END IF;
        INSERT INTO ota.rollback_events (deployment_id, from_package_id, to_package_id, reason, trigger_type, success)
        VALUES (NEW.deployment_id, NEW.package_id, NEW.previous_package_id,
                COALESCE(NEW.error_message, 'Rollback'),
                CASE WHEN OLD.status = 'FAILED' THEN 'AUTO' ELSE 'MANUAL' END,
                true);
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ota.log_deployment_event()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.progress_pct IS DISTINCT FROM OLD.progress_pct THEN
        INSERT INTO ota.deployment_events (deployment_id, from_status, to_status, progress_pct, message)
        VALUES (NEW.deployment_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
                NEW.status, NEW.progress_pct, NEW.error_message);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_ota_status BEFORE INSERT OR UPDATE OF status ON ota.ota_deployments
    FOR EACH ROW EXECUTE FUNCTION ota.on_deployment_status();
CREATE TRIGGER trg_ota_events AFTER INSERT OR UPDATE ON ota.ota_deployments
    FOR EACH ROW EXECUTE FUNCTION ota.log_deployment_event();

-- KPI OTA
CREATE OR REPLACE VIEW ota.v_ota_kpi AS
SELECT p.package_type,
       count(*) FILTER (WHERE d.status IN ('ACTIVE','FAILED','ROLLBACK'))       AS finished,
       count(*) FILTER (WHERE d.status = 'ACTIVE')                               AS succeeded,
       round(count(*) FILTER (WHERE d.status = 'ACTIVE') * 100.0
             / NULLIF(count(*) FILTER (WHERE d.status IN ('ACTIVE','FAILED','ROLLBACK')), 0), 2) AS success_rate_pct,
       round(avg(d.duration_s) FILTER (WHERE d.status = 'ACTIVE') / 60, 2)       AS avg_duration_min,
       round(max(d.duration_s) FILTER (WHERE d.status = 'ACTIVE') / 60, 2)       AS max_duration_min,
       count(*) FILTER (WHERE d.status = 'ACTIVE' AND d.duration_s > 600)        AS over_10_min
FROM ota.ota_deployments d
JOIN ota.ota_packages p USING (package_id)
GROUP BY p.package_type;

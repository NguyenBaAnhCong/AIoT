-- =====================================================================
-- 05_iot.sql : Edge Gateway, Sensor Node, cảm biến, cấu hình, dữ liệu đọc
-- Kiến trúc theo hồ sơ: 03 Sensor Node + 01 Edge Gateway, LoRa/LoRaWAN,
-- chu kỳ đo 1–15 phút.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tiện ích: tạo partition theo tháng cho bảng partition theo RANGE thời gian
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ref.ensure_monthly_partitions(
    p_parent TEXT,          -- 'iot.sensor_readings'
    p_from   DATE,
    p_months INTEGER
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    v_schema TEXT := split_part(p_parent, '.', 1);
    v_table  TEXT := split_part(p_parent, '.', 2);
    v_start  DATE := date_trunc('month', p_from)::date;
    v_end    DATE;
    v_name   TEXT;
    v_count  INTEGER := 0;
BEGIN
    FOR i IN 0 .. p_months - 1 LOOP
        v_end  := (v_start + INTERVAL '1 month')::date;
        v_name := format('%s_%s', v_table, to_char(v_start, 'YYYYMM'));
        IF to_regclass(format('%I.%I', v_schema, v_name)) IS NULL THEN
            EXECUTE format('CREATE TABLE %I.%I PARTITION OF %I.%I FOR VALUES FROM (%L) TO (%L)',
                           v_schema, v_name, v_schema, v_table, v_start, v_end);
            v_count := v_count + 1;
        END IF;
        v_start := v_end;
    END LOOP;
    RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------
-- Thiết bị
-- ---------------------------------------------------------------------
CREATE TABLE iot.gateways (
    gateway_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id         UUID         NOT NULL REFERENCES farm.sites(site_id),
    gateway_code    VARCHAR(32)  NOT NULL UNIQUE,
    hardware_model  VARCHAR(128),                          -- vd: Raspberry Pi 5 / Jetson Nano
    serial_no       VARCHAR(64)  UNIQUE,
    firmware_version VARCHAR(32),
    current_model_version_id UUID,                         -- FK thêm ở 11_ml.sql
    lorawan_gateway_eui VARCHAR(32),
    network_backhaul VARCHAR(32) CHECK (network_backhaul IN ('4G','WIFI','ETHERNET','SATELLITE')),
    local_buffer_capacity_mb INTEGER,                      -- store-and-forward khi mất mạng
    latitude        DECIMAL(9,6),
    longitude       DECIMAL(9,6),
    status          VARCHAR(16)  NOT NULL DEFAULT 'ONLINE'
                    CHECK (status IN ('ONLINE','OFFLINE','DEGRADED','MAINTENANCE','RETIRED')),
    last_seen_at    TIMESTAMPTZ,
    installed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE iot.sensor_nodes (
    node_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway_id      UUID         NOT NULL REFERENCES iot.gateways(gateway_id),
    plot_id         UUID         NOT NULL REFERENCES farm.plots(plot_id),
    node_code       VARCHAR(32)  NOT NULL UNIQUE,
    dev_eui         VARCHAR(32)  UNIQUE,                   -- LoRaWAN DevEUI
    mcu_model       VARCHAR(64),
    firmware_version VARCHAR(32),
    power_source    VARCHAR(16)  CHECK (power_source IN ('BATTERY','SOLAR','MAINS')),
    sampling_interval_s INTEGER  NOT NULL DEFAULT 900
                    CHECK (sampling_interval_s BETWEEN 60 AND 900),   -- 1–15 phút
    battery_v       NUMERIC(4,2),
    latitude        DECIMAL(9,6),
    longitude       DECIMAL(9,6),
    status          VARCHAR(16)  NOT NULL DEFAULT 'ONLINE'
                    CHECK (status IN ('ONLINE','OFFLINE','LOW_BATTERY','FAULT','MAINTENANCE','RETIRED')),
    last_seen_at    TIMESTAMPTZ,
    installed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Một cảm biến (đầu dò) có thể đo nhiều chỉ tiêu (vd đầu dò 7-in-1 pH/EC/ẩm/nhiệt/NPK)
CREATE TABLE iot.sensors (
    sensor_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id         UUID         NOT NULL REFERENCES iot.sensor_nodes(node_id),
    sensor_code     VARCHAR(32)  NOT NULL UNIQUE,
    sensor_model    VARCHAR(128),
    serial_no       VARCHAR(64),
    interface       VARCHAR(16)  CHECK (interface IN ('RS485','ANALOG','I2C','SDI12','UART')),
    measured_parameters VARCHAR(32)[] NOT NULL,            -- {'PH','EC','MOISTURE','N','P','K'}
    install_depth_cm NUMERIC(5,1),
    installed_at    TIMESTAMPTZ,
    removed_at      TIMESTAMPTZ,
    status          VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','NEEDS_CALIBRATION','FAULT','REMOVED')),
    CHECK (removed_at IS NULL OR installed_at IS NULL OR removed_at > installed_at)
);

-- Cấu hình có phiên bản cho node/sensor (chu kỳ đo, ngưỡng tại edge, ...)
CREATE TABLE iot.sensor_configs (
    config_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id         UUID         NOT NULL REFERENCES iot.sensor_nodes(node_id),
    sensor_id       UUID         REFERENCES iot.sensors(sensor_id),
    config_version  INTEGER      NOT NULL,
    sampling_interval_s INTEGER  NOT NULL CHECK (sampling_interval_s BETWEEN 60 AND 900),
    lora_spreading_factor SMALLINT CHECK (lora_spreading_factor BETWEEN 7 AND 12),
    tx_power_dbm    SMALLINT,
    edge_thresholds JSONB,                                 -- {"PH":{"min":5,"max":8}}
    valid_from      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    valid_to        TIMESTAMPTZ,
    applied_status  VARCHAR(16)  NOT NULL DEFAULT 'PENDING'
                    CHECK (applied_status IN ('PENDING','APPLIED','FAILED','SUPERSEDED')),
    created_by      UUID         REFERENCES iam.users(user_id),
    UNIQUE (node_id, config_version)
);

-- ---------------------------------------------------------------------
-- Dữ liệu đọc cảm biến (time-series, partition theo tháng)
-- PK phải chứa cột partition => (reading_id, measured_at)
-- ---------------------------------------------------------------------
CREATE SEQUENCE iot.sensor_readings_reading_id_seq AS BIGINT;

CREATE TABLE iot.sensor_readings (
    reading_id      BIGINT       NOT NULL DEFAULT nextval('iot.sensor_readings_reading_id_seq'),
    sensor_id       UUID         NOT NULL REFERENCES iot.sensors(sensor_id),
    node_id         UUID         NOT NULL REFERENCES iot.sensor_nodes(node_id),
    gateway_id      UUID         REFERENCES iot.gateways(gateway_id),
    plot_id         UUID         NOT NULL REFERENCES farm.plots(plot_id),
    measured_at     TIMESTAMPTZ  NOT NULL,                 -- thời điểm đo tại node
    received_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),   -- thời điểm server nhận
    seq_no          BIGINT,                                -- số thứ tự gói từ node (phát hiện mất gói)
    ph              NUMERIC(5,2),
    ec              NUMERIC(8,3),                          -- dS/m
    soil_moisture   NUMERIC(5,2),                          -- %
    soil_temperature NUMERIC(5,2),                         -- °C
    n               NUMERIC(8,2),                          -- mg/kg
    p               NUMERIC(8,2),
    k               NUMERIC(8,2),
    battery_v       NUMERIC(4,2),
    rssi_dbm        SMALLINT,
    snr_db          NUMERIC(5,2),
    raw_payload     JSONB,                                 -- giá trị thô trước hiệu chuẩn
    calibration_applied BOOLEAN  NOT NULL DEFAULT false,
    quality_status  VARCHAR(16)  NOT NULL DEFAULT 'RAW'
                    CHECK (quality_status IN ('RAW','VALID','SUSPECT','INVALID','CORRECTED')),
    quality_flags   VARCHAR(32)[] NOT NULL DEFAULT '{}',   -- mã rule vi phạm
    timestamp_valid BOOLEAN,                               -- NULL = chưa kiểm
    PRIMARY KEY (reading_id, measured_at),
    UNIQUE (sensor_id, measured_at)                        -- chống trùng do gửi lại (store-and-forward)
) PARTITION BY RANGE (measured_at);

CREATE TABLE iot.sensor_readings_default PARTITION OF iot.sensor_readings DEFAULT;

CREATE INDEX ix_readings_plot_time   ON iot.sensor_readings (plot_id, measured_at);
CREATE INDEX ix_readings_sensor_time ON iot.sensor_readings (sensor_id, measured_at);
CREATE INDEX ix_readings_quality     ON iot.sensor_readings (quality_status, measured_at);

CREATE INDEX ix_nodes_gateway ON iot.sensor_nodes(gateway_id);
CREATE INDEX ix_nodes_plot    ON iot.sensor_nodes(plot_id);
CREATE INDEX ix_sensors_node  ON iot.sensors(node_id);

CREATE TRIGGER trg_gateways_updated BEFORE UPDATE ON iot.gateways
    FOR EACH ROW EXECUTE FUNCTION ref.set_updated_at();
CREATE TRIGGER trg_nodes_updated BEFORE UPDATE ON iot.sensor_nodes
    FOR EACH ROW EXECUTE FUNCTION ref.set_updated_at();

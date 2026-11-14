CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS iot;
CREATE SCHEMA IF NOT EXISTS calibration;

CREATE TABLE IF NOT EXISTS iot.gateways (
    gateway_id VARCHAR(50) PRIMARY KEY,
    gateway_name VARCHAR(100) NOT NULL,
    location VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'offline',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS iot.devices (
    device_id VARCHAR(50) PRIMARY KEY,
    gateway_id VARCHAR(50) NOT NULL
        REFERENCES iot.gateways(gateway_id),
    device_name VARCHAR(100) NOT NULL,
    device_type VARCHAR(50) NOT NULL DEFAULT 'sensor_node',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS iot.sensor_readings (
    reading_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL UNIQUE,
    device_id VARCHAR(50) NOT NULL
        REFERENCES iot.devices(device_id),
    gateway_id VARCHAR(50) NOT NULL
        REFERENCES iot.gateways(gateway_id),

    sequence BIGINT NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    temperature_c NUMERIC(6,2),
    humidity_pct NUMERIC(6,2),
    soil_moisture_pct NUMERIC(6,2),
    light_lux NUMERIC(12,2),

    battery_v NUMERIC(5,2),
    rssi_dbm INTEGER,

    raw_payload JSONB NOT NULL,

    CONSTRAINT chk_temperature
        CHECK (temperature_c IS NULL OR temperature_c BETWEEN -40 AND 85),

    CONSTRAINT chk_humidity
        CHECK (humidity_pct IS NULL OR humidity_pct BETWEEN 0 AND 100),

    CONSTRAINT chk_soil_moisture
        CHECK (soil_moisture_pct IS NULL OR soil_moisture_pct BETWEEN 0 AND 100),

    CONSTRAINT chk_light
        CHECK (light_lux IS NULL OR light_lux >= 0),

    CONSTRAINT uq_device_sequence
        UNIQUE (device_id, sequence)
);

CREATE TABLE IF NOT EXISTS calibration.calibration_profiles (
    calibration_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(50) NOT NULL
        REFERENCES iot.devices(device_id),
    sensor_type VARCHAR(50) NOT NULL,
    offset_value NUMERIC(10,4) NOT NULL DEFAULT 0,
    scale_factor NUMERIC(10,4) NOT NULL DEFAULT 1,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_calibration_period
        CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_readings_device_time
    ON iot.sensor_readings(device_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_readings_received
    ON iot.sensor_readings(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_calibration_device
    ON calibration.calibration_profiles(device_id);

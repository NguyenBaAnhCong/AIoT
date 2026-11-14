-- =====================================================================
-- 90_timescale_optional.sql : TÙY CHỌN – chỉ chạy khi máy chủ có TimescaleDB
--
-- Bản mặc định dùng declarative partitioning (05_iot.sql). Nếu muốn dùng
-- TimescaleDB, thay khối CREATE TABLE iot.sensor_readings ... PARTITION BY
-- bằng bảng thường (bỏ "PARTITION BY RANGE" và partition default), rồi chạy file này.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;

SELECT create_hypertable('iot.sensor_readings', 'measured_at',
                         chunk_time_interval => INTERVAL '7 days', if_not_exists => true);

-- Nén chunk cũ hơn 30 ngày
ALTER TABLE iot.sensor_readings SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'sensor_id',
    timescaledb.compress_orderby   = 'measured_at DESC'
);
SELECT add_compression_policy('iot.sensor_readings', INTERVAL '30 days');

-- Aggregate liên tục theo giờ cho màn hình Monitoring (03)
CREATE MATERIALIZED VIEW iot.sensor_readings_hourly
WITH (timescaledb.continuous) AS
SELECT time_bucket(INTERVAL '1 hour', measured_at) AS bucket,
       plot_id, sensor_id,
       avg(ph) ph, avg(ec) ec, avg(soil_moisture) soil_moisture, avg(soil_temperature) soil_temperature,
       avg(n) n, avg(p) p, avg(k) k, count(*) n_readings
FROM iot.sensor_readings
WHERE quality_status IN ('VALID','CORRECTED')
GROUP BY bucket, plot_id, sensor_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('iot.sensor_readings_hourly',
    start_offset => INTERVAL '3 days', end_offset => INTERVAL '1 hour', schedule_interval => INTERVAL '30 minutes');

INSERT INTO iot.gateways (
    gateway_id, gateway_name, location, status
)
VALUES (
    'GW-001', 'Greenhouse Gateway 01',
    'Greenhouse Zone A', 'online'
)
ON CONFLICT (gateway_id) DO NOTHING;

INSERT INTO iot.devices (
    device_id, gateway_id, device_name,
    latitude, longitude, status
)
VALUES
    ('SN-001', 'GW-001', 'Sensor Node 01', 21.0285, 105.8542, 'active'),
    ('SN-002', 'GW-001', 'Sensor Node 02', 21.0286, 105.8543, 'active'),
    ('SN-003', 'GW-001', 'Sensor Node 03', 21.0287, 105.8544, 'active')
ON CONFLICT (device_id) DO NOTHING;

INSERT INTO calibration.calibration_profiles (
    device_id, sensor_type, offset_value, scale_factor
)
VALUES
    ('SN-001', 'temperature', 0.2, 1.0),
    ('SN-001', 'humidity', 0.0, 1.0),
    ('SN-002', 'temperature', 0.1, 1.0),
    ('SN-002', 'humidity', 0.0, 1.0),
    ('SN-003', 'temperature', 0.0, 1.0),
    ('SN-003', 'humidity', 0.2, 1.0)
ON CONFLICT DO NOTHING;

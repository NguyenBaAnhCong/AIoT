-- =====================================================================
-- Edge-AIoT giám sát sức khỏe đất – Biochar
-- 00_init.sql : schema, kiểu dùng chung, hàm tiện ích
-- Yêu cầu: PostgreSQL >= 14 (gen_random_uuid() có sẵn trong core)
-- =====================================================================

-- Múi giờ Việt Nam cho date_trunc theo ngày (KPI, SQI ngày). Áp dụng cho session mới.
DO $$ BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone = %L', current_database(), 'Asia/Ho_Chi_Minh');
END $$;
SET timezone = 'Asia/Ho_Chi_Minh';

CREATE SCHEMA IF NOT EXISTS ref;           -- danh mục dùng chung (chỉ tiêu, đơn vị)
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS farm;
CREATE SCHEMA IF NOT EXISTS experiment;
CREATE SCHEMA IF NOT EXISTS biochar;
CREATE SCHEMA IF NOT EXISTS iot;
CREATE SCHEMA IF NOT EXISTS calibration;
CREATE SCHEMA IF NOT EXISTS laboratory;
CREATE SCHEMA IF NOT EXISTS data_quality;
CREATE SCHEMA IF NOT EXISTS dataset;
CREATE SCHEMA IF NOT EXISTS sqi;
CREATE SCHEMA IF NOT EXISTS ml;
CREATE SCHEMA IF NOT EXISTS ota;
CREATE SCHEMA IF NOT EXISTS alert;
CREATE SCHEMA IF NOT EXISTS reporting;
CREATE SCHEMA IF NOT EXISTS audit;

-- ---------------------------------------------------------------------
-- Hàm tự cập nhật updated_at
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ref.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- Danh mục chỉ tiêu đo (dùng chung cho sensor, lab, SQI, QC, alert)
-- ---------------------------------------------------------------------
CREATE TABLE ref.parameters (
    parameter_code  VARCHAR(32)  PRIMARY KEY,           -- PH, EC, MOISTURE, N, P, K, ...
    name_vi         VARCHAR(128) NOT NULL,
    unit            VARCHAR(32)  NOT NULL,
    category        VARCHAR(32)  NOT NULL
                    CHECK (category IN ('SOIL_CHEM','SOIL_PHYS','SOIL_BIO','BIOCHAR','PLANT','ENV')),
    physical_min    NUMERIC,                             -- giới hạn vật lý, dùng cho QC range
    physical_max    NUMERIC,
    description     TEXT
);

INSERT INTO ref.parameters (parameter_code, name_vi, unit, category, physical_min, physical_max) VALUES
    ('PH',          'pH đất',                 'pH',      'SOIL_CHEM', 0,    14),
    ('EC',          'Độ dẫn điện',            'dS/m',    'SOIL_CHEM', 0,    20),
    ('MOISTURE',    'Độ ẩm đất',              '%',       'SOIL_PHYS', 0,    100),
    ('SOIL_TEMP',   'Nhiệt độ đất',           '°C',      'SOIL_PHYS', -10,  70),
    ('N',           'Đạm (N)',                'mg/kg',   'SOIL_CHEM', 0,    2000),
    ('P',           'Lân (P)',                'mg/kg',   'SOIL_CHEM', 0,    2000),
    ('K',           'Kali (K)',               'mg/kg',   'SOIL_CHEM', 0,    2000),
    ('OC',          'Cacbon hữu cơ',          '%',       'SOIL_CHEM', 0,    60),
    ('CEC',         'Dung tích hấp thu',      'cmol/kg', 'SOIL_CHEM', 0,    200),
    ('BULK_DENSITY','Dung trọng',             'g/cm3',   'SOIL_PHYS', 0.5,  2.5),
    ('MICROBIAL_C', 'Sinh khối vi sinh vật C','mg/kg',   'SOIL_BIO',  0,    5000),
    ('YIELD',       'Năng suất',              'kg/m2',   'PLANT',     0,    100);

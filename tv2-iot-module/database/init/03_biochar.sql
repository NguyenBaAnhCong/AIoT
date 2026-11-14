-- =====================================================================
-- 03_biochar.sql : phụ phẩm cây vải, lô biochar, nhiệt phân, làm giàu
-- (tạo trước experiment vì nghiệm thức tham chiếu lô biochar)
-- =====================================================================

CREATE TABLE biochar.feedstock_batches (
    feedstock_batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_code      VARCHAR(32)  NOT NULL UNIQUE,
    feedstock_type  VARCHAR(32)  NOT NULL DEFAULT 'LITCHI_PRUNING'
                    CHECK (feedstock_type IN ('LITCHI_PRUNING','LITCHI_BRANCH','LITCHI_LEAF','LITCHI_PEEL','LITCHI_SEED','MIXED','OTHER')),
    source_location VARCHAR(255),
    collected_on    DATE         NOT NULL,
    mass_kg         NUMERIC(10,2) NOT NULL CHECK (mass_kg > 0),
    moisture_pct    NUMERIC(5,2) CHECK (moisture_pct BETWEEN 0 AND 100),
    pretreatment    VARCHAR(255),                          -- phơi, băm, nghiền...
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE biochar.biochar_batches (
    biochar_batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_code      VARCHAR(32)  NOT NULL UNIQUE,
    feedstock_batch_id UUID      NOT NULL REFERENCES biochar.feedstock_batches(feedstock_batch_id),
    produced_on     DATE         NOT NULL,
    -- thông số nhiệt phân
    reactor_type    VARCHAR(64),
    pyrolysis_temp_c NUMERIC(6,1) CHECK (pyrolysis_temp_c BETWEEN 200 AND 1000),
    residence_time_min NUMERIC(7,1) CHECK (residence_time_min > 0),
    heating_rate_c_min NUMERIC(6,2),
    input_mass_kg   NUMERIC(10,2) CHECK (input_mass_kg > 0),
    output_mass_kg  NUMERIC(10,2) CHECK (output_mass_kg >= 0),
    yield_pct       NUMERIC(5,2) GENERATED ALWAYS AS
                    (CASE WHEN input_mass_kg > 0 THEN round(output_mass_kg / input_mass_kg * 100, 2) END) STORED,
    -- chỉ tiêu chất lượng
    ph              NUMERIC(4,2) CHECK (ph BETWEEN 0 AND 14),
    ec_ds_m         NUMERIC(8,3),
    carbon_pct      NUMERIC(5,2) CHECK (carbon_pct BETWEEN 0 AND 100),
    ash_pct         NUMERIC(5,2) CHECK (ash_pct BETWEEN 0 AND 100),
    surface_area_m2_g NUMERIC(8,2),
    cec_cmol_kg     NUMERIC(8,2),
    -- an toàn: kim loại nặng, PAH ... {"Pb":1.2,"Cd":0.1,"As":0.5}
    heavy_metals_mg_kg JSONB,
    safety_status   VARCHAR(16)  NOT NULL DEFAULT 'PENDING'
                    CHECK (safety_status IN ('PENDING','PASSED','FAILED')),
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (output_mass_kg IS NULL OR input_mass_kg IS NULL OR output_mass_kg <= input_mass_kg)
);

-- Làm giàu biochar (vi sinh, dinh dưỡng)
CREATE TABLE biochar.enrichment_batches (
    enrichment_batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_code      VARCHAR(32)  NOT NULL UNIQUE,
    biochar_batch_id UUID        NOT NULL REFERENCES biochar.biochar_batches(biochar_batch_id),
    enrichment_type VARCHAR(32)  NOT NULL
                    CHECK (enrichment_type IN ('MICROBIAL','NUTRIENT','COMPOST','MIXED')),
    microbial_formula VARCHAR(255),                        -- chủng / chế phẩm vi sinh
    nutrient_formula  VARCHAR(255),
    ratio_desc      VARCHAR(255),                          -- tỉ lệ phối trộn
    started_on      DATE         NOT NULL,
    finished_on     DATE,
    incubation_days INTEGER GENERATED ALWAYS AS (finished_on - started_on) STORED,
    notes           TEXT,
    CHECK (finished_on IS NULL OR finished_on >= started_on)
);

CREATE TABLE biochar.enrichment_results (
    enrichment_result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrichment_batch_id UUID     NOT NULL REFERENCES biochar.enrichment_batches(enrichment_batch_id) ON DELETE CASCADE,
    parameter_code  VARCHAR(32)  NOT NULL,                 -- có thể là chỉ tiêu ngoài ref.parameters (vd CFU)
    value           NUMERIC      NOT NULL,
    unit            VARCHAR(32)  NOT NULL,
    measured_on     DATE         NOT NULL,
    method          VARCHAR(255),
    pass_flag       BOOLEAN
);

CREATE INDEX ix_biochar_batches_feedstock ON biochar.biochar_batches(feedstock_batch_id);
CREATE INDEX ix_enrichment_batches_biochar ON biochar.enrichment_batches(biochar_batch_id);

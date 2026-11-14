-- =====================================================================
-- 04_experiment.sql : thí nghiệm, nghiệm thức, áp dụng lên ô, giai đoạn sinh trưởng
-- Quan hệ plot ↔ treatment đi qua treatment_applications (N–N theo thời gian).
-- =====================================================================

CREATE TABLE experiment.experiments (
    experiment_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id         UUID         NOT NULL REFERENCES farm.sites(site_id),
    experiment_code VARCHAR(32)  NOT NULL UNIQUE,
    title           VARCHAR(255) NOT NULL,
    design_type     VARCHAR(32)  NOT NULL DEFAULT 'RCBD'
                    CHECK (design_type IN ('CRD','RCBD','SPLIT_PLOT','FACTORIAL','OBSERVATIONAL')),
    replicates      SMALLINT     NOT NULL DEFAULT 3 CHECK (replicates > 0),
    started_on      DATE         NOT NULL,
    ended_on        DATE,
    principal_investigator UUID  REFERENCES iam.users(user_id),
    status          VARCHAR(16)  NOT NULL DEFAULT 'PLANNED'
                    CHECK (status IN ('PLANNED','RUNNING','COMPLETED','CANCELLED')),
    objective       TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (ended_on IS NULL OR ended_on >= started_on)
);

CREATE TABLE experiment.treatments (
    treatment_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id   UUID         NOT NULL REFERENCES experiment.experiments(experiment_id),
    treatment_code  VARCHAR(32)  NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    biochar_dose_kg_m2 NUMERIC(8,3) NOT NULL DEFAULT 0 CHECK (biochar_dose_kg_m2 >= 0),
    biochar_batch_id   UUID      REFERENCES biochar.biochar_batches(biochar_batch_id),
    enrichment_batch_id UUID     REFERENCES biochar.enrichment_batches(enrichment_batch_id),
    microbial_formula VARCHAR(255),
    fertilizer_desc VARCHAR(255),
    control_flag    BOOLEAN      NOT NULL DEFAULT false,
    description     TEXT,
    -- nghiệm thức đối chứng không bón biochar
    CHECK (NOT control_flag OR biochar_dose_kg_m2 = 0)
);

-- Áp dụng nghiệm thức lên ô (lặp lại, ngày bón, liều thực tế)
CREATE TABLE experiment.treatment_applications (
    application_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_id    UUID         NOT NULL REFERENCES experiment.treatments(treatment_id),
    plot_id         UUID         NOT NULL REFERENCES farm.plots(plot_id),
    crop_season_id  UUID         REFERENCES farm.crop_seasons(crop_season_id),
    replicate_no    SMALLINT     NOT NULL DEFAULT 1,
    applied_on      DATE         NOT NULL,
    effective_from  TIMESTAMPTZ  NOT NULL,
    effective_to    TIMESTAMPTZ,                           -- NULL = đang hiệu lực
    actual_dose_kg_m2 NUMERIC(8,3) CHECK (actual_dose_kg_m2 >= 0),
    applied_by      UUID         REFERENCES iam.users(user_id),
    notes           TEXT,
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Danh mục giai đoạn sinh trưởng theo cây trồng
CREATE TABLE experiment.growth_stages (
    growth_stage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crop_id         UUID         NOT NULL REFERENCES farm.crops(crop_id),
    stage_code      VARCHAR(32)  NOT NULL,                 -- vd: GERMINATION, VEGETATIVE, FLOWERING, FRUITING, HARVEST
    name_vi         VARCHAR(128) NOT NULL,
    stage_order     SMALLINT     NOT NULL,
    typical_days_from_planting INTEGER,
    UNIQUE (crop_id, stage_code),
    UNIQUE (crop_id, stage_order)
);

-- Ghi nhận giai đoạn thực tế trên từng ô / mùa vụ (để đồng bộ dữ liệu theo giai đoạn)
CREATE TABLE experiment.plot_growth_stages (
    plot_growth_stage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crop_season_id  UUID         NOT NULL REFERENCES farm.crop_seasons(crop_season_id),
    growth_stage_id UUID         NOT NULL REFERENCES experiment.growth_stages(growth_stage_id),
    started_at      TIMESTAMPTZ  NOT NULL,
    ended_at        TIMESTAMPTZ,
    observed_by     UUID         REFERENCES iam.users(user_id),
    CHECK (ended_at IS NULL OR ended_at > started_at),
    UNIQUE (crop_season_id, growth_stage_id)
);

CREATE INDEX ix_treatments_experiment ON experiment.treatments(experiment_id);
CREATE INDEX ix_treatment_app_plot_time ON experiment.treatment_applications(plot_id, effective_from);
CREATE INDEX ix_plot_growth_stage_time ON experiment.plot_growth_stages(crop_season_id, started_at);

CREATE TRIGGER trg_experiments_updated BEFORE UPDATE ON experiment.experiments
    FOR EACH ROW EXECUTE FUNCTION ref.set_updated_at();

-- ---------------------------------------------------------------------
-- Ngữ cảnh thí nghiệm của một ô tại một thời điểm:
-- nghiệm thức, liều biochar, loại đất, mùa vụ, giai đoạn sinh trưởng.
-- Dùng khi chuẩn hóa dữ liệu vào dataset.dataset_records.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION experiment.plot_context_at(p_plot_id UUID, p_at TIMESTAMPTZ)
RETURNS TABLE (
    plot_id UUID, site_id UUID, soil_type VARCHAR, treatment_id UUID,
    biochar_dose_kg_m2 NUMERIC, crop_season_id UUID, growth_stage_id UUID
)
LANGUAGE sql STABLE AS $$
    SELECT p.plot_id, p.site_id, p.soil_type,
           ta.treatment_id,
           COALESCE(ta.actual_dose_kg_m2, t.biochar_dose_kg_m2),
           cs.crop_season_id,
           pgs.growth_stage_id
    FROM farm.plots p
    LEFT JOIN LATERAL (
        SELECT * FROM experiment.treatment_applications a
        WHERE a.plot_id = p.plot_id
          AND a.effective_from <= p_at
          AND (a.effective_to IS NULL OR a.effective_to > p_at)
        ORDER BY a.effective_from DESC LIMIT 1
    ) ta ON true
    LEFT JOIN experiment.treatments t ON t.treatment_id = ta.treatment_id
    LEFT JOIN LATERAL (
        SELECT * FROM farm.crop_seasons c
        WHERE c.plot_id = p.plot_id
          AND c.planted_on <= p_at::date
          AND (c.harvested_on IS NULL OR c.harvested_on >= p_at::date)
        ORDER BY c.planted_on DESC LIMIT 1
    ) cs ON true
    LEFT JOIN LATERAL (
        SELECT * FROM experiment.plot_growth_stages g
        WHERE g.crop_season_id = cs.crop_season_id
          AND g.started_at <= p_at
          AND (g.ended_at IS NULL OR g.ended_at > p_at)
        ORDER BY g.started_at DESC LIMIT 1
    ) pgs ON true
    WHERE p.plot_id = p_plot_id;
$$;

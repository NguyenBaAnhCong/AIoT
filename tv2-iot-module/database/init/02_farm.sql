-- =====================================================================
-- 02_farm.sql : địa điểm, ô thí nghiệm, cây trồng, mùa vụ
-- =====================================================================

CREATE TABLE farm.sites (
    site_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         REFERENCES iam.organizations(organization_id),
    site_code       VARCHAR(32)  NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    province        VARCHAR(128),
    district        VARCHAR(128),
    latitude        DECIMAL(9,6) CHECK (latitude  BETWEEN -90  AND 90),
    longitude       DECIMAL(9,6) CHECK (longitude BETWEEN -180 AND 180),
    elevation_m     NUMERIC(7,2),
    climate_zone    VARCHAR(64),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE farm.plots (
    plot_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id         UUID         NOT NULL REFERENCES farm.sites(site_id),
    plot_code       VARCHAR(32)  NOT NULL,
    area_m2         NUMERIC(10,2) NOT NULL CHECK (area_m2 > 0),
    soil_type       VARCHAR(64)  NOT NULL,                 -- vd: Feralit, Phù sa, Xám bạc màu
    soil_texture    VARCHAR(64),
    latitude        DECIMAL(9,6) CHECK (latitude  BETWEEN -90  AND 90),
    longitude       DECIMAL(9,6) CHECK (longitude BETWEEN -180 AND 180),
    boundary_geojson JSONB,                                -- polygon cho bản đồ (màn hình 02)
    block_no        SMALLINT,                              -- khối lặp (RCBD)
    status          VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','FALLOW','INACTIVE','RETIRED')),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (site_id, plot_code)
);

CREATE TABLE farm.crops (
    crop_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crop_code       VARCHAR(32)  NOT NULL UNIQUE,
    name_vi         VARCHAR(128) NOT NULL,
    scientific_name VARCHAR(128),
    variety         VARCHAR(128)
);

CREATE TABLE farm.crop_seasons (
    crop_season_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plot_id         UUID         NOT NULL REFERENCES farm.plots(plot_id),
    crop_id         UUID         NOT NULL REFERENCES farm.crops(crop_id),
    season_code     VARCHAR(32)  NOT NULL,                 -- vd: 2026-XUAN
    planted_on      DATE         NOT NULL,
    harvested_on    DATE,
    planting_density NUMERIC(10,2),
    notes           TEXT,
    CHECK (harvested_on IS NULL OR harvested_on >= planted_on),
    UNIQUE (plot_id, season_code)
);

CREATE INDEX ix_plots_site ON farm.plots(site_id);
CREATE INDEX ix_crop_seasons_plot ON farm.crop_seasons(plot_id, planted_on);

CREATE TRIGGER trg_sites_updated BEFORE UPDATE ON farm.sites
    FOR EACH ROW EXECUTE FUNCTION ref.set_updated_at();
CREATE TRIGGER trg_plots_updated BEFORE UPDATE ON farm.plots
    FOR EACH ROW EXECUTE FUNCTION ref.set_updated_at();

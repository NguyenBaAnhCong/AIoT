-- =====================================================================
-- 01_iam.sql : người dùng, vai trò, tổ chức, quyền truy cập
-- =====================================================================

CREATE TABLE iam.organizations (
    organization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(32)  NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    org_type        VARCHAR(32)  NOT NULL DEFAULT 'RESEARCH'
                    CHECK (org_type IN ('RESEARCH','UNIVERSITY','FARM','COMPANY','GOVERNMENT')),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE iam.users (
    user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         REFERENCES iam.organizations(organization_id),
    username        VARCHAR(64)  NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    full_name       VARCHAR(255) NOT NULL,
    password_hash   TEXT,                                  -- chỉ lưu hash (bcrypt/argon2)
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE iam.roles (
    role_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_code       VARCHAR(32)  NOT NULL UNIQUE,         -- ADMIN, RESEARCHER, LAB_TECH, FIELD_TECH, DATA_ENGINEER, VIEWER
    name            VARCHAR(128) NOT NULL,
    description     TEXT
);

CREATE TABLE iam.permissions (
    permission_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_code VARCHAR(64)  NOT NULL UNIQUE,         -- vd: iot.read, dataset.write, ota.deploy
    domain          VARCHAR(32)  NOT NULL,                -- trùng tên schema
    action          VARCHAR(16)  NOT NULL CHECK (action IN ('READ','WRITE','APPROVE','DEPLOY','ADMIN')),
    description     TEXT
);

CREATE TABLE iam.role_permissions (
    role_id         UUID NOT NULL REFERENCES iam.roles(role_id) ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES iam.permissions(permission_id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE iam.user_roles (
    user_id         UUID NOT NULL REFERENCES iam.users(user_id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES iam.roles(role_id) ON DELETE CASCADE,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by      UUID REFERENCES iam.users(user_id),
    PRIMARY KEY (user_id, role_id)
);

-- API key cho tích hợp / Edge Gateway (màn hình 14). Chỉ lưu hash.
CREATE TABLE iam.api_keys (
    api_key_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id   UUID REFERENCES iam.users(user_id),
    key_prefix      VARCHAR(16)  NOT NULL,                -- hiển thị dạng "ak_12ab…"
    key_hash        TEXT         NOT NULL UNIQUE,
    scopes          TEXT[]       NOT NULL DEFAULT '{}',
    expires_at      TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON iam.organizations
    FOR EACH ROW EXECUTE FUNCTION ref.set_updated_at();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON iam.users
    FOR EACH ROW EXECUTE FUNCTION ref.set_updated_at();

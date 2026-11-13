-- TV1: thêm nhãn cho API key (để màn hình Quản trị hiển thị "Gateway khu A") và
-- index giúp tra "lần dùng gần nhất" của một key.
ALTER TABLE iam.api_keys ADD COLUMN IF NOT EXISTS label VARCHAR(128);
CREATE INDEX IF NOT EXISTS ix_access_logs_api_key ON audit.access_logs (api_key_id, occurred_at DESC)
    WHERE api_key_id IS NOT NULL;

// Đọc và kiểm tra biến môi trường một lần duy nhất.
import { fileURLToPath } from 'node:url';

const required = ['DATABASE_URL'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Thiếu biến môi trường ${key}. Hãy tạo file .env từ .env.example`);
    process.exit(1);
  }
}

const nodeEnv = process.env.NODE_ENV || 'development';
const DEFAULT_SECRET = 'doi-chuoi-nay-thanh-mot-chuoi-ngau-nhien-dai';
const jwtSecret = process.env.JWT_SECRET || DEFAULT_SECRET;

if (nodeEnv === 'production' && (jwtSecret === DEFAULT_SECRET || jwtSecret.length < 32)) {
  console.error('JWT_SECRET chưa đặt hoặc quá yếu (cần >= 32 ký tự) khi NODE_ENV=production');
  process.exit(1);
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || process.env.BACKEND_PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret,
  accessTtl: process.env.JWT_ACCESS_TTL || '30m',
  refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
  trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
  migrationsDir: process.env.MIGRATIONS_DIR || fileURLToPath(new URL('../../../database/migrations', import.meta.url)),
  runMigrationsOnStart: process.env.RUN_MIGRATIONS_ON_START !== 'false',
  // Mật khẩu mặc định cho user demo (chỉ dùng ngoài production)
  seedDevPasswords: process.env.SEED_DEV_PASSWORDS !== 'false',
  devDefaultPassword: process.env.DEV_DEFAULT_PASSWORD || 'Biochar@2026',
};
export const isProd = nodeEnv === 'production';

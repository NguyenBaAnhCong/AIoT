// Đọc và kiểm tra biến môi trường một lần duy nhất.
const required = ['DATABASE_URL'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Thiếu biến môi trường ${key}. Hãy tạo file .env từ .env.example`);
    process.exit(1);
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || process.env.BACKEND_PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
  migrationsDir: process.env.MIGRATIONS_DIR || new URL('../../../database/migrations', import.meta.url).pathname,
};
export const isProd = env.nodeEnv === 'production';

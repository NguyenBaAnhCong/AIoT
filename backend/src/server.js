import app from './app.js';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { runMigrations } from './migrate.js';
import { ensureDevPasswords } from './lib/devSeed.js';
import { startQcJob } from './modules/data-quality/qc-job.js';

try {
  if (env.runMigrationsOnStart) await runMigrations();
  await ensureDevPasswords();
} catch (err) {
  console.error('Khởi động thất bại:', err.message);
  process.exit(1);
}

const server = app.listen(env.port, () => {
  console.log(`Backend chạy tại http://localhost:${env.port}/api/v1/health`);
  startQcJob(); // TV4
});

// Tắt êm khi nhận tín hiệu dừng (docker stop, Ctrl+C)
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(async () => { await pool.end(); process.exit(0); });
  });
}

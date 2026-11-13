import app from './app.js';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { startQcJob } from './modules/data-quality/qc-job.js';

const server = app.listen(env.port, () => {
  console.log(`Backend chạy tại http://localhost:${env.port}/api/v1/health`);
  startQcJob();
});

// Tắt êm khi nhận tín hiệu dừng (docker stop, Ctrl+C)
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(async () => { await pool.end(); process.exit(0); });
  });
}

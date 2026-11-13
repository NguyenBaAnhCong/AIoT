import { db } from './db.mjs';
import { evaluate } from './alerts.mjs';
import { calculate } from './sqi-admin.mjs';

const at = process.argv[2] || '2026-08-21T14:00:00+07:00';
try {
  const { rows: [target] } = await db.query(`
    SELECT s.definition_id, s.dataset_version_id, d.version_code, dv.status
    FROM sqi.sqi_scores s
    JOIN sqi.sqi_definitions d USING (definition_id)
    JOIN dataset.dataset_versions dv USING (dataset_version_id)
    WHERE d.status='ACTIVE' AND dv.status IN ('BUILT','FROZEN')
    ORDER BY s.period_start DESC, s.sqi_score_id LIMIT 1
  `);
  if (!target) throw new Error('Cần điểm SQI demo từ một phiên bản ACTIVE và dataset BUILT hoặc FROZEN.');
  const { definition_id: definition, dataset_version_id: dataset, status, version_code: code } = target;
  const sqi = await calculate(db, definition, dataset, status === 'BUILT', { preview: true });
  console.log(`SQI ${code} · dataset ${status} · ${sqi.scores} điểm được tính thử`);
  if (sqi.labels != null) console.log(`Nhãn được gán thử: ${sqi.labels}`);
  else console.log('Bỏ qua gán nhãn vì dataset đã đóng băng.');
  const alerts = await evaluate(db, at, { preview: true });
  console.log(`Cảnh báo tại ${at}: ${alerts.created} cảnh báo mới khi chạy thử`);
  for (const alert of alerts.alerts) console.log(`  [${alert.severity}] ${alert.message}`);
  console.log('Đã hoàn tác dữ liệu chạy thử. Không gửi Telegram.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}

import { setTimeout as delay } from 'node:timers/promises';
import { db } from './db.mjs';
import { evaluate } from './alerts.mjs';
import { calculate } from './sqi-admin.mjs';

const { TV5_TELEGRAM_TOKEN: token, TV5_TELEGRAM_CHAT: chat, TV5_DATASET_ID: dataset } = process.env;
const alertMinutes = Number(process.env.TV5_ALERT_MINUTES || 15);
const sqiMinutes = Number(process.env.TV5_SQI_MINUTES || 1440);
const once = process.argv.includes('--once');
let failed = false;
if (![alertMinutes, sqiMinutes].every(value => Number.isInteger(value) && value >= 1 && value <= 10080)) {
  throw new Error('TV5_ALERT_MINUTES và TV5_SQI_MINUTES phải từ 1 đến 10080.');
}
if (Boolean(token) !== Boolean(chat)) throw new Error('Telegram cần cả TV5_TELEGRAM_TOKEN và TV5_TELEGRAM_CHAT.');

async function alerts() {
  const result = await evaluate(db);
  console.log(`Cảnh báo mới: ${result.created}`);
  if (!token) return;
  for (const alert of result.alerts) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: `[${alert.severity}] ${alert.message}` }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) console.error(`Telegram HTTP ${response.status} (${alert.alert_id})`);
    } catch {
      console.error(`Telegram không gửi được (${alert.alert_id})`);
    }
  }
}

async function sqi() {
  if (!dataset) {
    console.log('Bỏ qua job SQI. Chưa cấu hình TV5_DATASET_ID.');
    return;
  }
  const { rows: [version] } = await db.query(`
    SELECT definition_id FROM sqi.sqi_definitions WHERE status='ACTIVE' ORDER BY created_at DESC LIMIT 1
  `);
  const { rows: [target] } = await db.query('SELECT status FROM dataset.dataset_versions WHERE dataset_version_id=$1', [dataset]);
  if (!version || target?.status !== 'BUILT') {
    console.log('Bỏ qua job SQI. Cần cấu hình ACTIVE và dataset BUILT.');
    return;
  }
  console.log('SQI:', await calculate(db, version.definition_id, dataset, true));
}

async function run(name, task) {
  try { await task(); } catch (error) {
    failed = true;
    console.error(`${name}: ${error.message}`);
  }
}

let nextAlert = 0;
let nextSqi = 0;
do {
  if (Date.now() >= nextSqi) {
    await run('SQI', sqi);
    nextSqi = Date.now() + sqiMinutes * 60000;
  }
  if (Date.now() >= nextAlert) {
    await run('Cảnh báo', alerts);
    nextAlert = Date.now() + alertMinutes * 60000;
  }
  if (!once) await delay(15000);
} while (!once);
await db.end();
if (once && failed) process.exitCode = 1;

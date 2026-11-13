import { readFile } from 'node:fs/promises';
import { db, transaction } from './db.mjs';

try {
  const files = ['18_tv5_active_sqi_alerts.sql', '19_tv5_recalculate_sqi.sql'];
  await transaction(db, async client => {
    for (const file of files) {
      const sql = await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8');
      await client.query(sql);
    }
  });
  console.log('Đã áp dụng migration TV5.');
} finally {
  await db.end();
}

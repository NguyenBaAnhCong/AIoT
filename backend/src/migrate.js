// Chạy các file database/migrations/*.sql CHƯA từng chạy, theo thứ tự tên file.
// Mỗi file chạy trong 1 transaction; chạy xong ghi vào bảng public.schema_migrations.
// Quy ước: KHÔNG sửa file đã chạy – chỉ thêm file mới (vd 18_tv3_them_cot_ph.sql).
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from './config/db.js';
import { env } from './config/env.js';

const dir = env.migrationsDir;
const client = await pool.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await client.query('SELECT filename FROM public.schema_migrations')).rows.map((r) => r.filename));
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  let count = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await fs.readFile(path.join(dir, f), 'utf8');
    console.log(`Áp migration: ${f}`);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO public.schema_migrations(filename) VALUES ($1)', [f]);
      await client.query('COMMIT');
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Migration ${f} thất bại: ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!process.exitCode) console.log(count ? `Đã áp ${count} migration.` : 'Không có migration mới.');
} finally {
  client.release();
  await pool.end();
}

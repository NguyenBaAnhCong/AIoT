// Chạy các file database/migrations/*.sql CHƯA từng chạy, theo thứ tự tên file.
// Mỗi file chạy trong 1 transaction; chạy xong ghi vào bảng public.schema_migrations.
// Quy ước: KHÔNG sửa file đã chạy – chỉ thêm file mới (vd 19_tv3_them_cot_ph.sql).
//
// Dùng được 2 cách:  npm run migrate   |   server tự gọi khi khởi động (RUN_MIGRATIONS_ON_START).
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool } from './config/db.js';
import { env } from './config/env.js';

export async function runMigrations(dir = env.migrationsDir) {
  const client = await pool.connect();
  try {
    // Khóa để 2 tiến trình không chạy migration cùng lúc
    await client.query('SELECT pg_advisory_lock(727001)');
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
        throw new Error(`Migration ${f} thất bại: ${err.message}`);
      }
    }
    console.log(count ? `Đã áp ${count} migration.` : 'Không có migration mới.');
    return count;
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    client.release();
  }
}

// Chạy trực tiếp: node src/migrate.js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runMigrations();
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

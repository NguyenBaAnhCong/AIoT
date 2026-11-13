// Xuất dữ liệu huấn luyện từ PostgreSQL của nhóm ra ml/data/*.csv (TV6).
// Chạy các file trong ml/queries/ và ghi mỗi file thành 1 CSV cùng tên.
//
//   docker compose up -d db                 (database đã có dữ liệu demo)
//   cd backend && npm install && cd ..      (một lần, để có driver pg)
//   node ml/export_data.mjs                 (đọc DATABASE_URL từ .env ở thư mục gốc)
//
// Notebook cũng đọc thẳng database được nếu đặt DATABASE_URL và cài psycopg; khi đó không cần file này.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const pg = createRequire(path.join(root, 'backend', 'package.json'))('pg');

// Lấy DATABASE_URL từ biến môi trường, nếu không có thì đọc file .env ở thư mục gốc
let url = process.env.DATABASE_URL;
const envFile = path.join(root, '.env');
if (!url && fs.existsSync(envFile)) {
  url = fs.readFileSync(envFile, 'utf8').match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
}
if (!url) {
  console.error('Thiếu DATABASE_URL. Tạo file .env từ .env.example hoặc đặt biến môi trường.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(`SET timezone = 'Asia/Ho_Chi_Minh'`);

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const queryDir = path.join(here, 'queries');
const outDir = path.join(here, 'data');
fs.mkdirSync(outDir, { recursive: true });
try {
  for (const q of fs.readdirSync(queryDir).filter((f) => f.endsWith('.sql')).sort()) {
    const res = await client.query(fs.readFileSync(path.join(queryDir, q), 'utf8'));
    const cols = res.fields.map((f) => f.name);
    const lines = [cols.join(','), ...res.rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))];
    const out = path.join(outDir, q.replace(/\.sql$/, '.csv'));
    fs.writeFileSync(out, lines.join('\n') + '\n');
    console.log(`Đã ghi ${path.relative(root, out)} (${res.rows.length} dòng)`);
  }
} finally {
  await client.end();
}

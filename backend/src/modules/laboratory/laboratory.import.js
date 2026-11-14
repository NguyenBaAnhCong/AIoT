// Nhập kết quả phòng thí nghiệm từ file Excel (TV3).
//
// Luồng: tải file mẫu -> điền -> gửi lên ở chế độ kiểm tra (dry_run) -> xem lỗi từng dòng -> gửi thật.
// Cả file cùng thành công hoặc cùng hủy: chỉ cần một dòng lỗi là không ghi dòng nào.
// Mỗi dòng đi qua đúng quy tắc của POST /laboratory/results (DRAFT, phương pháp khớp chỉ tiêu, LOD...).
import ExcelJS from 'exceljs';
import { insertRow, getRow, withUserTx, query, AppError, fail } from '../tv3-common/crud.js';
import { results } from './laboratory.service.js';

const SHEET = 'KetQua';
export const COLUMNS = [
  { key: 'sample_code', header: 'Mã mẫu (sample_code)*', width: 20, note: 'Mã mẫu đã có trong hệ thống, vd LN-P01-S01' },
  { key: 'parameter_code', header: 'Chỉ tiêu (parameter_code)*', width: 24, note: 'PH, EC, N, P, K, OC... (xem sheet DanhMuc)' },
  { key: 'value', header: 'Giá trị (value)*', width: 16, note: 'Số; dùng dấu chấm thập phân' },
  { key: 'unit', header: 'Đơn vị (unit)', width: 14, note: 'Bỏ trống thì lấy theo phương pháp' },
  { key: 'method_code', header: 'Phương pháp (method_code)', width: 24, note: 'Mã phương pháp (xem sheet DanhMuc)' },
  { key: 'replicate_no', header: 'Lần lặp (replicate_no)', width: 20, note: 'Mặc định 1' },
  { key: 'analyzed_at', header: 'Thời điểm phân tích (analyzed_at)', width: 30, note: 'Ngày giờ; bỏ trống = lúc nhập' },
];
const MAX_ROWS = 2000;

/** Tạo file Excel mẫu: sheet KetQua để điền, sheet DanhMuc liệt kê chỉ tiêu, phương pháp, mẫu đang chờ kết quả. */
export async function buildTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Edge-AIoT Biochar';
  const ws = wb.addWorksheet(SHEET, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F7D4F' } };
  COLUMNS.forEach((c, i) => { ws.getCell(1, i + 1).note = c.note; });

  const { rows: samples } = await query(
    `SELECT s.sample_code FROM laboratory.soil_samples s
     WHERE s.status IN ('COLLECTED','RECEIVED')
       AND NOT EXISTS (SELECT 1 FROM laboratory.lab_results r WHERE r.sample_id = s.sample_id)
     ORDER BY s.sampled_at DESC LIMIT 1`);
  const { rows: methods } = await query(
    'SELECT method_code, parameter_code, name, unit, detection_limit FROM laboratory.lab_methods ORDER BY parameter_code, method_code');
  const ex = samples[0]?.sample_code || 'MA-MAU';
  const ph = methods.find((m) => m.parameter_code === 'PH');
  ws.addRow({ sample_code: ex, parameter_code: 'PH', value: 5.6, method_code: ph?.method_code, replicate_no: 1 });
  ws.addRow({ sample_code: ex, parameter_code: 'N', value: 0.12, unit: '%', replicate_no: 1 });

  const ref = wb.addWorksheet('DanhMuc');
  ref.columns = [
    { header: 'Mã phương pháp', key: 'method_code', width: 20 }, { header: 'Chỉ tiêu', key: 'parameter_code', width: 14 },
    { header: 'Tên phương pháp', key: 'name', width: 40 }, { header: 'Đơn vị', key: 'unit', width: 12 },
    { header: 'Giới hạn phát hiện', key: 'detection_limit', width: 18 },
  ];
  ref.getRow(1).font = { bold: true };
  methods.forEach((m) => ref.addRow(m));
  const { rows: params } = await query('SELECT parameter_code, name_vi, unit FROM ref.parameters ORDER BY parameter_code');
  ref.addRow([]);
  ref.addRow(['Chỉ tiêu', 'Tên', 'Đơn vị']).font = { bold: true };
  params.forEach((p) => ref.addRow([p.parameter_code, p.name_vi, p.unit]));
  return wb.xlsx.writeBuffer();
}

const cellValue = (v) => {
  if (v == null) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString();
    if ('result' in v) return v.result ?? null;          // ô công thức
    if ('text' in v) return v.text;                       // ô liên kết
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
  }
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  return v;
};

/** Đọc file: tìm cột theo mã trong ngoặc của tiêu đề (vd "(sample_code)") hoặc đúng mã cột. */
async function readRows(buffer) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch { fail({ field: 'file', message: 'Không đọc được file Excel (.xlsx)' }); }
  const ws = wb.getWorksheet(SHEET) || wb.worksheets[0];
  if (!ws) fail({ field: 'file', message: 'File không có sheet nào' });
  const colOf = {};
  ws.getRow(1).eachCell((cell, col) => {
    const h = String(cellValue(cell.value) ?? '').toLowerCase();
    const key = COLUMNS.find((c) => h === c.key || h.includes(`(${c.key})`))?.key;
    if (key) colOf[key] = col;
  });
  const missing = COLUMNS.filter((c) => c.header.endsWith('*') && !colOf[c.key]).map((c) => c.key);
  if (missing.length) fail({ field: 'file', message: `Thiếu cột bắt buộc: ${missing.join(', ')}. Hãy dùng file mẫu.` });

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const obj = {};
    for (const [key, col] of Object.entries(colOf)) obj[key] = cellValue(row.getCell(col).value);
    if (Object.values(obj).some((v) => v != null)) rows.push({ line: n, data: obj });
  });
  if (!rows.length) fail({ field: 'file', message: 'File không có dòng dữ liệu nào' });
  if (rows.length > MAX_ROWS) fail({ field: 'file', message: `Tối đa ${MAX_ROWS} dòng mỗi lần nhập` });
  return rows;
}

/**
 * Nhập file. dryRun = true: kiểm tra toàn bộ rồi hoàn tác, trả danh sách lỗi.
 * Trả về { total, valid, errors: [{ line, field, message }], inserted, preview }.
 */
export async function importResults(fileBase64, user, { dryRun = true } = {}) {
  if (!fileBase64 || typeof fileBase64 !== 'string') fail({ field: 'file_base64', message: 'Thiếu nội dung file' });
  const rows = await readRows(Buffer.from(fileBase64.replace(/^data:.*?;base64,/, ''), 'base64'));
  const errors = [];
  const preview = [];
  const seen = new Map();
  const ROLLBACK = Symbol('rollback');

  try {
    await withUserTx(user.id, async (client) => {
      const { rows: samples } = await client.query('SELECT sample_code, sample_id FROM laboratory.soil_samples');
      const { rows: methods } = await client.query('SELECT method_code, method_id FROM laboratory.lab_methods');
      const sampleId = new Map(samples.map((s) => [String(s.sample_code).toUpperCase(), s.sample_id]));
      const methodId = new Map(methods.map((m) => [String(m.method_code).toUpperCase(), m.method_id]));

      for (const { line, data } of rows) {
        const rowErr = (field, message) => errors.push({ line, field, message });
        const code = String(data.sample_code ?? '').toUpperCase();
        if (!code) { rowErr('sample_code', 'Thiếu mã mẫu'); continue; }
        if (!sampleId.has(code)) { rowErr('sample_code', `Không có mẫu ${data.sample_code}`); continue; }
        let mId = null;
        if (data.method_code != null) {
          mId = methodId.get(String(data.method_code).toUpperCase());
          if (!mId) { rowErr('method_code', `Không có phương pháp ${data.method_code}`); continue; }
        }
        const param = String(data.parameter_code ?? '').toUpperCase();
        const rep = data.replicate_no ?? 1;
        const dupKey = `${code}|${param}|${rep}`;
        if (seen.has(dupKey)) { rowErr('parameter_code', `Trùng với dòng ${seen.get(dupKey)} (cùng mẫu, chỉ tiêu, lần lặp)`); continue; }
        seen.set(dupKey, line);

        const body = {
          sample_id: sampleId.get(code), parameter_code: param,
          // chấp nhận cả dấu phẩy thập phân kiểu Việt Nam ("5,6")
          value: typeof data.value === 'string' ? data.value.replace(',', '.') : data.value,
          ...(data.unit != null && { unit: String(data.unit) }), method_id: mId, replicate_no: rep,
          ...(data.analyzed_at != null && { analyzed_at: String(data.analyzed_at) }),
        };
        await client.query('SAVEPOINT r');
        try {
          const id = await insertRow(results, body, user, client);
          await client.query('RELEASE SAVEPOINT r');
          if (preview.length < 20) preview.push(await getRow(results, id, client));
        } catch (e) {
          await client.query('ROLLBACK TO SAVEPOINT r');
          if (e instanceof AppError) {
            const ds = Array.isArray(e.details) ? e.details : [];
            if (ds.length) ds.forEach((d) => rowErr(d.field, d.message)); else rowErr('', e.message);
          } else if (e.code === '23505') {
            rowErr('parameter_code', 'Kết quả này đã có trong hệ thống (cùng mẫu, chỉ tiêu, lần lặp)');
          } else if (e.code && /^2[23]/.test(e.code)) {
            rowErr('', e.detail || e.message);
          } else throw e;
        }
      }
      // Kiểm tra thử hoặc có lỗi: hoàn tác toàn bộ
      if (dryRun || errors.length) throw ROLLBACK;
    }, { reason: 'Nhập kết quả phòng thí nghiệm từ Excel' });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }

  const valid = rows.length - new Set(errors.map((e) => e.line)).size;
  const inserted = !dryRun && !errors.length ? rows.length : 0;
  return { total: rows.length, valid, errors, inserted, dry_run: dryRun, preview };
}

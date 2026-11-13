import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { actor, fail, transaction, uuid, validDate } from './db.mjs';

const reportDir = new URL('./.reports/', import.meta.url);
const titles = {
  TECHNICAL: 'Báo cáo kỹ thuật',
  ECONOMIC: 'Báo cáo kinh tế',
  ENVIRONMENTAL: 'Báo cáo môi trường',
};
const columns = {
  TECHNICAL: ['Nghiệm thức', 'Ô đất', 'Phiên bản SQI', 'Số ngày có điểm', 'SQI trung bình', 'Độ phủ TB (%)'],
  ECONOMIC: ['Nghiệm thức', 'Ô đất', 'Năng suất (t/ha)', 'Doanh thu (đ/ha)', 'Chi phí (đ/ha)', 'Lợi nhuận (đ/ha)', 'BCR'],
  ENVIRONMENTAL: ['Nghiệm thức', 'Ô đất', 'Carbon lưu giữ (kg/ha)'],
};

export async function reportOptions(db) {
  const { rows: [result] } = await db.query(`
    SELECT (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.experiment_code) FROM (
      SELECT experiment_id, experiment_code, title FROM experiment.experiments) e) AS experiments,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.treatment_code) FROM (
      SELECT experiment_id, treatment_id, treatment_code, name FROM experiment.treatments) t) AS treatments,
    (SELECT jsonb_agg(DISTINCT jsonb_build_object('experiment_id', t.experiment_id,
      'crop_season_id', s.crop_season_id, 'season_code', s.season_code, 'plot_code', p.plot_code))
      FROM experiment.treatment_applications a JOIN experiment.treatments t USING (treatment_id)
      JOIN farm.crop_seasons s USING (crop_season_id) JOIN farm.plots p ON p.plot_id=s.plot_id) AS seasons
  `);
  return result;
}

export async function listReports(db) {
  return (await db.query(`SELECT report_id,title,report_type,file_format,status,created_at,
    parameters->>'error' AS error FROM reporting.reports ORDER BY created_at DESC LIMIT 100`)).rows;
}

async function reportRows(db, type, { experiment, treatment, season, from, to }) {
  if (type === 'TECHNICAL') {
    const { rows } = await db.query({ rowMode: 'array', values: [experiment, treatment, season, from, to], text: `
      SELECT t.treatment_code,p.plot_code,d.version_code,count(*)::integer,
             round(avg(s.sqi_value),4)::float8,round(avg(s.coverage_pct),2)::float8
      FROM sqi.sqi_scores s JOIN experiment.treatments t USING (treatment_id)
      JOIN farm.plots p USING (plot_id) JOIN sqi.sqi_definitions d USING (definition_id)
      WHERE t.experiment_id=$1 AND ($2::uuid IS NULL OR t.treatment_id=$2)
        AND ($3::uuid IS NULL OR EXISTS (
          SELECT 1 FROM experiment.treatment_applications a
          WHERE a.crop_season_id=$3 AND a.treatment_id=t.treatment_id AND a.plot_id=p.plot_id
            AND a.effective_from<=s.period_start AND (a.effective_to IS NULL OR a.effective_to>s.period_start)
        ))
        AND ($4::date IS NULL OR s.period_start >= ($4::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))
        AND ($5::date IS NULL OR s.period_start < (($5::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))
      GROUP BY t.treatment_code,p.plot_code,d.version_code ORDER BY 1,2,3
    ` });
    return rows;
  }
  const metrics = type === 'ECONOMIC'
    ? 'r.yield_t_ha::float8,r.revenue_vnd_ha::float8,r.total_cost_vnd_ha::float8,r.profit_vnd_ha::float8,r.bcr::float8'
    : 'r.carbon_sequestered_kg_ha::float8';
  const { rows } = await db.query({ rowMode: 'array', values: [experiment, treatment, season], text: `
    SELECT t.treatment_code,p.plot_code,${metrics}
    FROM reporting.economic_results r JOIN experiment.treatments t USING (treatment_id)
    LEFT JOIN farm.plots p USING (plot_id)
    WHERE r.experiment_id=$1 AND ($2::uuid IS NULL OR r.treatment_id=$2)
      AND ($3::uuid IS NULL OR r.crop_season_id=$3)
    ORDER BY t.treatment_code,p.plot_code
  ` });
  return rows;
}

async function spreadsheet(title, scope, headings, rows) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Báo cáo', { views: [{ state: 'frozen', ySplit: 4 }] });
  sheet.addRows([[title], [scope], [], headings, ...rows]);
  sheet.getRow(1).font = { bold: true, size: 16 };
  sheet.getRow(4).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF245E45' } };
  });
  headings.forEach((label, index) => { sheet.getColumn(index + 1).width = Math.max(20, label.length + 4); });
  if (!rows.length) sheet.addRow(['Không có dữ liệu cho bộ lọc này.']);
  return book.xlsx.writeBuffer();
}

function pdf(title, scope, headings, rows) {
  const font = process.env.TV5_PDF_FONT ||
    (process.platform === 'win32' ? join(process.env.WINDIR || 'C:/Windows', 'Fonts', 'arial.ttf')
      : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font(font).fontSize(20).fillColor('#245e45').text(title);
    doc.moveDown(0.5).fontSize(10).fillColor('#22352b').text(scope).moveDown();
    if (!rows.length) doc.text('Không có dữ liệu cho bộ lọc này.');
    else {
      const width = (doc.page.width - 80) / headings.length;
      const format = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 });
      let y = doc.y;
      const render = (row, header = false) => {
        const values = row.map(value => typeof value === 'number' ? format.format(value) : String(value ?? '—'));
        const height = Math.max(...values.map(value => doc.heightOfString(value, { width: width - 12 }))) + 12;
        if (y + height > doc.page.height - 40) {
          doc.addPage();
          y = 40;
          render(headings, true);
        }
        if (header) doc.rect(40, y, width * headings.length, height).fill('#e3efe5');
        doc.fillColor('#22352b');
        values.forEach((value, index) => doc.text(value, 46 + width * index, y + 6, { width: width - 12 }));
        y += height;
        doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#dbe5dc');
      };
      render(headings, true);
      rows.forEach(row => render(row));
    }
    doc.end();
  });
}

export async function createReport(db, body) {
  const { type, format, experiment, treatment = null, season = null, from = null, to = null } = body;
  if (!Object.hasOwn(titles, type) || !['PDF','XLSX'].includes(format) || !uuid.test(experiment) ||
      (treatment && !uuid.test(treatment)) || (season && !uuid.test(season)) ||
      (from && !validDate(from)) || (to && !validDate(to)) ||
      (from && to && from > to) || (type !== 'TECHNICAL' && (from || to))) fail(400, 'Bộ lọc báo cáo không hợp lệ.');
  const scope = { experiment, treatment, season, from, to };
  const { report_id: id, description, rows } = await transaction(db, async client => {
    const user = await actor(client);
    const { rows: [names] } = await client.query(`
      SELECT e.experiment_code,t.treatment_code,s.season_code
      FROM experiment.experiments e
      LEFT JOIN experiment.treatments t ON t.experiment_id=e.experiment_id AND t.treatment_id=$2
      LEFT JOIN farm.crop_seasons s ON s.crop_season_id=$3 AND EXISTS (
        SELECT 1 FROM experiment.treatment_applications a JOIN experiment.treatments tr USING (treatment_id)
        WHERE a.crop_season_id=s.crop_season_id AND tr.experiment_id=e.experiment_id
          AND ($2::uuid IS NULL OR tr.treatment_id=$2)
      )
      WHERE e.experiment_id=$1
    `, [experiment, treatment, season]);
    if (!names || (treatment && !names.treatment_code) || (season && !names.season_code)) {
      fail(400, 'Nghiệm thức hoặc mùa vụ không thuộc phạm vi đã chọn.');
    }
    const rows = await reportRows(client, type, scope);
    if (!rows.length) {
      fail(422, season
        ? 'Không có dữ liệu cho mùa vụ đã chọn. Thử đặt Mùa vụ thành Tất cả.'
        : 'Không có dữ liệu cho bộ lọc đã chọn. Hãy thử chọn tất cả nghiệm thức hoặc mở rộng khoảng ngày.');
    }
    const description = [
      `Thí nghiệm ${names.experiment_code}`,
      names.treatment_code && `Nghiệm thức ${names.treatment_code}`,
      names.season_code && `Mùa vụ ${names.season_code}`,
      from && `Từ ${from}`, to && `Đến ${to}`,
    ].filter(Boolean).join(' · ');
    const { rows: [report] } = await client.query(`
      INSERT INTO reporting.reports (report_type,title,experiment_id,crop_season_id,
        period_start,period_end,parameters,file_format,generated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING report_id
    `, [type, titles[type], experiment, season, from, to, scope, format, user]);
    return { ...report, description, rows };
  });
  const extension = format.toLowerCase();
  const filename = `${id}.${extension}`;
  try {
    await db.query("UPDATE reporting.reports SET status='GENERATING' WHERE report_id=$1", [id]);
    const render = format === 'PDF' ? pdf : spreadsheet;
    const buffer = await render(titles[type], description, columns[type], rows);
    await mkdir(reportDir, { recursive: true });
    await writeFile(new URL(filename, reportDir), buffer, { flag: 'wx' });
    await db.query("UPDATE reporting.reports SET status='READY',file_uri=$2,generated_at=now() WHERE report_id=$1",
      [id, `/reports/${id}/file`]);
    return { report_id: id, status: 'READY' };
  } catch (error) {
    console.error('Report:', error.message);
    await db.query(`UPDATE reporting.reports SET status='FAILED',
      parameters=parameters || '{"error":"Không tạo được tệp báo cáo. Xem log Node.js."}'::jsonb WHERE report_id=$1`, [id]);
    return { report_id: id, status: 'FAILED' };
  }
}

export async function downloadReport(db, id) {
  if (!uuid.test(id)) fail(404, 'Không tìm thấy báo cáo.');
  const { rows: [report] } = await db.query(`
    SELECT file_format FROM reporting.reports WHERE report_id=$1 AND status='READY'
  `, [id]);
  const types = { PDF: 'application/pdf', XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  if (!report || !Object.hasOwn(types, report.file_format)) fail(404, 'Báo cáo chưa sẵn sàng.');
  const filename = `${id}.${report.file_format.toLowerCase()}`;
  const path = fileURLToPath(new URL(filename, reportDir));
  const file = await readFile(path).catch(error => {
    if (error.code === 'ENOENT') fail(404, 'Tệp báo cáo không còn trên máy này.');
    throw error;
  });
  return { file, filename, type: types[report.file_format] };
}

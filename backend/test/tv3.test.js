// Test module TV3 (farm, experiment, biochar, laboratory). Chạy: cd backend && npm test
// Cần database có dữ liệu demo. Dữ liệu test dùng mã có hậu tố ngẫu nhiên và được xóa ở cuối.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool, query } from '../src/config/db.js';
import { listRows, getRow, createRow, updateRow, deleteRow } from '../src/modules/tv3-common/crud.js';
import * as farm from '../src/modules/farm/farm.service.js';
import * as exp from '../src/modules/experiment/experiment.service.js';
import * as bio from '../src/modules/biochar/biochar.service.js';
import * as lab from '../src/modules/laboratory/laboratory.service.js';
import { buildTemplate, importResults } from '../src/modules/laboratory/laboratory.import.js';
import ExcelJS from 'exceljs';

const tag = Math.random().toString(36).slice(2, 7).toUpperCase();
const cleanup = [];
let admin, labtech;

async function userCtx(username) {
  const { rows: [u] } = await query(
    `SELECT u.user_id AS id, array_agg(DISTINCT r.role_code) AS roles
     FROM iam.users u JOIN iam.user_roles ur USING (user_id) JOIN iam.roles r USING (role_id)
     WHERE u.username = $1 GROUP BY u.user_id`, [username]);
  return u;
}

test.before(async () => {
  admin = await userCtx('admin');
  labtech = await userCtx('labtech01');
});

test('TV3 đọc dữ liệu demo: ô kèm nghiệm thức hiện tại, ngày dạng YYYY-MM-DD, truy xuất biochar', async () => {
  const plots = await listRows(farm.plots, {});
  assert.ok(plots.rows.length >= 3);
  assert.ok(plots.rows.some((p) => p.current_treatment_code));
  const seasons = await listRows(farm.cropSeasons, {});
  assert.match(seasons.rows[0].planted_on, /^\d{4}-\d{2}-\d{2}$/);
  const { rows: [e] } = (await listRows(exp.experiments, {}));
  const summary = await exp.experimentSummary(e.experiment_id);
  assert.ok(summary.treatments.length > 0);
  const { rows: [b] } = await listRows(bio.biochar, {});
  const trace = await bio.traceFromBiochar(b.biochar_batch_id);
  assert.equal(trace.feedstock.feedstock_batch_id, b.feedstock_batch_id);
  assert.ok(trace.used_in_treatments.length > 0);
  const svl = await lab.sensorVsLab({ limit: 5 });
  assert.ok(svl.rows.length > 0 && svl.summary.length > 0);
});

test('TV3 kiểm tra dữ liệu đầu vào và tham chiếu', async () => {
  await assert.rejects(listRows(lab.results, { status: 'SAI' }), { status: 400 });
  await assert.rejects(getRow(farm.plots, 'abc'), { status: 400 });
  await assert.rejects(getRow(farm.plots, '00000000-0000-4000-8000-000000000000'), { status: 404 });
  const { rows: [site] } = await listRows(farm.sites, {});
  await assert.rejects(createRow(farm.plots, { site_id: site.site_id, plot_code: 'X', area_m2: 0, soil_type: '' }, admin),
    (e) => e.status === 400 && e.details.length >= 2);
  await assert.rejects(createRow(farm.plots,
    { site_id: '00000000-0000-4000-8000-000000000000', plot_code: 'X', area_m2: 1, soil_type: 'x' }, admin),
  (e) => e.status === 400 && e.details[0].field === 'site_id');
});

test('TV3 quy tắc ô, mùa vụ và nghiệm thức', async () => {
  const { rows: [site] } = await listRows(farm.sites, {});
  const plot = await createRow(farm.plots, { site_id: site.site_id, plot_code: `T${tag}`, area_m2: 20, soil_type: 'Feralit' }, admin);
  cleanup.push(['experiment.treatment_applications', 'plot_id', plot.plot_id], ['farm.plots', 'plot_id', plot.plot_id]);
  assert.equal(plot.status, 'ACTIVE');

  const { rows: [crop] } = await listRows(farm.crops, {});
  await assert.rejects(createRow(farm.cropSeasons,
    { plot_id: plot.plot_id, crop_id: crop.crop_id, season_code: 'S', planted_on: '2026-10-01', harvested_on: '2026-09-01' }, admin),
  { status: 400 });

  const { rows: [e] } = await listRows(exp.experiments, {});
  await assert.rejects(createRow(exp.treatments,
    { experiment_id: e.experiment_id, treatment_code: `C${tag}`, name: 'x', control_flag: true, biochar_dose_kg_m2: 1 }, admin),
  { status: 400 });
  await assert.rejects(createRow(exp.treatments,
    { experiment_id: e.experiment_id, treatment_code: `C${tag}`, name: 'x', biochar_dose_kg_m2: 1 }, admin),
  { status: 400 }, 'có liều biochar phải chỉ rõ lô');
  const ctrl = await createRow(exp.treatments,
    { experiment_id: e.experiment_id, treatment_code: `C${tag}`, name: 'Đối chứng', control_flag: true }, admin);
  // xóa sau các lần áp dụng (đứng đầu danh sách) và trước ô
  cleanup.splice(cleanup.findIndex((c) => c[0] === 'farm.plots'), 0, ['experiment.treatments', 'treatment_id', ctrl.treatment_id]);

  const app = await createRow(exp.applications, { treatment_id: ctrl.treatment_id, plot_id: plot.plot_id, applied_on: '2026-11-01' }, admin);
  assert.ok(app.is_active);
  assert.equal(app.applied_by, admin.id);
  await assert.rejects(createRow(exp.applications,
    { treatment_id: ctrl.treatment_id, plot_id: plot.plot_id, applied_on: '2026-11-05' }, admin), { status: 409 });
  await assert.rejects(updateRow(farm.plots, plot.plot_id, { status: 'RETIRED' }, admin), { status: 409 });

  // kết thúc nghiệm thức rồi mới ngừng ô được
  await updateRow(exp.applications, app.application_id, { effective_to: '2026-11-02T00:00:00+07:00' }, admin);
  const retired = await updateRow(farm.plots, plot.plot_id, { status: 'RETIRED' }, admin);
  assert.equal(retired.status, 'RETIRED');
});

test('TV3 quy tắc biochar: khối lượng, ngày, an toàn', async () => {
  const { rows: [f] } = await listRows(bio.feedstock, {});
  await assert.rejects(createRow(bio.biochar, { batch_code: `B${tag}`, feedstock_batch_id: f.feedstock_batch_id,
    produced_on: '2026-12-01', input_mass_kg: 10, output_mass_kg: 11 }, admin), { status: 400 });
  await assert.rejects(createRow(bio.biochar, { batch_code: `B${tag}`, feedstock_batch_id: f.feedstock_batch_id,
    produced_on: '2000-01-01', input_mass_kg: 1 }, admin), { status: 400 });
  await assert.rejects(createRow(bio.biochar, { batch_code: `B${tag}`, feedstock_batch_id: f.feedstock_batch_id,
    produced_on: '2026-12-01', input_mass_kg: Number(f.mass_kg) + 1 }, admin), { status: 400 });
  const b = await createRow(bio.biochar, { batch_code: `B${tag}`, feedstock_batch_id: f.feedstock_batch_id,
    produced_on: '2026-12-01', input_mass_kg: 2, output_mass_kg: 0.5, safety_status: 'FAILED' }, admin);
  cleanup.unshift(['biochar.biochar_batches', 'biochar_batch_id', b.biochar_batch_id]);
  assert.equal(b.yield_pct, 25);
  await assert.rejects(createRow(bio.enrichment, { batch_code: `E${tag}`, biochar_batch_id: b.biochar_batch_id,
    enrichment_type: 'MICROBIAL', microbial_formula: 'x', started_on: '2026-12-02' }, admin), { status: 400 });
});

test('TV3 luồng duyệt kết quả lab DRAFT -> VERIFIED -> APPROVED và nguyên tắc 4 mắt', async () => {
  const { rows: [plot] } = await listRows(farm.plots, { plot_code: 'P01' });
  const sample = await createRow(lab.samples, { sample_code: `S${tag}`, plot_id: plot.plot_id,
    sampled_at: '2026-11-10T08:00:00+07:00', depth_from_cm: 0, depth_to_cm: 20 }, labtech);
  cleanup.unshift(['laboratory.soil_samples', 'sample_id', sample.sample_id]);
  assert.equal(sample.status, 'COLLECTED');
  assert.equal(sample.collected_by, labtech.id);

  const { rows: [m] } = await listRows(lab.methods, { parameter_code: 'PH' });
  await assert.rejects(createRow(lab.results, { sample_id: sample.sample_id, parameter_code: 'EC', value: 1, method_id: m.method_id }, labtech),
    { status: 400 });
  const r = await createRow(lab.results, { sample_id: sample.sample_id, parameter_code: 'PH', value: 5.5, method_id: m.method_id }, labtech);
  assert.equal(r.result_status, 'DRAFT');
  assert.equal(r.unit, m.unit);
  assert.equal((await getRow(lab.samples, sample.sample_id)).status, 'ANALYZING');

  await assert.rejects(lab.changeResultStatus(r.lab_result_id, 'approve', admin), { status: 409 });
  const v = await lab.changeResultStatus(r.lab_result_id, 'verify', labtech);
  assert.equal(v.result_status, 'VERIFIED');
  await assert.rejects(updateRow(lab.results, r.lab_result_id, { value: 6 }, labtech), { status: 409 });
  await assert.rejects(deleteRow(lab.results, r.lab_result_id, labtech), { status: 409 });
  await assert.rejects(lab.changeResultStatus(r.lab_result_id, 'approve', labtech), { status: 403 });
  const a = await lab.changeResultStatus(r.lab_result_id, 'approve', admin);
  assert.equal(a.result_status, 'APPROVED');
  assert.equal(a.approved_by, admin.id);
  assert.equal((await getRow(lab.samples, sample.sample_id)).status, 'COMPLETED');

  const r2 = await createRow(lab.results, { sample_id: sample.sample_id, parameter_code: 'K', value: 90, unit: 'mg/kg' }, labtech);
  await assert.rejects(lab.changeResultStatus(r2.lab_result_id, 'reject', admin), { status: 400 });
  await assert.rejects(lab.bulkChangeStatus([r2.lab_result_id, r.lab_result_id], 'verify', admin), { status: 409 });
  assert.equal((await getRow(lab.results, r2.lab_result_id)).result_status, 'DRAFT', 'lô lỗi phải rollback');
  const rej = await lab.changeResultStatus(r2.lab_result_id, 'reject', admin, { reason: 'Nhiễm bẩn' });
  assert.equal(rej.result_status, 'REJECTED');
  await assert.rejects(deleteRow(lab.samples, sample.sample_id, labtech), { status: 409 });
});

test('TV3 nhập Excel kết quả lab: báo lỗi từng dòng, kiểm tra thử không ghi, nhập thật cả file', async () => {
  const { rows: [plot] } = await listRows(farm.plots, { plot_code: 'P02' });
  const sample = await createRow(lab.samples, { sample_code: `X${tag}`, plot_id: plot.plot_id,
    sampled_at: '2026-11-11T08:00:00+07:00' }, labtech);
  cleanup.unshift(['laboratory.soil_samples', 'sample_id', sample.sample_id]);

  const tpl = await buildTemplate();
  const check = new ExcelJS.Workbook();
  await check.xlsx.load(tpl);
  assert.deepEqual(check.worksheets.map((w) => w.name), ['KetQua', 'DanhMuc']);

  const file = async (rows) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('KetQua');
    ws.addRow(['Mã mẫu (sample_code)*', 'Chỉ tiêu (parameter_code)*', 'Giá trị (value)*', 'Đơn vị (unit)', 'Phương pháp (method_code)']);
    rows.forEach((r) => ws.addRow(r));
    return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
  };
  const bad = await importResults(await file([[sample.sample_code, 'PH', 5.5, null, 'M-PH'], ['KHONG-CO', 'PH', 5],
    [sample.sample_code, 'PH', 6, null, 'M-PH'], [sample.sample_code, 'EC', 'abc', 'dS/m']]), labtech, { dryRun: false });
  assert.equal(bad.inserted, 0);
  assert.deepEqual(bad.errors.map((e) => e.line), [3, 4, 5]);
  assert.equal((await listRows(lab.results, { sample_id: sample.sample_id })).rows.length, 0, 'có lỗi thì không ghi dòng nào');

  const good = await file([[sample.sample_code, 'PH', 5.5, null, 'M-PH'], [sample.sample_code, 'EC', '0,4', 'dS/m']]);
  const dry = await importResults(good, labtech, { dryRun: true });
  assert.equal(dry.valid, 2);
  assert.equal((await listRows(lab.results, { sample_id: sample.sample_id })).rows.length, 0, 'kiểm tra thử không ghi');
  const real = await importResults(good, labtech, { dryRun: false });
  assert.equal(real.inserted, 2);
  const saved = (await listRows(lab.results, { sample_id: sample.sample_id })).rows;
  assert.ok(saved.every((r) => r.result_status === 'DRAFT'));
  assert.ok(saved.some((r) => r.parameter_code === 'EC' && r.value === 0.4));
  await assert.rejects(importResults(Buffer.from('x').toString('base64'), labtech), { status: 400 });
});

test.after(async () => {
  for (const [table, col, id] of cleanup) {
    await query(`DELETE FROM ${table} WHERE ${col} = $1`, [id]).catch((e) => console.error('dọn dữ liệu test:', e.message));
  }
  await pool.end();
});

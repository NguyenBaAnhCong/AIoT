// Khai báo tài nguyên + quy tắc nghiệp vụ của module biochar (TV3).
// Chuỗi nguồn gốc: lô phụ phẩm vải (feedstock) -> nhiệt phân -> lô biochar -> lô làm giàu -> nghiệm thức -> ô.
import { z, zUuid, zCode, zText, zDate, zNum, nullable, ordered, getRow, query, fail, AppError } from '../tv3-common/crud.js';
import * as Q from './biochar.queries.js';

export const FEEDSTOCK_TYPES = ['LITCHI_PRUNING', 'LITCHI_BRANCH', 'LITCHI_LEAF', 'LITCHI_PEEL', 'LITCHI_SEED', 'MIXED', 'OTHER'];
export const SAFETY = ['PENDING', 'PASSED', 'FAILED'];
export const ENRICHMENT_TYPES = ['MICROBIAL', 'NUTRIENT', 'COMPOST', 'MIXED'];

export const feedstock = {
  name: 'Lô phụ phẩm', table: 'biochar.feedstock_batches', pk: 'feedstock_batch_id', select: Q.FEEDSTOCK,
  orderBy: 't.collected_on DESC, t.batch_code',
  schema: z.object({
    batch_code: zCode,
    feedstock_type: z.enum(FEEDSTOCK_TYPES).optional(),
    source_location: nullable(zText()),
    collected_on: zDate,
    mass_kg: zNum().positive('Khối lượng phải > 0'),
    moisture_pct: nullable(zNum(0, 100)),
    pretreatment: nullable(zText()),
    notes: nullable(zText(2000)),
  }),
  filters: {
    feedstock_type: { sql: 't.feedstock_type = $?', values: FEEDSTOCK_TYPES },
    q: { sql: "t.batch_code ILIKE '%' || $? || '%'" },
  },
  // Không được giảm khối lượng xuống dưới lượng đã đưa vào lò
  check(row) {
    if (row.used_mass_kg != null && Number(row.mass_kg) < Number(row.used_mass_kg)) {
      fail({ field: 'mass_kg', message: `Đã dùng ${row.used_mass_kg} kg cho nhiệt phân, khối lượng không thể nhỏ hơn` });
    }
  },
};

export const biochar = {
  name: 'Lô biochar', table: 'biochar.biochar_batches', pk: 'biochar_batch_id', select: Q.BIOCHAR,
  orderBy: 't.produced_on DESC, t.batch_code',
  schema: z.object({
    batch_code: zCode,
    feedstock_batch_id: zUuid,
    produced_on: zDate,
    reactor_type: nullable(zText(64)),
    pyrolysis_temp_c: nullable(zNum(200, 1000)),
    residence_time_min: nullable(zNum().positive('Phải > 0')),
    heating_rate_c_min: nullable(zNum(0)),
    input_mass_kg: nullable(zNum().positive('Phải > 0')),
    output_mass_kg: nullable(zNum(0)),
    ph: nullable(zNum(0, 14)),
    ec_ds_m: nullable(zNum(0)),
    carbon_pct: nullable(zNum(0, 100)),
    ash_pct: nullable(zNum(0, 100)),
    surface_area_m2_g: nullable(zNum(0)),
    cec_cmol_kg: nullable(zNum(0)),
    heavy_metals_mg_kg: nullable(z.record(zNum(0))),
    safety_status: z.enum(SAFETY).optional(),
    notes: nullable(zText(2000)),
  }),
  refs: { feedstock_batch_id: ['biochar.feedstock_batches', 'feedstock_batch_id', 'Lô phụ phẩm'] },
  filters: {
    feedstock_batch_id: { sql: 't.feedstock_batch_id = $?', type: 'uuid' },
    safety_status: { sql: 't.safety_status = $?', values: SAFETY },
    q: { sql: "t.batch_code ILIKE '%' || $? || '%'" },
  },
  async check(row, { client, existing }) {
    if (row.input_mass_kg != null && row.output_mass_kg != null && Number(row.output_mass_kg) > Number(row.input_mass_kg)) {
      fail({ field: 'output_mass_kg', message: 'Khối lượng biochar thu được không thể lớn hơn khối lượng đưa vào lò' });
    }
    if (row.carbon_pct != null && row.ash_pct != null && Number(row.carbon_pct) + Number(row.ash_pct) > 100) {
      fail({ field: 'ash_pct', message: 'Tổng carbon và tro không thể vượt 100%' });
    }
    if (row.safety_status === 'PASSED' && !row.heavy_metals_mg_kg) {
      fail({ field: 'heavy_metals_mg_kg', message: 'Phải có kết quả kim loại nặng trước khi kết luận PASSED' });
    }
    const { rows: [f] } = await client.query(
      `SELECT f.batch_code, f.collected_on::text AS collected_on, f.mass_kg,
              COALESCE(sum(b.input_mass_kg) FILTER (WHERE b.biochar_batch_id IS DISTINCT FROM $2), 0) AS used
       FROM biochar.feedstock_batches f
       LEFT JOIN biochar.biochar_batches b ON b.feedstock_batch_id = f.feedstock_batch_id
       WHERE f.feedstock_batch_id = $1 GROUP BY f.feedstock_batch_id`,
      [row.feedstock_batch_id, existing?.biochar_batch_id ?? null]);
    if (f) {
      if (row.produced_on < f.collected_on) {
        fail({ field: 'produced_on', message: `Ngày nhiệt phân trước ngày thu gom phụ phẩm ${f.batch_code} (${f.collected_on})` });
      }
      if (row.input_mass_kg != null && Number(f.used) + Number(row.input_mass_kg) > Number(f.mass_kg)) {
        fail({ field: 'input_mass_kg',
          message: `Lô phụ phẩm ${f.batch_code} chỉ còn ${Number(f.mass_kg) - Number(f.used)} kg (tổng ${f.mass_kg} kg)` });
      }
    }
  },
};

export const enrichment = {
  name: 'Lô làm giàu', table: 'biochar.enrichment_batches', pk: 'enrichment_batch_id', select: Q.ENRICHMENT,
  orderBy: 't.started_on DESC, t.batch_code',
  schema: z.object({
    batch_code: zCode,
    biochar_batch_id: zUuid,
    enrichment_type: z.enum(ENRICHMENT_TYPES),
    microbial_formula: nullable(zText()),
    nutrient_formula: nullable(zText()),
    ratio_desc: nullable(zText()),
    started_on: zDate,
    finished_on: nullable(zDate),
    notes: nullable(zText(2000)),
  }),
  refs: { biochar_batch_id: ['biochar.biochar_batches', 'biochar_batch_id', 'Lô biochar'] },
  filters: {
    biochar_batch_id: { sql: 't.biochar_batch_id = $?', type: 'uuid' },
    enrichment_type: { sql: 't.enrichment_type = $?', values: ENRICHMENT_TYPES },
  },
  async check(row, { client }) {
    ordered(row, 'started_on', 'finished_on');
    if (['MICROBIAL', 'MIXED'].includes(row.enrichment_type) && !row.microbial_formula) {
      fail({ field: 'microbial_formula', message: 'Làm giàu vi sinh phải ghi chủng / chế phẩm' });
    }
    if (row.enrichment_type === 'NUTRIENT' && !row.nutrient_formula) {
      fail({ field: 'nutrient_formula', message: 'Làm giàu dinh dưỡng phải ghi công thức dinh dưỡng' });
    }
    const { rows: [b] } = await client.query(
      'SELECT batch_code, produced_on::text AS produced_on, safety_status FROM biochar.biochar_batches WHERE biochar_batch_id = $1',
      [row.biochar_batch_id]);
    if (b?.safety_status === 'FAILED') {
      fail({ field: 'biochar_batch_id', message: `Lô biochar ${b.batch_code} không đạt an toàn, không được làm giàu` });
    }
    if (b && row.started_on < b.produced_on) {
      fail({ field: 'started_on', message: `Ngày làm giàu trước ngày sản xuất lô biochar ${b.batch_code} (${b.produced_on})` });
    }
  },
};

export const enrichmentResults = {
  name: 'Kết quả làm giàu', table: 'biochar.enrichment_results', pk: 'enrichment_result_id', select: Q.ENRICHMENT_RESULTS,
  orderBy: 't.enrichment_batch_code, t.measured_on, t.parameter_code',
  schema: z.object({
    enrichment_batch_id: zUuid,
    parameter_code: zCode,
    value: zNum(),
    unit: zText(32).min(1, 'Không được để trống'),
    measured_on: zDate,
    method: nullable(zText()),
    pass_flag: nullable(z.boolean()),
  }),
  refs: { enrichment_batch_id: ['biochar.enrichment_batches', 'enrichment_batch_id', 'Lô làm giàu'] },
  filters: {
    enrichment_batch_id: { sql: 't.enrichment_batch_id = $?', type: 'uuid' },
    parameter_code: { sql: 't.parameter_code = $?' },
  },
  async check(row, { client }) {
    const { rows: [e] } = await client.query(
      'SELECT batch_code, started_on::text AS started_on FROM biochar.enrichment_batches WHERE enrichment_batch_id = $1',
      [row.enrichment_batch_id]);
    if (e && row.measured_on < e.started_on) {
      fail({ field: 'measured_on', message: `Ngày đo trước ngày bắt đầu làm giàu lô ${e.batch_code} (${e.started_on})` });
    }
  },
};

// ---------- truy xuất nguồn gốc ----------
async function enrichmentsWithResults(ids) {
  if (!ids.length) return [];
  const { rows: batches } = await query(`SELECT * FROM (${Q.ENRICHMENT}) t WHERE t.enrichment_batch_id = ANY($1::uuid[])
                                         ORDER BY t.started_on`, [ids]);
  const { rows: results } = await query(`SELECT * FROM (${Q.ENRICHMENT_RESULTS}) t WHERE t.enrichment_batch_id = ANY($1::uuid[])
                                         ORDER BY t.measured_on, t.parameter_code`, [ids]);
  return batches.map((b) => ({ ...b, results: results.filter((r) => r.enrichment_batch_id === b.enrichment_batch_id) }));
}

/** Từ một lô biochar: ngược về lô phụ phẩm, xuôi xuống các lô làm giàu và nơi được bón ngoài đồng. */
export async function traceFromBiochar(id) {
  const batch = await getRow(biochar, id);
  const feedstockBatch = await getRow(feedstock, batch.feedstock_batch_id);
  const { rows } = await query('SELECT enrichment_batch_id FROM biochar.enrichment_batches WHERE biochar_batch_id = $1', [id]);
  const ids = rows.map((r) => r.enrichment_batch_id);
  const { rows: usage } = await query(Q.USAGE, [[id], ids]);
  return { feedstock: feedstockBatch, biochar: batch, enrichments: await enrichmentsWithResults(ids), used_in_treatments: usage };
}

/** Từ một lô làm giàu: truy ngược toàn chuỗi, chỉ trả lô làm giàu được hỏi. */
export async function traceFromEnrichment(id) {
  const e = await getRow(enrichment, id);
  const batch = await getRow(biochar, e.biochar_batch_id);
  const feedstockBatch = await getRow(feedstock, batch.feedstock_batch_id);
  const { rows: usage } = await query(Q.USAGE, [[], [id]]);
  return { feedstock: feedstockBatch, biochar: batch, enrichments: await enrichmentsWithResults([id]), used_in_treatments: usage };
}

export { AppError };

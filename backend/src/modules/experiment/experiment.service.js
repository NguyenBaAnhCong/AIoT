// Khai báo tài nguyên + quy tắc nghiệp vụ của module experiment (TV3).
import {
  z, zUuid, zCode, zText, zDate, zTime, zNum, nullable, ordered, transition, getRow, query, AppError, fail,
} from '../tv3-common/crud.js';
import * as Q from './experiment.queries.js';

export const DESIGN_TYPES = ['CRD', 'RCBD', 'SPLIT_PLOT', 'FACTORIAL', 'OBSERVATIONAL'];
export const EXPERIMENT_STATUS = ['PLANNED', 'RUNNING', 'COMPLETED', 'CANCELLED'];
// Vòng đời thí nghiệm: chỉ đi tới, COMPLETED / CANCELLED là trạng thái cuối
const EXPERIMENT_FLOW = { PLANNED: ['RUNNING', 'CANCELLED'], RUNNING: ['COMPLETED', 'CANCELLED'] };

export const experiments = {
  name: 'Thí nghiệm', table: 'experiment.experiments', pk: 'experiment_id', select: Q.EXPERIMENTS,
  orderBy: 't.started_on DESC, t.experiment_code',
  schema: z.object({
    site_id: zUuid,
    experiment_code: zCode,
    title: zText().min(1, 'Không được để trống'),
    design_type: z.enum(DESIGN_TYPES).optional(),
    replicates: z.coerce.number().int().min(1, 'Phải >= 1').optional(),
    started_on: zDate,
    ended_on: nullable(zDate),
    principal_investigator: nullable(zUuid),
    status: z.enum(EXPERIMENT_STATUS).optional(),
    objective: nullable(zText(5000)),
  }),
  refs: {
    site_id: ['farm.sites', 'site_id', 'Khu thí nghiệm'],
    principal_investigator: ['iam.users', 'user_id', 'Người phụ trách'],
  },
  filters: {
    site_id: { sql: 't.site_id = $?', type: 'uuid' },
    status: { sql: 't.status = $?', values: EXPERIMENT_STATUS },
    q: { sql: "(t.experiment_code ILIKE '%' || $? || '%' OR t.title ILIKE '%' || $? || '%')" },
  },
  async check(row, { existing }) {
    ordered(row, 'started_on', 'ended_on');
    if (existing) transition(EXPERIMENT_FLOW, existing.status, row.status, 'thí nghiệm');
    else if (row.status && !['PLANNED', 'RUNNING'].includes(row.status)) {
      fail({ field: 'status', message: 'Thí nghiệm mới chỉ được ở PLANNED hoặc RUNNING' });
    }
    if (row.status === 'COMPLETED' && !row.ended_on) {
      fail({ field: 'ended_on', message: 'Thí nghiệm COMPLETED phải có ngày kết thúc' });
    }
  },
};

export const treatments = {
  name: 'Nghiệm thức', table: 'experiment.treatments', pk: 'treatment_id', select: Q.TREATMENTS,
  orderBy: 't.experiment_code, t.treatment_code',
  schema: z.object({
    experiment_id: zUuid,
    treatment_code: zCode,
    name: zText().min(1, 'Không được để trống'),
    biochar_dose_kg_m2: zNum(0).optional(),
    biochar_batch_id: nullable(zUuid),
    enrichment_batch_id: nullable(zUuid),
    microbial_formula: nullable(zText()),
    fertilizer_desc: nullable(zText()),
    control_flag: z.boolean().optional(),
    description: nullable(zText(5000)),
  }),
  refs: {
    experiment_id: ['experiment.experiments', 'experiment_id', 'Thí nghiệm'],
    biochar_batch_id: ['biochar.biochar_batches', 'biochar_batch_id', 'Lô biochar'],
    enrichment_batch_id: ['biochar.enrichment_batches', 'enrichment_batch_id', 'Lô làm giàu'],
  },
  filters: {
    experiment_id: { sql: 't.experiment_id = $?', type: 'uuid' },
    experiment_code: { sql: 't.experiment_code = $?' },
    control_flag: { sql: 't.control_flag = $?', type: 'bool' },
  },
  async check(row, { client }) {
    const dose = Number(row.biochar_dose_kg_m2 ?? 0);
    if (row.control_flag) {
      // Đối chứng: không bón biochar
      if (dose !== 0) fail({ field: 'biochar_dose_kg_m2', message: 'Nghiệm thức đối chứng phải có liều biochar = 0' });
      if (row.biochar_batch_id || row.enrichment_batch_id) {
        fail({ field: 'biochar_batch_id', message: 'Nghiệm thức đối chứng không gắn lô biochar' });
      }
    } else if (dose > 0 && !row.biochar_batch_id && !row.enrichment_batch_id) {
      fail({ field: 'biochar_batch_id', message: 'Có liều biochar thì phải chỉ rõ lô biochar hoặc lô làm giàu (truy xuất nguồn gốc)' });
    }
    if (row.enrichment_batch_id) {
      const { rows } = await client.query(
        'SELECT biochar_batch_id FROM biochar.enrichment_batches WHERE enrichment_batch_id = $1', [row.enrichment_batch_id]);
      if (row.biochar_batch_id && rows[0] && rows[0].biochar_batch_id !== row.biochar_batch_id) {
        fail({ field: 'enrichment_batch_id', message: 'Lô làm giàu không được làm từ lô biochar đã chọn' });
      }
      if (!row.biochar_batch_id && rows[0]) row.biochar_batch_id = rows[0].biochar_batch_id;
    }
    const batchId = row.biochar_batch_id;
    if (batchId) {
      const { rows } = await client.query(
        'SELECT batch_code, safety_status FROM biochar.biochar_batches WHERE biochar_batch_id = $1', [batchId]);
      if (rows[0]?.safety_status === 'FAILED') {
        fail({ field: 'biochar_batch_id', message: `Lô biochar ${rows[0].batch_code} không đạt an toàn (FAILED), không được dùng` });
      }
    }
  },
};

export const applications = {
  name: 'Áp dụng nghiệm thức', table: 'experiment.treatment_applications', pk: 'application_id',
  select: Q.APPLICATIONS, orderBy: 't.plot_code, t.effective_from DESC',
  schema: z.object({
    treatment_id: zUuid,
    plot_id: zUuid,
    crop_season_id: nullable(zUuid),
    replicate_no: z.coerce.number().int().min(1).optional(),
    applied_on: zDate,
    effective_from: zTime.optional(),
    effective_to: nullable(zTime),
    actual_dose_kg_m2: nullable(zNum(0)),
    applied_by: nullable(zUuid),
    notes: nullable(zText(2000)),
  }),
  refs: {
    treatment_id: ['experiment.treatments', 'treatment_id', 'Nghiệm thức'],
    plot_id: ['farm.plots', 'plot_id', 'Ô thí nghiệm'],
    crop_season_id: ['farm.crop_seasons', 'crop_season_id', 'Mùa vụ'],
    applied_by: ['iam.users', 'user_id', 'Người bón'],
  },
  filters: {
    plot_id: { sql: 't.plot_id = $?', type: 'uuid' },
    plot_code: { sql: 't.plot_code = $?' },
    treatment_id: { sql: 't.treatment_id = $?', type: 'uuid' },
    experiment_id: { sql: 't.experiment_id = $?', type: 'uuid' },
    active: { sql: 't.is_active = $?', type: 'bool' },
  },
  defaults(data, { user }) {
    return {
      // Mặc định hiệu lực từ 0h ngày bón (giờ Việt Nam), người bón là người đang đăng nhập
      effective_from: data.effective_from ?? `${data.applied_on}T00:00:00+07:00`,
      applied_by: data.applied_by ?? user?.id ?? null,
    };
  },
  async check(row, { client, existing }) {
    ordered(row, 'effective_from', 'effective_to', { strict: true });
    const { rows: [ctx] } = await client.query(
      `SELECT p.site_id AS plot_site, p.status AS plot_status, p.plot_code, e.site_id AS exp_site, e.status AS exp_status,
              e.experiment_code
       FROM farm.plots p, experiment.treatments t JOIN experiment.experiments e USING (experiment_id)
       WHERE p.plot_id = $1 AND t.treatment_id = $2`, [row.plot_id, row.treatment_id]);
    if (ctx) {
      if (ctx.plot_site !== ctx.exp_site) {
        fail({ field: 'plot_id', message: `Ô ${ctx.plot_code} không thuộc khu của thí nghiệm ${ctx.experiment_code}` });
      }
      if (!existing && ['COMPLETED', 'CANCELLED'].includes(ctx.exp_status)) {
        throw AppError.conflict(`Thí nghiệm ${ctx.experiment_code} đã ${ctx.exp_status}, không áp dụng thêm nghiệm thức`);
      }
      if (!existing && ctx.plot_status !== 'ACTIVE') {
        throw AppError.conflict(`Ô ${ctx.plot_code} đang ở trạng thái ${ctx.plot_status}`);
      }
    }
    if (row.crop_season_id) {
      const { rows } = await client.query('SELECT plot_id FROM farm.crop_seasons WHERE crop_season_id = $1', [row.crop_season_id]);
      if (rows[0] && rows[0].plot_id !== row.plot_id) fail({ field: 'crop_season_id', message: 'Mùa vụ không thuộc ô này' });
    }
    // Một ô tại một thời điểm chỉ có một nghiệm thức (để dữ liệu cảm biến gán đúng nghiệm thức)
    const { rows: overlap } = await client.query(
      `SELECT t.treatment_code, a.effective_from FROM experiment.treatment_applications a
       JOIN experiment.treatments t USING (treatment_id)
       WHERE a.plot_id = $1 AND a.application_id IS DISTINCT FROM $2
         AND tstzrange(a.effective_from, a.effective_to) && tstzrange($3::timestamptz, $4::timestamptz)`,
      [row.plot_id, existing?.application_id ?? null, row.effective_from, row.effective_to ?? null]);
    if (overlap[0]) {
      throw AppError.conflict(`Ô đã có nghiệm thức ${overlap[0].treatment_code} trong khoảng thời gian này. `
        + 'Đặt effective_to cho lần áp dụng cũ trước.');
    }
  },
};

export const growthStages = {
  name: 'Giai đoạn sinh trưởng', table: 'experiment.growth_stages', pk: 'growth_stage_id',
  select: Q.GROWTH_STAGES, orderBy: 't.crop_code, t.stage_order',
  schema: z.object({
    crop_id: zUuid,
    stage_code: zCode,
    name_vi: zText(128).min(1, 'Không được để trống'),
    stage_order: z.coerce.number().int().min(1),
    typical_days_from_planting: nullable(z.coerce.number().int().min(0)),
  }),
  refs: { crop_id: ['farm.crops', 'crop_id', 'Cây trồng'] },
  filters: { crop_id: { sql: 't.crop_id = $?', type: 'uuid' } },
};

export const plotGrowthStages = {
  name: 'Giai đoạn sinh trưởng của ô', table: 'experiment.plot_growth_stages', pk: 'plot_growth_stage_id',
  select: Q.PLOT_GROWTH_STAGES, orderBy: 't.plot_code, t.started_at',
  schema: z.object({
    crop_season_id: zUuid,
    growth_stage_id: zUuid,
    started_at: zTime,
    ended_at: nullable(zTime),
    observed_by: nullable(zUuid),
  }),
  refs: {
    crop_season_id: ['farm.crop_seasons', 'crop_season_id', 'Mùa vụ'],
    growth_stage_id: ['experiment.growth_stages', 'growth_stage_id', 'Giai đoạn sinh trưởng'],
    observed_by: ['iam.users', 'user_id', 'Người ghi nhận'],
  },
  filters: {
    crop_season_id: { sql: 't.crop_season_id = $?', type: 'uuid' },
    plot_id: { sql: 't.plot_id = $?', type: 'uuid' },
  },
  defaults: (data, { user }) => ({ observed_by: data.observed_by ?? user?.id ?? null }),
  async check(row, { client }) {
    ordered(row, 'started_at', 'ended_at', { strict: true });
    const { rows: [m] } = await client.query(
      `SELECT cs.crop_id = g.crop_id AS same_crop FROM farm.crop_seasons cs, experiment.growth_stages g
       WHERE cs.crop_season_id = $1 AND g.growth_stage_id = $2`, [row.crop_season_id, row.growth_stage_id]);
    if (m && !m.same_crop) fail({ field: 'growth_stage_id', message: 'Giai đoạn này thuộc cây trồng khác với mùa vụ' });
  },
};

/** Tóm tắt thí nghiệm cho màn hình 05: thông tin chung + bảng nghiệm thức. */
export async function experimentSummary(id) {
  const experiment = await getRow(experiments, id);
  const { rows } = await query(Q.TREATMENT_SUMMARY, [id]);
  return { ...experiment, treatments: rows };
}

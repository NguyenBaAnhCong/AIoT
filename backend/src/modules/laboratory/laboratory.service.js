// Khai báo tài nguyên + quy tắc nghiệp vụ của module laboratory (TV3).
//
// Luồng duyệt kết quả phòng thí nghiệm (giữ đúng thiết kế ban đầu của TV3):
//   DRAFT --verify--> VERIFIED --approve--> APPROVED
//     \______________ reject ____________/--> REJECTED
// - Tạo mới luôn là DRAFT; chỉ sửa / xóa khi còn DRAFT.
// - verify cần quyền laboratory.write; approve / reject cần laboratory.approve.
// - Nguyên tắc 4 mắt: người phân tích không tự duyệt kết quả của mình (trừ ADMIN).
// - Chỉ kết quả VERIFIED / APPROVED mới được dùng để đối chiếu với cảm biến (view v_sensor_vs_lab).
import {
  z, zUuid, zCode, zText, zTime, zNum, nullable, ordered, transition, getRow, listRows, query, withUserTx,
  AppError, fail, assertUuid,
} from '../tv3-common/crud.js';
import * as Q from './laboratory.queries.js';

export const SAMPLE_TYPES = ['SOIL', 'SOIL_SOLUTION', 'PLANT', 'BIOCHAR'];
export const SAMPLE_STATUS = ['COLLECTED', 'RECEIVED', 'ANALYZING', 'COMPLETED', 'REJECTED'];
export const RESULT_STATUS = ['DRAFT', 'VERIFIED', 'APPROVED', 'REJECTED'];
const SAMPLE_FLOW = {
  COLLECTED: ['RECEIVED', 'REJECTED'],
  RECEIVED: ['ANALYZING', 'REJECTED'],
  ANALYZING: ['COMPLETED', 'REJECTED'],
};
const RESULT_FLOW = { DRAFT: ['VERIFIED', 'REJECTED'], VERIFIED: ['APPROVED', 'REJECTED'] };

export const methods = {
  name: 'Phương pháp phân tích', table: 'laboratory.lab_methods', pk: 'method_id', select: Q.METHODS,
  orderBy: 't.parameter_code, t.method_code',
  schema: z.object({
    method_code: zCode,
    parameter_code: zCode,
    name: zText().min(1, 'Không được để trống'),
    standard_ref: nullable(zText(128)),
    instrument: nullable(zText(128)),
    detection_limit: nullable(zNum(0)),
    quantification_limit: nullable(zNum(0)),
    unit: zText(32).min(1, 'Không được để trống'),
  }),
  refs: { parameter_code: ['ref.parameters', 'parameter_code', 'Chỉ tiêu'] },
  filters: { parameter_code: { sql: 't.parameter_code = $?' } },
  check(row) {
    if (row.detection_limit != null && row.quantification_limit != null
        && Number(row.quantification_limit) < Number(row.detection_limit)) {
      fail({ field: 'quantification_limit', message: 'Giới hạn định lượng (LOQ) phải >= giới hạn phát hiện (LOD)' });
    }
  },
};

export const samples = {
  name: 'Mẫu', table: 'laboratory.soil_samples', pk: 'sample_id', select: Q.SAMPLES,
  orderBy: 't.sampled_at DESC, t.sample_code',
  schema: z.object({
    sample_code: zCode,
    plot_id: zUuid,
    sample_type: z.enum(SAMPLE_TYPES).optional(),
    sampled_at: zTime,
    depth_from_cm: nullable(zNum(0)),
    depth_to_cm: nullable(zNum(0)),
    latitude: nullable(zNum(-90, 90)),
    longitude: nullable(zNum(-180, 180)),
    near_node_id: nullable(zUuid),
    composite_of: nullable(z.coerce.number().int().min(1)),
    collected_by: nullable(zUuid),
    received_at: nullable(zTime),
    status: z.enum(SAMPLE_STATUS).optional(),
    notes: nullable(zText(2000)),
  }),
  refs: {
    plot_id: ['farm.plots', 'plot_id', 'Ô thí nghiệm'],
    near_node_id: ['iot.sensor_nodes', 'node_id', 'Sensor Node'],
    collected_by: ['iam.users', 'user_id', 'Người lấy mẫu'],
  },
  filters: {
    plot_id: { sql: 't.plot_id = $?', type: 'uuid' },
    plot_code: { sql: 't.plot_code = $?' },
    status: { sql: 't.status = $?', values: SAMPLE_STATUS },
    sample_type: { sql: 't.sample_type = $?', values: SAMPLE_TYPES },
    from: { sql: 't.sampled_at >= $?::timestamptz', type: 'time' },
    to: { sql: 't.sampled_at < $?::timestamptz', type: 'time' },
    q: { sql: "t.sample_code ILIKE '%' || $? || '%'" },
  },
  defaults: (data, { user }) => ({ collected_by: data.collected_by ?? user?.id ?? null }),
  async check(row, { client, existing }) {
    ordered(row, 'depth_from_cm', 'depth_to_cm', { strict: true });
    ordered(row, 'sampled_at', 'received_at');
    if (existing) {
      transition(SAMPLE_FLOW, existing.status, row.status, 'mẫu');
      if (row.status === 'COMPLETED' && (Number(existing.draft_count) + Number(existing.verified_count) > 0)) {
        throw AppError.conflict('Còn kết quả chưa duyệt, chưa thể đánh dấu mẫu COMPLETED');
      }
    } else if (row.status && !['COLLECTED', 'RECEIVED'].includes(row.status)) {
      fail({ field: 'status', message: 'Mẫu mới chỉ được ở COLLECTED hoặc RECEIVED' });
    }
    if (row.status === 'RECEIVED' && !row.received_at) row.received_at = new Date().toISOString();
    if (row.near_node_id) {
      const { rows: [n] } = await client.query(
        `SELECT n.node_code, n.plot_id FROM iot.sensor_nodes n WHERE n.node_id = $1`, [row.near_node_id]);
      if (n && n.plot_id && n.plot_id !== row.plot_id) {
        fail({ field: 'near_node_id', message: `Sensor Node ${n.node_code} không nằm trong ô của mẫu` });
      }
    }
  },
  beforeDelete(existing) {
    if (Number(existing.result_count) > 0) {
      throw AppError.conflict(`Mẫu ${existing.sample_code} đã có ${existing.result_count} kết quả, không xóa được`);
    }
  },
};

/** Sau khi ghi kết quả: mẫu tự chuyển ANALYZING; khi mọi kết quả đã chốt (APPROVED/REJECTED) thì COMPLETED. */
async function syncSampleStatus(client, sampleId) {
  await client.query(
    `UPDATE laboratory.soil_samples s SET status = CASE
         WHEN NOT EXISTS (SELECT 1 FROM laboratory.lab_results r
                          WHERE r.sample_id = s.sample_id AND r.result_status IN ('DRAFT','VERIFIED'))
              AND EXISTS (SELECT 1 FROM laboratory.lab_results r
                          WHERE r.sample_id = s.sample_id AND r.result_status = 'APPROVED')
           THEN 'COMPLETED'
         ELSE 'ANALYZING' END,
       received_at = COALESCE(received_at, now())
     WHERE s.sample_id = $1 AND s.status IN ('COLLECTED','RECEIVED','ANALYZING','COMPLETED')`, [sampleId]);
}

export const results = {
  name: 'Kết quả phân tích', table: 'laboratory.lab_results', pk: 'lab_result_id', select: Q.RESULTS,
  orderBy: 't.sampled_at DESC, t.sample_code, t.parameter_code, t.replicate_no',
  // result_status, approved_by không nhận từ body: chỉ đổi qua verify / approve / reject
  schema: z.object({
    sample_id: zUuid,
    parameter_code: zCode,
    value: zNum(),
    unit: zText(32).optional(),
    method_id: nullable(zUuid),
    replicate_no: z.coerce.number().int().min(1).optional(),
    below_lod: z.boolean().optional(),
    analyzed_at: nullable(zTime),
    analyst_id: nullable(zUuid),
  }),
  refs: {
    sample_id: ['laboratory.soil_samples', 'sample_id', 'Mẫu'],
    parameter_code: ['ref.parameters', 'parameter_code', 'Chỉ tiêu'],
    method_id: ['laboratory.lab_methods', 'method_id', 'Phương pháp'],
    analyst_id: ['iam.users', 'user_id', 'Người phân tích'],
  },
  filters: {
    sample_id: { sql: 't.sample_id = $?', type: 'uuid' },
    plot_id: { sql: 't.plot_id = $?', type: 'uuid' },
    plot_code: { sql: 't.plot_code = $?' },
    parameter_code: { sql: 't.parameter_code = $?' },
    method_id: { sql: 't.method_id = $?', type: 'uuid' },
    status: { sql: 't.result_status = $?', values: RESULT_STATUS },
  },
  defaults: (data, { user }) => ({
    analyst_id: data.analyst_id ?? user?.id ?? null,
    analyzed_at: data.analyzed_at ?? new Date().toISOString(),
  }),
  beforeUpdate(existing) { requireDraft(existing, 'sửa'); },
  beforeDelete(existing) { requireDraft(existing, 'xóa'); },
  async check(row, { client, existing }) {
    const { rows: [s] } = await client.query(
      'SELECT sample_code, status, sampled_at FROM laboratory.soil_samples WHERE sample_id = $1', [row.sample_id]);
    if (s?.status === 'REJECTED') throw AppError.conflict(`Mẫu ${s.sample_code} đã bị loại, không nhập kết quả`);
    if (s && row.analyzed_at && new Date(row.analyzed_at) < new Date(s.sampled_at)) {
      fail({ field: 'analyzed_at', message: 'Thời điểm phân tích trước thời điểm lấy mẫu' });
    }
    if (row.method_id) {
      const { rows: [m] } = await client.query(
        'SELECT method_code, parameter_code, unit, detection_limit FROM laboratory.lab_methods WHERE method_id = $1', [row.method_id]);
      if (m) {
        if (m.parameter_code !== row.parameter_code) {
          fail({ field: 'method_id', message: `Phương pháp ${m.method_code} dùng cho chỉ tiêu ${m.parameter_code}, không phải ${row.parameter_code}` });
        }
        if (!row.unit) row.unit = m.unit;
        // dưới giới hạn phát hiện thì tự đánh dấu below_lod
        if (m.detection_limit != null && Number(row.value) < Number(m.detection_limit)) row.below_lod = true;
      }
    }
    if (!row.unit) fail({ field: 'unit', message: 'Thiếu đơn vị (hoặc chọn phương pháp để lấy đơn vị mặc định)' });
    if (!existing) row.result_status = 'DRAFT';
  },
  afterWrite: (row, { client }) => syncSampleStatus(client, row.sample_id),
};

function requireDraft(existing, action) {
  if (existing.result_status !== 'DRAFT') {
    throw AppError.conflict(`Chỉ được ${action} kết quả ở trạng thái DRAFT (hiện tại: ${existing.result_status})`);
  }
}

const TARGET = { verify: 'VERIFIED', approve: 'APPROVED', reject: 'REJECTED' };

async function applyStatus(client, id, action, user) {
  const target = TARGET[action];
  const r = await getRow(results, id, client);
  await client.query('SELECT 1 FROM laboratory.lab_results WHERE lab_result_id = $1 FOR UPDATE', [id]);
  if (r.result_status === target) throw AppError.conflict(`Kết quả ${id} đã ở trạng thái ${target}`);
  transition(RESULT_FLOW, r.result_status, target, 'kết quả');
  if (action === 'approve' && r.analyst_id === user.id && !user.roles?.includes('ADMIN')) {
    throw AppError.forbidden('Người phân tích không được tự duyệt kết quả của mình (nguyên tắc 4 mắt)');
  }
  await client.query(
    `UPDATE laboratory.lab_results SET result_status = $2::varchar,
            approved_by = CASE WHEN $2::varchar IN ('APPROVED','REJECTED') THEN $3::uuid ELSE approved_by END
     WHERE lab_result_id = $1`, [id, target, user.id]);
  await syncSampleStatus(client, r.sample_id);
  return getRow(results, id, client);
}

function checkReason(action, reason) {
  if (action === 'reject' && !reason?.trim()) fail({ field: 'reason', message: 'Phải ghi lý do loại kết quả' });
}

/** Đổi trạng thái một kết quả: verify | approve | reject. */
export async function changeResultStatus(id, action, user, { reason } = {}) {
  assertUuid(id);
  checkReason(action, reason);
  return withUserTx(user.id, (client) => applyStatus(client, id, action, user),
    { reason: reason || `${action} kết quả phòng thí nghiệm` });
}

/** Đổi trạng thái nhiều kết quả một lần: cả lô cùng thành công, hoặc một lỗi thì hủy cả lô. */
export async function bulkChangeStatus(ids, action, user, { reason } = {}) {
  const parsed = z.array(zUuid).min(1, 'Danh sách rỗng').max(500, 'Tối đa 500 kết quả mỗi lần').safeParse(ids);
  if (!parsed.success) fail({ field: 'ids', message: parsed.error.issues[0].message });
  checkReason(action, reason);
  return withUserTx(user.id, async (client) => {
    const out = [];
    for (const id of new Set(parsed.data)) out.push(await applyStatus(client, id, action, user));
    return out;
  }, { reason: reason || `${action} hàng loạt kết quả phòng thí nghiệm` });
}

export async function sensorVsLab(q) {
  const def = {
    pk: 'sample_id', select: Q.SENSOR_VS_LAB, orderBy: 't.sampled_at DESC, t.parameter_code',
    filters: {
      plot_id: { sql: 't.plot_id = $?', type: 'uuid' },
      plot_code: { sql: 't.plot_code = $?' },
      parameter_code: { sql: 't.parameter_code = $?' },
      from: { sql: 't.sampled_at >= $?::timestamptz', type: 'time' },
      to: { sql: 't.sampled_at < $?::timestamptz', type: 'time' },
    },
  };
  const page = await listRows(def, q);
  if (q.plot_id) assertUuid(q.plot_id, 'plot_id');
  const { rows: summary } = await query(Q.SENSOR_VS_LAB_SUMMARY, [q.plot_id || null]);
  return { ...page, summary };
}

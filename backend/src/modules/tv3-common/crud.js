// =====================================================================
// Khung CRUD dùng chung cho 4 module của TV3 (farm, experiment, biochar, laboratory).
// Mỗi tài nguyên chỉ khai báo: bảng, khóa chính, câu SELECT, schema zod, khóa ngoại,
// bộ lọc và các quy tắc nghiệp vụ (check). Khung lo phần còn lại:
//
//   GET    /<tài-nguyên>          danh sách (?page=&limit= + bộ lọc)
//   GET    /<tài-nguyên>/:id      chi tiết
//   POST   /<tài-nguyên>          tạo            (quyền <domain>.write)
//   PATCH  /<tài-nguyên>/:id      sửa một phần   (quyền <domain>.write) – PUT dùng như PATCH
//   DELETE /<tài-nguyên>/:id      xóa            (quyền <domain>.write)
//
// Quy ước theo docs/CONVENTIONS.md: SQL tham số $1.., lỗi qua AppError, ghi qua withUserTx.
// Cột DATE luôn trả về dạng chuỗi 'YYYY-MM-DD' (ép ::text trong SELECT) để không bị lệch múi giờ.
// =====================================================================
import { Router } from 'express';
import { z } from 'zod';
import { query, withUserTx } from '../../config/db.js';
import { protect } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { ok, created, noContent, parsePaging } from '../../utils/response.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- các kiểu zod dùng chung ----------
export const zUuid = z.string().regex(UUID_RE, 'Phải là UUID');
export const zCode = z.string().trim().min(1, 'Không được để trống').max(32, 'Tối đa 32 ký tự');
export const zText = (max = 255) => z.string().trim().max(max, `Tối đa ${max} ký tự`);
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
export const zTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Thời gian không hợp lệ (ISO 8601)');
export const zNum = (min, max) => {
  let n = z.coerce.number({ invalid_type_error: 'Phải là số' });
  if (min !== undefined) n = n.min(min, `Phải >= ${min}`);
  if (max !== undefined) n = n.max(max, `Phải <= ${max}`);
  return n;
};
export const nullable = (t) => t.nullable().optional();

/** Ném lỗi 400 với danh sách lỗi theo trường. */
export function fail(details, message = 'Dữ liệu không hợp lệ') {
  throw AppError.badRequest(message, Array.isArray(details) ? details : [details]);
}

export function assertUuid(id, field = 'id') {
  if (!UUID_RE.test(String(id))) fail({ field, message: 'Phải là UUID' });
}

const toIso = (v) => (v instanceof Date ? v.toISOString() : v);
const cmp = (a, b) => (a == null || b == null ? 0 : new Date(toIso(a)) - new Date(toIso(b)));

/** Thời điểm/ngày sau phải >= (hoặc >) thời điểm trước. Dùng trong check(). */
export function ordered(row, fromKey, toKey, { strict = false } = {}) {
  const d = cmp(row[toKey], row[fromKey]);
  if (row[fromKey] != null && row[toKey] != null && (strict ? d <= 0 : d < 0)) {
    fail({ field: toKey, message: `${toKey} phải ${strict ? 'sau' : 'sau hoặc bằng'} ${fromKey}` });
  }
}

/** Kiểm tra chuyển trạng thái theo bảng cho phép { TỪ: [ĐẾN...] }. */
export function transition(map, from, to, label = 'trạng thái') {
  if (from === to) return;
  if (!(map[from] || []).includes(to)) {
    throw AppError.conflict(`Không thể chuyển ${label} ${from} -> ${to}`, { allowed: map[from] || [] });
  }
}

// ---------- đọc ----------
function buildFilters(def, q) {
  const where = [];
  const params = [];
  for (const [key, f] of Object.entries(def.filters || {})) {
    const raw = q[key];
    if (raw === undefined || raw === '') continue;
    let value = String(raw).trim();
    if (f.type === 'uuid') assertUuid(value, key);
    if (f.type === 'bool') {
      if (!['true', 'false'].includes(value)) fail({ field: key, message: 'Chỉ nhận true hoặc false' });
      value = value === 'true';
    }
    if (f.type === 'time' && Number.isNaN(Date.parse(value))) fail({ field: key, message: 'Thời gian không hợp lệ' });
    if (f.values && !f.values.includes(value)) fail({ field: key, message: `Chỉ nhận: ${f.values.join(', ')}` });
    params.push(value);
    where.push(f.sql.replaceAll('$?', `$${params.length}`));
  }
  return { where, params };
}

export async function listRows(def, q, db = { query }) {
  const { page, limit, offset } = parsePaging(q);
  const { where, params } = buildFilters(def, q);
  const sql = `SELECT t.*, count(*) OVER() AS _total FROM (${def.select}) t
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY ${def.orderBy || def.pk}
               LIMIT ${limit} OFFSET ${offset}`;
  const { rows } = await db.query(sql, params);
  const total = rows[0]?._total ?? 0;
  rows.forEach((r) => delete r._total);
  return { rows, meta: { page, limit, total } };
}

export async function getRow(def, id, db = { query }) {
  assertUuid(id);
  const { rows } = await db.query(`SELECT * FROM (${def.select}) t WHERE t.${def.pk} = $1`, [id]);
  if (!rows[0]) throw AppError.notFound(`${def.name} không tồn tại: ${id}`);
  return rows[0];
}

// ---------- ghi ----------
async function checkRefs(def, data, client) {
  const errors = [];
  for (const [col, [table, pk, label]] of Object.entries(def.refs || {})) {
    if (data[col] == null) continue;
    const { rowCount } = await client.query(`SELECT 1 FROM ${table} WHERE ${pk} = $1`, [data[col]]);
    if (!rowCount) errors.push({ field: col, message: `${label} không tồn tại: ${data[col]}` });
  }
  if (errors.length) fail(errors, 'Dữ liệu tham chiếu không tồn tại');
}

function parseBody(schema, body) {
  const r = schema.safeParse(body ?? {});
  if (!r.success) {
    fail(r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  }
  // bỏ các khóa undefined để không ghi đè cột bằng NULL ngoài ý muốn
  return Object.fromEntries(Object.entries(r.data).filter(([, v]) => v !== undefined));
}

const jsonify = (v) => (v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v);

/** Thêm một dòng trong transaction có sẵn (dùng chung cho tạo đơn lẻ và nhập Excel). Trả về id. */
export async function insertRow(def, body, user, client) {
  const data = parseBody(def.schema, body);
  const ctx = { client, user, existing: null };
  if (def.defaults) Object.assign(data, await def.defaults(data, ctx));
  await checkRefs(def, data, client);
  if (def.check) await def.check(data, ctx);
  const cols = Object.keys(data);
  const { rows } = await client.query(
    `INSERT INTO ${def.table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     RETURNING ${def.pk}`,
    cols.map((c) => jsonify(data[c])),
  );
  const id = rows[0][def.pk];
  if (def.afterWrite) await def.afterWrite({ ...data, [def.pk]: id }, ctx);
  return id;
}

export async function createRow(def, body, user) {
  return withUserTx(user?.id, async (client) => getRow(def, await insertRow(def, body, user, client), client));
}

export async function updateRow(def, id, body, user) {
  assertUuid(id);
  const data = parseBody(def.updateSchema || def.schema.partial(), body);
  if (!Object.keys(data).length) fail({ field: '', message: 'Không có trường nào để cập nhật' });
  return withUserTx(user?.id, async (client) => {
    const existing = await getRow(def, id, client);
    await client.query(`SELECT 1 FROM ${def.table} WHERE ${def.pk} = $1 FOR UPDATE`, [id]);
    const ctx = { client, user, existing };
    if (def.beforeUpdate) await def.beforeUpdate(existing, ctx);
    const merged = { ...existing, ...data };
    await checkRefs(def, data, client);
    if (def.check) await def.check(merged, ctx);
    const cols = Object.keys(data);
    await client.query(
      `UPDATE ${def.table} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE ${def.pk} = $1`,
      [id, ...cols.map((c) => jsonify(data[c]))],
    );
    if (def.afterWrite) await def.afterWrite(merged, ctx);
    return getRow(def, id, client);
  });
}

export async function deleteRow(def, id, user) {
  assertUuid(id);
  await withUserTx(user?.id, async (client) => {
    const existing = await getRow(def, id, client);
    if (def.beforeDelete) await def.beforeDelete(existing, { client, user, existing });
    await client.query(`DELETE FROM ${def.table} WHERE ${def.pk} = $1`, [id]);
  });
}

/** Gắn 5 route CRUD của một tài nguyên vào router. */
export function mountCrud(router, path, def, domain) {
  const read = protect(`${domain}.read`);
  const write = protect(`${domain}.write`);
  router.get(path, read, asyncHandler(async (req, res) => {
    const { rows, meta } = await listRows(def, req.query);
    ok(res, rows, meta);
  }));
  router.get(`${path}/:id`, read, asyncHandler(async (req, res) => ok(res, await getRow(def, req.params.id))));
  router.post(path, write, asyncHandler(async (req, res) => created(res, await createRow(def, req.body, req.user))));
  const upd = asyncHandler(async (req, res) => ok(res, await updateRow(def, req.params.id, req.body, req.user)));
  router.patch(`${path}/:id`, write, upd);
  router.put(`${path}/:id`, write, upd);
  router.delete(`${path}/:id`, write, asyncHandler(async (req, res) => {
    await deleteRow(def, req.params.id, req.user);
    noContent(res);
  }));
}

export { Router, z, query, withUserTx, protect, asyncHandler, AppError, ok, created };

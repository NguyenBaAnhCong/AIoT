import { Router } from 'express';
import { z } from 'zod';
import { query, withUserTx } from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { ok, created } from '../../utils/response.js';
import { validate } from '../../middleware/validate.js';
import { protect } from '../../middleware/auth.js';

const router = Router();
const CATEGORIES = ['SOIL_CHEM', 'SOIL_PHYS', 'SOIL_BIO', 'BIOCHAR', 'PLANT', 'ENV'];
const code = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{0,31}$/, 'Chữ hoa, số, _ (tối đa 32 ký tự)');
const rangeOk = (b) => b.physical_min == null || b.physical_max == null || b.physical_min <= b.physical_max;
const rangeMsg = { message: 'physical_min phải ≤ physical_max', path: ['physical_min'] };

const createBody = z.object({
  parameter_code: code, name_vi: z.string().trim().min(1).max(128), unit: z.string().trim().min(1).max(32),
  category: z.enum(CATEGORIES), physical_min: z.number().nullable().optional(), physical_max: z.number().nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
}).refine(rangeOk, rangeMsg);
const patchBody = z.object({
  name_vi: z.string().trim().min(1).max(128).optional(), unit: z.string().trim().min(1).max(32).optional(), category: z.enum(CATEGORIES).optional(),
  physical_min: z.number().nullable().optional(), physical_max: z.number().nullable().optional(), description: z.string().max(1000).nullable().optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'Không có trường nào để cập nhật' }).refine(rangeOk, rangeMsg);

const COLS = 'parameter_code, name_vi, unit, category, physical_min, physical_max, description';

// GET /api/v1/ref/parameters?category=  – danh mục chỉ tiêu dùng chung (mọi người dùng đã đăng nhập đều xem được)
router.get('/parameters', protect(), validate(z.object({ category: z.enum(CATEGORIES).optional() }), 'query'), asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT ${COLS} FROM ref.parameters WHERE ($1::text IS NULL OR category = $1) ORDER BY category, parameter_code`, [req.query.category ?? null]);
  ok(res, rows);
}));

router.get('/parameters/:code', protect(), asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT ${COLS} FROM ref.parameters WHERE parameter_code = $1`, [req.params.code.toUpperCase()]);
  if (!rows[0]) throw AppError.notFound('Không tìm thấy chỉ tiêu');
  ok(res, rows[0]);
}));

router.post('/parameters', protect('iam.admin'), validate(createBody), asyncHandler(async (req, res) => {
  const b = req.body;
  try {
    const row = await withUserTx(req.user.id, async (c) => (await c.query(
      `INSERT INTO ref.parameters (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLS}`,
      [b.parameter_code, b.name_vi, b.unit, b.category, b.physical_min ?? null, b.physical_max ?? null, b.description ?? null])).rows[0],
    { reason: 'Thêm chỉ tiêu' });
    created(res, row);
  } catch (err) {
    if (err?.code === '23505') throw AppError.conflict('Mã chỉ tiêu đã tồn tại', [{ field: 'parameter_code', message: 'Đã tồn tại' }]);
    throw err;
  }
}));

// Không có DELETE: chỉ tiêu được các bảng khác tham chiếu.
router.patch('/parameters/:code', protect('iam.admin'), validate(patchBody), asyncHandler(async (req, res) => {
  const b = req.body; const sets = []; const vals = [];
  // Khoảng giá trị phải hợp lệ SAU KHI gộp với giá trị đang lưu (vd chỉ sửa physical_max nhưng nhỏ hơn physical_min cũ)
  const current = (await query('SELECT physical_min, physical_max FROM ref.parameters WHERE parameter_code = $1', [req.params.code.toUpperCase()])).rows[0];
  if (!current) throw AppError.notFound('Không tìm thấy chỉ tiêu');
  const min = 'physical_min' in b ? b.physical_min : current.physical_min;
  const max = 'physical_max' in b ? b.physical_max : current.physical_max;
  if (min != null && max != null && min > max) throw AppError.badRequest('Khoảng giá trị không hợp lệ', [{ field: 'physical_min', message: `physical_min (${min}) phải ≤ physical_max (${max})` }]);
  for (const [k, v] of Object.entries(b)) { vals.push(v); sets.push(`${k} = $${vals.length}`); }
  vals.push(req.params.code.toUpperCase());
  const row = await withUserTx(req.user.id, async (c) => (await c.query(
    `UPDATE ref.parameters SET ${sets.join(', ')} WHERE parameter_code = $${vals.length} RETURNING ${COLS}`, vals)).rows[0],
  { reason: 'Sửa chỉ tiêu' });
  if (!row) throw AppError.notFound('Không tìm thấy chỉ tiêu');
  ok(res, row);
}));

export default router;

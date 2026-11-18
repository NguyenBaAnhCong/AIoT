import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, created, parsePaging } from '../../utils/response.js';
import { validate } from '../../middleware/validate.js';
import { protect } from '../../middleware/auth.js';
import * as svc from './users.service.js';

const router = Router();

// Quy ước JSON của nhóm: snake_case, giống tên cột trong database (riêng /auth giữ camelCase).
const idParams = z.object({ id: z.string().uuid('id không hợp lệ') });
const password = z.string().min(8, 'Tối thiểu 8 ký tự').max(72).regex(/[A-Za-z]/, 'Cần có chữ cái').regex(/[0-9]/, 'Cần có chữ số');
const roleCodes = z.array(z.string().regex(/^[A-Z_]{2,32}$/)).max(10);

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  active: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  role: z.string().regex(/^[A-Z_]{2,32}$/).optional(),
  page: z.string().optional(), limit: z.string().optional(),
});
const createBody = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_.-]{3,64}$/, '3–64 ký tự: chữ thường, số, _ . -'),
  email: z.string().trim().toLowerCase().email('Email không hợp lệ').max(255),
  full_name: z.string().trim().min(1, 'Bắt buộc').max(255),
  password,
  role_codes: roleCodes.default([]),
  organization_id: z.string().uuid().nullable().optional(),
});
const patchBody = z.object({
  email: z.string().trim().toLowerCase().email('Email không hợp lệ').max(255).optional(),
  full_name: z.string().trim().min(1).max(255).optional(),
  organization_id: z.string().uuid().nullable().optional(),
  role_codes: roleCodes.optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'Không có trường nào để cập nhật' });
const resetBody = z.object({ new_password: password.optional() });

// GET /api/v1/users?q=&active=&role=&page=&limit=
router.get('/', protect('iam.read'), validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePaging(req.query);
  const { q, active, role } = req.query;
  const { rows, total } = await svc.listUsers({ q, active, role, limit, offset });
  ok(res, rows, { page, limit, total });
}));

router.get('/:id', protect('iam.read'), validate(idParams, 'params'), asyncHandler(async (req, res) => ok(res, await svc.getUser(req.params.id))));

router.post('/', protect('iam.write'), validate(createBody), asyncHandler(async (req, res) => created(res, await svc.createUser(req.user.id, req.body))));

router.patch('/:id', protect('iam.write'), validate(idParams, 'params'), validate(patchBody), asyncHandler(async (req, res) =>
  ok(res, await svc.updateUser(req.user.id, req.params.id, req.body))));

// Không có DELETE: người dùng đã có lịch sử audit nên chỉ KHÓA / MỞ KHÓA.
router.post('/:id/deactivate', protect('iam.write'), validate(idParams, 'params'), asyncHandler(async (req, res) =>
  ok(res, await svc.setActive(req.user.id, req.params.id, false))));
router.post('/:id/activate', protect('iam.write'), validate(idParams, 'params'), asyncHandler(async (req, res) =>
  ok(res, await svc.setActive(req.user.id, req.params.id, true))));

router.post('/:id/reset-password', protect('iam.write'), validate(idParams, 'params'), validate(resetBody), asyncHandler(async (req, res) =>
  ok(res, await svc.resetPassword(req.user.id, req.params.id, req.body.new_password))));

export default router;

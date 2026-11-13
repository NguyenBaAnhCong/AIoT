import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, noContent } from '../../utils/response.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { getUserContext } from '../../lib/userCache.js';
import * as service from './auth.service.js';

const router = Router();

// Chống dò mật khẩu: tối đa 10 lần đăng nhập / 15 phút / địa chỉ IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Đăng nhập sai quá nhiều lần, hãy thử lại sau ít phút' } }),
});

const clientMeta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent'), method: 'POST', resource: '/auth/login' });

const loginSchema = z.object({ username: z.string().trim().min(1, 'Bắt buộc'), password: z.string().min(1, 'Bắt buộc') });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });
const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Bắt buộc'),
  newPassword: z.string().min(8, 'Tối thiểu 8 ký tự').max(72, 'Tối đa 72 ký tự')
    .regex(/[A-Za-z]/, 'Cần có chữ cái').regex(/[0-9]/, 'Cần có chữ số'),
});

// POST /api/v1/auth/login
router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
  ok(res, await service.login(req.body, clientMeta(req)));
}));

// POST /api/v1/auth/refresh  – đổi refresh token lấy access token mới
router.post('/refresh', validate(refreshSchema), asyncHandler(async (req, res) => {
  ok(res, await service.refresh(req.body.refreshToken));
}));

// GET /api/v1/auth/me  – thông tin người đang đăng nhập (kèm vai trò, quyền)
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  ok(res, service.publicUser(await getUserContext(req.user.id)));
}));

// POST /api/v1/auth/change-password
router.post('/change-password', requireAuth, validate(passwordSchema), asyncHandler(async (req, res) => {
  await service.changePassword(req.user.id, req.body);
  noContent(res);
}));

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, created } from '../../utils/response.js';
import { validate } from '../../middleware/validate.js';
import { protect } from '../../middleware/auth.js';
import * as svc from './roles.service.js';

// Router này gắn ở 3 đường dẫn: /roles, /permissions, /organizations (xem routes.js)
export const rolesRouter = Router();
export const permissionsRouter = Router();
export const organizationsRouter = Router();

const idParams = z.object({ id: z.string().uuid('id không hợp lệ') });
const ORG_TYPES = ['RESEARCH', 'UNIVERSITY', 'FARM', 'COMPANY', 'GOVERNMENT'];

rolesRouter.get('/', protect('iam.read'), asyncHandler(async (req, res) => ok(res, await svc.listRoles())));
rolesRouter.get('/:id', protect('iam.read'), validate(idParams, 'params'), asyncHandler(async (req, res) => ok(res, await svc.getRole(req.params.id))));
rolesRouter.put('/:id/permissions', protect('iam.admin'), validate(idParams, 'params'),
  validate(z.object({ permission_codes: z.array(z.string().regex(/^[a-z_]+\.[a-z_]+$/)).max(100) })),
  asyncHandler(async (req, res) => ok(res, await svc.setRolePermissions(req.user.id, req.params.id, [...new Set(req.body.permission_codes)]))));

permissionsRouter.get('/', protect('iam.read'), asyncHandler(async (req, res) => ok(res, await svc.listPermissions())));

organizationsRouter.get('/', protect('iam.read'), asyncHandler(async (req, res) => ok(res, await svc.listOrganizations())));
organizationsRouter.post('/', protect('iam.write'),
  validate(z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,32}$/), name: z.string().trim().min(1).max(255), org_type: z.enum(ORG_TYPES).default('RESEARCH') })),
  asyncHandler(async (req, res) => created(res, await svc.createOrganization(req.user.id, req.body))));
organizationsRouter.patch('/:id', protect('iam.write'), validate(idParams, 'params'),
  validate(z.object({ name: z.string().trim().min(1).max(255).optional(), org_type: z.enum(ORG_TYPES).optional() })
    .refine((b) => Object.keys(b).length > 0, { message: 'Không có trường nào để cập nhật' })),
  asyncHandler(async (req, res) => ok(res, await svc.updateOrganization(req.user.id, req.params.id, req.body))));

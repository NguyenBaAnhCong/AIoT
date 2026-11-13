import { AppError } from '../utils/AppError.js';

/**
 * Kiểm tra dữ liệu đầu vào bằng schema zod. Dữ liệu đã kiểm tra thay thế req[source].
 *   router.post('/', validate(z.object({ name: z.string().min(1) })), handler)
 */
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(AppError.badRequest('Dữ liệu không hợp lệ', details));
  }
  req[source] = result.data;
  next();
};

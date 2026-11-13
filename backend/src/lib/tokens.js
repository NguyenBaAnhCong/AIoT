import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// Access token: ngắn hạn, gửi kèm mọi request. Refresh token: dài hạn, chỉ dùng để xin access token mới.
export const signAccess = (userId) =>
  jwt.sign({ typ: 'access' }, env.jwtSecret, { subject: userId, expiresIn: env.accessTtl, algorithm: 'HS256' });

export const signRefresh = (userId) =>
  jwt.sign({ typ: 'refresh' }, env.jwtSecret, { subject: userId, expiresIn: env.refreshTtl, algorithm: 'HS256' });

function verify(token, expectedType) {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    if (payload.typ !== expectedType) throw new Error('sai loại token');
    return payload;
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    throw AppError.unauthorized(expired ? 'Phiên đăng nhập đã hết hạn' : 'Token không hợp lệ');
  }
}
export const verifyAccess = (t) => verify(t, 'access');
export const verifyRefresh = (t) => verify(t, 'refresh');

/** Thời gian sống của access token tính bằng giây (để frontend biết khi nào cần làm mới). */
export const accessTtlSeconds = () => {
  const { exp, iat } = jwt.decode(signAccess('00000000-0000-0000-0000-000000000000'));
  return exp - iat;
};

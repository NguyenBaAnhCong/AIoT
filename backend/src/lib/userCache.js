import { fetchUserContext } from '../modules/auth/auth.queries.js';

// Cache ngắn hạn để không phải truy vấn vai trò/quyền ở MỌI request.
// Thời gian sống ngắn (15 giây) nên đổi quyền hoặc khóa tài khoản có hiệu lực gần như ngay.
const TTL_MS = 15_000;
const cache = new Map(); // userId -> { at, ctx }

export async function getUserContext(userId) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ctx;
  const ctx = await fetchUserContext(userId);
  cache.set(userId, { at: Date.now(), ctx });
  return ctx;
}

/** Gọi sau khi sửa vai trò/quyền/khóa user để có hiệu lực ngay (không cần đợi hết TTL). */
export const invalidateUser = (userId) => (userId ? cache.delete(userId) : cache.clear());

// Định dạng phản hồi thành công thống nhất cho cả nhóm:
//   { "data": ..., "meta": { "page", "limit", "total" } }
export const ok = (res, data, meta) => res.json(meta ? { data, meta } : { data });
export const created = (res, data) => res.status(201).json({ data });
export const noContent = (res) => res.status(204).end();

/** Đọc ?page=&limit= từ query, có giới hạn trên để tránh kéo quá nhiều dữ liệu. */
export function parsePaging(query, { defaultLimit = 20, maxLimit = 200 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

/** Phân trang. meta = { page, limit, total } lấy từ api.page(). */
export default function Pager({ meta, onPage }) {
  if (!meta) return null;
  const pages = Math.max(1, Math.ceil(meta.total / meta.limit));
  return (
    <div className="pager">
      <span className="muted small">{meta.total} bản ghi · trang {meta.page}/{pages}</span>
      <span>
        <button className="btn btn-sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>‹ Trước</button>{' '}
        <button className="btn btn-sm" disabled={meta.page >= pages} onClick={() => onPage(meta.page + 1)}>Sau ›</button>
      </span>
    </div>
  );
}

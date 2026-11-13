export function Spinner({ full = false, label = 'Đang tải…' }) {
  return (
    <div className={full ? 'spinner-full' : 'spinner-inline'} role="status">
      <span className="spinner" /> <span className="muted">{label}</span>
    </div>
  );
}

/** Hiển thị lỗi từ API. Truyền thêm onRetry để có nút "Thử lại". */
export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      <div>
        <strong>{error.message || 'Đã xảy ra lỗi'}</strong>
        {error.details?.length > 0 && (
          <ul>{error.details.map((d, i) => <li key={i}>{d.field ? `${d.field}: ` : ''}{d.message}</li>)}</ul>
        )}
      </div>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>Thử lại</button>}
    </div>
  );
}

export function EmptyState({ title = 'Chưa có dữ liệu', hint }) {
  return (
    <div className="empty">
      <div className="empty-icon">∅</div>
      <div className="empty-title">{title}</div>
      {hint && <div className="muted">{hint}</div>}
    </div>
  );
}

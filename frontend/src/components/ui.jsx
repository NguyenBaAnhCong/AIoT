// Bộ component giao diện dùng chung. Dùng lại thay vì tự viết kiểu riêng để 14 màn hình đồng nhất.

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Thẻ số liệu (KPI). tone: 'ok' | 'warn' | 'bad' | undefined */
export function Stat({ label, value, unit, hint, tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value ?? '—'}{unit && <span className="stat-unit"> {unit}</span>}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}

/** Nhãn trạng thái. tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral' */
export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Button({ variant = 'default', size, loading, children, ...rest }) {
  const cls = ['btn', variant !== 'default' && `btn-${variant}`, size && `btn-${size}`].filter(Boolean).join(' ');
  return <button className={cls} disabled={loading || rest.disabled} {...rest}>{loading ? 'Đang xử lý…' : children}</button>;
}

export function Field({ label, error, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

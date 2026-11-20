import { Button } from '../../components/ui';

export default function Pager({ page, limit, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return <div className="tv4-pager"><span className="muted small">Trang {page}/{pages}</span><Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Trước</Button><Button size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Sau</Button></div>;
}

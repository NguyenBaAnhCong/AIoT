import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import { EmptyState, ErrorBox, Spinner } from '../../components/Feedback';
import { Badge, Button, Card, PageHeader, Stat } from '../../components/ui';
import { CMP, HEALTH, KPI_GROUPS, ago, fullTime, isStale, num, progress, unitText } from './helpers';
import './dashboard.css';

// Màn hình 01 – Dashboard tổng quan (TV1). Dữ liệu từ GET /api/v1/dashboard/summary (chỉ đọc các view báo cáo).
const REFRESH_MS = 30_000;

export default function DashboardPage() {
  const { user, can } = useAuth();
  const summary = useApi(() => api.get('/dashboard/summary'), []);
  const [auto, setAuto] = useState(true);
  const [, setNow] = useState(0);

  // Tự làm mới mỗi 30 giây (giữ dữ liệu cũ trên màn hình trong lúc tải, không nhấp nháy)
  useEffect(() => {
    if (!auto) return undefined;
    const id = setInterval(() => { summary.reload(); setNow((n) => n + 1); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps

  // Giữ dữ liệu lần tải thành công gần nhất: nếu một lần làm mới bị lỗi thì vẫn hiển thị số liệu cũ kèm cảnh báo
  const lastGood = useRef(null);
  if (summary.data) lastGood.current = summary.data;
  const d = summary.data ?? lastGood.current;
  const gateways = useMemo(() => {
    const m = new Map();
    (d?.plots || []).forEach((p) => { if (p.gateway_code && !m.has(p.gateway_code)) m.set(p.gateway_code, p); });
    return [...m.values()];
  }, [d]);
  const latestReading = useMemo(() => (d?.plots || []).reduce((max, p) => (p.last_reading_at && (!max || p.last_reading_at > max) ? p.last_reading_at : max), null), [d]);

  return (
    <>
      <PageHeader
        title="Dashboard tổng quan"
        subtitle={`Xin chào, ${user.fullName}${d ? ` · cập nhật lúc ${new Date(d.generated_at).toLocaleTimeString('vi-VN')}` : ''}`}
        actions={
          <div className="dash-actions">
            <label><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Tự làm mới (30 giây)</label>
            <Button size="sm" onClick={summary.reload} loading={summary.loading && !!d}>Làm mới</Button>
          </div>}
      />
      <ErrorBox error={summary.error ? { ...summary.error, message: d ? `${summary.error.message}. Đang hiển thị số liệu của lần cập nhật trước (${new Date(d.generated_at).toLocaleTimeString('vi-VN')}).` : summary.error.message } : null} onRetry={summary.reload} />
      {summary.loading && !d && <Spinner />}

      {d && (
        <>
          <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            <Stat label="KPI nghiệm thu đạt" value={`${d.acceptance.passed}/${d.acceptance.total}`}
              tone={d.acceptance.failed > 0 ? 'bad' : d.acceptance.pending > 0 ? 'warn' : 'ok'}
              hint={d.acceptance.failed ? `${d.acceptance.failed} chưa đạt` : d.acceptance.pending ? `${d.acceptance.pending} chưa có dữ liệu` : 'Đạt toàn bộ chỉ tiêu'} />
            <div className={`stat ${d.open_alerts === 0 ? 'stat-ok' : d.open_alerts >= 10 ? 'stat-bad' : 'stat-warn'}`}>
              <div className="stat-label">Cảnh báo đang mở</div>
              <div className="stat-value">{d.open_alerts}</div>
              <div className="small">{can('alert.read') ? <Link to="/alerts">Xem chi tiết →</Link> : <span className="muted">&nbsp;</span>}</div>
            </div>
            <Stat label="Ô thí nghiệm" value={d.plots.length} hint={`${d.plots.filter((p) => p.node_status === 'ONLINE').length} node đang trực tuyến`} tone={d.plots.every((p) => p.node_status === 'ONLINE') && d.plots.length ? 'ok' : 'warn'} />
            <Stat label="Dữ liệu cảm biến mới nhất" value={ago(latestReading)} tone={isStale(latestReading) ? 'warn' : 'ok'}
              hint={isStale(latestReading) ? `Quá 1 giờ chưa có số đo mới (${fullTime(latestReading)})` : fullTime(latestReading)} />
          </div>

          {KPI_GROUPS.map((g) => {
            const items = d.acceptance.kpis.filter((k) => g.match(k.kpi_code));
            if (!items.length) return null;
            return (
              <section key={g.id}>
                <h2 className="section-title">{g.title} <small>{items.filter((k) => k.passed).length}/{items.length} đạt</small></h2>
                <div className="kpi-grid">{items.map((k) => <KpiCard key={k.kpi_code} k={k} />)}</div>
              </section>);
          })}

          <h2 className="section-title">Các ô thí nghiệm <small>số đo mới nhất và chỉ số sức khỏe đất (SQI)</small></h2>
          <Card>
            {d.plots.length === 0 ? <EmptyState title="Chưa có ô thí nghiệm" /> : (
              <>
                <DataTable rowKey="plot_id" rows={d.plots} columns={[
                  { key: 'plot', title: 'Ô', render: (p) => <><strong>{p.plot_code}</strong><div className="muted small">{p.site_code}</div></> },
                  { key: 'treatment', title: 'Nghiệm thức', render: (p) => <>{p.treatment_code ?? '—'}<div className="muted small">{p.biochar_dose_kg_m2 != null ? `${num(p.biochar_dose_kg_m2)} kg/m²` : '—'}</div></> },
                  { key: 'ph', title: 'pH', render: (p) => <span className="num">{num(p.ph)}</span> },
                  { key: 'ec', title: 'EC', render: (p) => <span className="num">{num(p.ec)}</span> },
                  { key: 'm', title: 'Độ ẩm %', render: (p) => <span className="num">{num(p.soil_moisture)}</span> },
                  { key: 'n', title: 'N', render: (p) => <span className="num">{num(p.n)}</span> },
                  { key: 'p', title: 'P', render: (p) => <span className="num">{num(p.p)}</span> },
                  { key: 'k', title: 'K', render: (p) => <span className="num">{num(p.k)}</span> },
                  { key: 'sqi', title: 'SQI', render: (p) => <SqiCell p={p} /> },
                  { key: 'alerts', title: 'Cảnh báo', render: (p) => <Badge tone={p.open_alerts > 0 ? 'warn' : 'ok'}>{p.open_alerts}</Badge> },
                  { key: 'seen', title: 'Số đo gần nhất', render: (p) => <span title={fullTime(p.last_reading_at)} className={isStale(p.last_reading_at) ? 'muted' : ''}>{ago(p.last_reading_at)}</span> },
                ]} />
                <div className="legend"><span><Badge tone="ok">Rất tốt / Tốt</Badge> SQI ≥ 0,6</span><span><Badge tone="warn">Trung bình</Badge> 0,4 – 0,6</span><span><Badge tone="bad">Kém</Badge> &lt; 0,4</span></div>
              </>)}
          </Card>

          <h2 className="section-title">Thiết bị</h2>
          <div className="infra">
            <Card title="Edge Gateway">
              {gateways.length === 0 ? <EmptyState title="Chưa có gateway" /> : gateways.map((g) => (
                <div key={g.gateway_code} style={{ marginBottom: 8 }}>
                  <span className={`dot ${g.gateway_status === 'ONLINE' ? '' : 'bad'}`} /><strong>{g.gateway_code}</strong> <Badge tone={g.gateway_status === 'ONLINE' ? 'ok' : 'bad'}>{g.gateway_status}</Badge>
                  <div className="muted small">Mô hình đang chạy: {g.gateway_model_version ?? '—'} · số đo gần nhất {ago(g.last_reading_at)}</div>
                </div>))}
            </Card>
            <Card title="Sensor Node">
              {d.plots.map((p) => (
                <div key={p.plot_id} style={{ marginBottom: 6 }}>
                  <span className={`dot ${p.node_status === 'ONLINE' ? '' : 'bad'}`} /><strong>{p.node_code ?? '—'}</strong> · ô {p.plot_code} <Badge tone={p.node_status === 'ONLINE' ? 'ok' : 'bad'}>{p.node_status ?? '—'}</Badge>
                  <span className="muted small"> · thấy lần cuối {ago(p.last_seen_at)}</span>
                </div>))}
            </Card>
          </div>
        </>)}
    </>
  );
}

function KpiCard({ k }) {
  const none = k.current_value == null;
  const state = none ? 'pend' : k.passed ? '' : 'fail';
  return (
    <div className={`kpi ${state}`}>
      <div className="kpi-head">
        <div className="kpi-name">{k.name_vi}</div>
        <Badge tone={none ? 'neutral' : k.passed ? 'ok' : 'bad'}>{none ? 'Chưa có' : k.passed ? 'Đạt' : 'Chưa đạt'}</Badge>
      </div>
      <div className="kpi-value">{num(k.current_value)}<small>{unitText(k.unit)}</small></div>
      <div className="kpi-target">Mục tiêu: {CMP[k.comparator] ?? k.comparator} {num(k.target_value)}{unitText(k.unit)}</div>
      <div className={`bar ${none ? 'none' : k.passed ? '' : 'bad'}`}><span style={{ width: `${progress(k)}%` }} /></div>
    </div>
  );
}

function SqiCell({ p }) {
  if (p.sqi_value == null) return <span className="muted">—</span>;
  const h = HEALTH[p.health_class] ?? { label: p.health_class ?? '—', tone: 'neutral' };
  return (
    <div className="sqi-cell" title={`Tính ngày ${fullTime(p.sqi_date)}`}>
      <strong>{num(p.sqi_value, 2)}</strong> <Badge tone={h.tone}>{h.label}</Badge>
      <div className={`bar ${h.tone === 'ok' ? '' : h.tone}`}><span style={{ width: `${Math.min(100, p.sqi_value * 100)}%` }} /></div>
    </div>
  );
}

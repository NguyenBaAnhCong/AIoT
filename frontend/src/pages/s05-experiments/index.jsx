import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import { ErrorBox, Spinner } from '../../components/Feedback';
import { Badge, Button, Card, Field, PageHeader, Stat } from '../../components/ui';
import { fmtDate, fmtNum, QuickForm, StatusBadge, Tabs, Toggle, today, useAction } from '../tv3/shared';

// Màn hình 05 – Thí nghiệm & nghiệm thức (TV3).
// Chọn thí nghiệm -> xem nghiệm thức, ô đang áp dụng nghiệm thức nào, lịch sử bón, giai đoạn sinh trưởng.
const NEXT = { PLANNED: [['RUNNING', 'Bắt đầu'], ['CANCELLED', 'Hủy']], RUNNING: [['COMPLETED', 'Hoàn thành'], ['CANCELLED', 'Hủy']] };

export default function ExperimentsPage() {
  const { can } = useAuth();
  const canWrite = can('experiment.write');
  const experiments = useApi(() => api.get('/experiment/experiments', { limit: 100 }), []);
  const [picked, setPicked] = useState('');
  const id = picked || experiments.data?.[0]?.experiment_id;

  return (
    <>
      <PageHeader title="Thí nghiệm & nghiệm thức"
        subtitle="Thiết kế thí nghiệm, nghiệm thức biochar, gán nghiệm thức cho ô và theo dõi giai đoạn sinh trưởng"
        actions={experiments.data?.length > 0 && (
          <select value={id} onChange={(e) => setPicked(e.target.value)} aria-label="Chọn thí nghiệm">
            {experiments.data.map((x) => <option key={x.experiment_id} value={x.experiment_id}>{x.experiment_code} – {x.title}</option>)}
          </select>
        )} />
      <ErrorBox error={experiments.error} onRetry={experiments.reload} />
      {experiments.loading && <Spinner />}
      {canWrite && <Card><Toggle label="+ Thí nghiệm mới">{(close) => <NewExperiment onDone={() => { close(); experiments.reload(); }} />}</Toggle></Card>}
      {id && <ExperimentDetail key={id} id={id} canWrite={canWrite} onChanged={experiments.reload} />}
    </>
  );
}

function NewExperiment({ onDone }) {
  const sites = useApi(() => api.get('/farm/sites'), []);
  return (
    <QuickForm submitLabel="Tạo thí nghiệm" onSubmit={async (b) => { await api.post('/experiment/experiments', b); onDone(); }}
      fields={[
        { name: 'site_id', label: 'Khu thí nghiệm', required: true, options: (sites.data || []).map((s) => [s.site_id, `${s.site_code} – ${s.name}`]) },
        { name: 'experiment_code', label: 'Mã thí nghiệm', required: true },
        { name: 'title', label: 'Tên', required: true },
        { name: 'design_type', label: 'Thiết kế', options: [['RCBD', 'RCBD'], ['CRD', 'CRD'], ['SPLIT_PLOT', 'Split-plot'], ['FACTORIAL', 'Giai thừa'], ['OBSERVATIONAL', 'Quan sát']] },
        { name: 'replicates', label: 'Số lần lặp', type: 'number' },
        { name: 'started_on', label: 'Ngày bắt đầu', type: 'date', required: true },
      ]} />
  );
}

function ExperimentDetail({ id, canWrite, onChanged }) {
  const exp = useApi(() => api.get(`/experiment/experiments/${id}/summary`), [id]);
  const [tab, setTab] = useState('treatments');
  const act = useAction();
  if (exp.loading) return <Spinner />;
  if (exp.error) return <ErrorBox error={exp.error} onRetry={exp.reload} />;
  const e = exp.data;

  const changeStatus = (status) => act.run(status, async () => {
    const body = { status };
    if (status === 'COMPLETED') body.ended_on = today();
    await api.patch(`/experiment/experiments/${id}`, body);
    exp.reload();
    onChanged();
  });

  return (
    <>
      <div className="tv3-stats">
        <Stat label="Trạng thái" value={<StatusBadge value={e.status} />} hint={`${fmtDate(e.started_on)} → ${fmtDate(e.ended_on)}`} />
        <Stat label="Thiết kế" value={e.design_type} hint={`${e.replicates} lần lặp · khu ${e.site_code}`} />
        <Stat label="Nghiệm thức" value={e.treatment_count} />
        <Stat label="Ô tham gia" value={e.plot_count} />
      </div>
      {e.objective && <p className="muted">{e.objective}</p>}
      {canWrite && NEXT[e.status] && (
        <div className="tv3-actions" style={{ marginBottom: 12 }}>
          {NEXT[e.status].map(([s, label]) => (
            <Button key={s} size="sm" variant={s === 'CANCELLED' ? 'danger' : 'default'} loading={act.busy === s}
              onClick={() => (s !== 'CANCELLED' || window.confirm('Hủy thí nghiệm này?')) && changeStatus(s)}>{label}</Button>
          ))}
        </div>
      )}
      <ErrorBox error={act.error} />

      <Tabs value={tab} onChange={setTab} tabs={[['treatments', 'Nghiệm thức'], ['plots', 'Ô & gán nghiệm thức'],
        ['history', 'Lịch sử bón'], ['stages', 'Giai đoạn sinh trưởng']]} />
      {tab === 'treatments' && <Treatments exp={e} canWrite={canWrite} onChanged={exp.reload} />}
      {tab === 'plots' && <Plots exp={e} canWrite={canWrite} onChanged={exp.reload} />}
      {tab === 'history' && <History exp={e} canWrite={canWrite} />}
      {tab === 'stages' && <Stages />}
    </>
  );
}

function Treatments({ exp, canWrite, onChanged }) {
  const list = useApi(() => api.get('/experiment/treatments', { experiment_id: exp.experiment_id, limit: 100 }), [exp.experiment_id]);
  const batches = useApi(() => api.get('/biochar/batches', { limit: 100 }), []);
  const enrich = useApi(() => api.get('/biochar/enrichment-batches', { limit: 100 }), []);
  const columns = [
    { key: 'treatment_code', title: 'Mã', render: (r) => <strong>{r.treatment_code}</strong> },
    { key: 'name', title: 'Tên' },
    { key: 'control_flag', title: 'Loại', render: (r) => (r.control_flag ? <Badge tone="info">Đối chứng</Badge> : <Badge tone="ok">Biochar</Badge>) },
    { key: 'dose', title: 'Liều (kg/m²)', render: (r) => fmtNum(r.biochar_dose_kg_m2, 3) },
    { key: 'batch', title: 'Lô biochar / làm giàu', render: (r) => [r.biochar_batch_code, r.enrichment_batch_code].filter(Boolean).join(' → ') || '—' },
    { key: 'microbial_formula', title: 'Vi sinh' },
    { key: 'application_count', title: 'Số lần áp dụng' },
  ];
  return (
    <Card title="Nghiệm thức của thí nghiệm" actions={
      <Toggle label="+ Nghiệm thức" allowed={canWrite}>{(close) => (
        <QuickForm submitLabel="Thêm nghiệm thức"
          onSubmit={async (b) => { await api.post('/experiment/treatments', { ...b, experiment_id: exp.experiment_id }); close(); list.reload(); onChanged(); }}
          fields={[
            { name: 'treatment_code', label: 'Mã', required: true, placeholder: 'vd T3-BC20' },
            { name: 'name', label: 'Tên', required: true },
            { name: 'control_flag', label: 'Đối chứng (không bón biochar)', type: 'checkbox' },
            { name: 'biochar_dose_kg_m2', label: 'Liều biochar (kg/m²)', type: 'number' },
            { name: 'biochar_batch_id', label: 'Lô biochar', options: (batches.data || []).map((b) => [b.biochar_batch_id, `${b.batch_code} (${b.safety_status})`]) },
            { name: 'enrichment_batch_id', label: 'Lô làm giàu', options: (enrich.data || []).map((b) => [b.enrichment_batch_id, b.batch_code]) },
            { name: 'microbial_formula', label: 'Chế phẩm vi sinh' },
            { name: 'fertilizer_desc', label: 'Phân bón nền' },
          ]} />
      )}</Toggle>
    }>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <DataTable columns={columns} rows={list.data} loading={list.loading} rowKey="treatment_id" empty={{ title: 'Chưa có nghiệm thức' }} />
    </Card>
  );
}

function Plots({ exp, canWrite, onChanged }) {
  const plots = useApi(() => api.get('/farm/plots', { site_id: exp.site_id, limit: 200 }), [exp.site_id]);
  const treatments = useApi(() => api.get('/experiment/treatments', { experiment_id: exp.experiment_id, limit: 100 }), [exp.experiment_id]);
  const columns = [
    { key: 'plot_code', title: 'Ô', render: (r) => <strong>{r.plot_code}</strong> },
    { key: 'block_no', title: 'Khối' },
    { key: 'soil_type', title: 'Loại đất', render: (r) => [r.soil_type, r.soil_texture].filter(Boolean).join(' · ') },
    { key: 'area_m2', title: 'Diện tích (m²)', render: (r) => fmtNum(r.area_m2) },
    { key: 'status', title: 'Trạng thái', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'current', title: 'Nghiệm thức hiện tại', render: (r) => (r.current_treatment_code ? <Badge tone="ok">{r.current_treatment_code}</Badge> : <span className="muted">chưa gán</span>) },
    { key: 'dose', title: 'Liều đang áp dụng', render: (r) => (r.current_treatment_code ? `${fmtNum(r.current_biochar_dose_kg_m2, 3)} kg/m²` : '—') },
  ];
  const open = ['PLANNED', 'RUNNING'].includes(exp.status);
  return (
    <Card title={`Ô thuộc khu ${exp.site_code}`} actions={
      <Toggle label="Gán nghiệm thức cho ô" allowed={canWrite && open}>{(close) => (
        <QuickForm submitLabel="Gán"
          onSubmit={async (b) => { await api.post('/experiment/treatment-applications', b); close(); plots.reload(); onChanged(); }}
          initial={{ applied_on: today() }}
          fields={[
            { name: 'plot_id', label: 'Ô', required: true, options: (plots.data || []).filter((p) => p.status === 'ACTIVE').map((p) => [p.plot_id, `${p.plot_code}${p.current_treatment_code ? ` (đang ${p.current_treatment_code})` : ''}`]) },
            { name: 'treatment_id', label: 'Nghiệm thức', required: true, options: (treatments.data || []).map((t) => [t.treatment_id, `${t.treatment_code} – ${t.name}`]) },
            { name: 'applied_on', label: 'Ngày bón', type: 'date', required: true },
            { name: 'actual_dose_kg_m2', label: 'Liều thực tế (kg/m²)', type: 'number' },
            { name: 'replicate_no', label: 'Lần lặp', type: 'number' },
            { name: 'notes', label: 'Ghi chú' },
          ]} />
      )}</Toggle>
    }>
      <p className="muted small">Mỗi ô tại một thời điểm chỉ có một nghiệm thức. Muốn đổi, vào tab “Lịch sử bón” kết thúc lần áp dụng cũ trước.</p>
      <ErrorBox error={plots.error} onRetry={plots.reload} />
      <DataTable columns={columns} rows={plots.data} loading={plots.loading} rowKey="plot_id" />
    </Card>
  );
}

function History({ exp, canWrite }) {
  const apps = useApi(() => api.get('/experiment/treatment-applications', { experiment_id: exp.experiment_id, limit: 200 }), [exp.experiment_id]);
  const act = useAction();
  const end = (r) => act.run(r.application_id, async () => {
    if (!window.confirm(`Kết thúc nghiệm thức ${r.treatment_code} trên ô ${r.plot_code} từ bây giờ?`)) return;
    await api.patch(`/experiment/treatment-applications/${r.application_id}`, { effective_to: new Date().toISOString() });
    apps.reload();
  });
  const columns = [
    { key: 'plot_code', title: 'Ô' },
    { key: 'treatment_code', title: 'Nghiệm thức' },
    { key: 'season_code', title: 'Mùa vụ' },
    { key: 'applied_on', title: 'Ngày bón', render: (r) => fmtDate(r.applied_on) },
    { key: 'effective_dose_kg_m2', title: 'Liều (kg/m²)', render: (r) => fmtNum(r.effective_dose_kg_m2, 3) },
    { key: 'range', title: 'Hiệu lực', render: (r) => `${fmtDate(r.effective_from)} → ${r.effective_to ? fmtDate(r.effective_to) : 'nay'}` },
    { key: 'is_active', title: '', render: (r) => (r.is_active ? <Badge tone="ok">Đang hiệu lực</Badge> : <Badge>Đã kết thúc</Badge>) },
    { key: 'applied_by_name', title: 'Người bón' },
    { key: 'act', title: '', render: (r) => canWrite && r.is_active && <Button size="sm" loading={act.busy === r.application_id} onClick={() => end(r)}>Kết thúc</Button> },
  ];
  return (
    <Card title="Lịch sử áp dụng nghiệm thức">
      <ErrorBox error={act.error || apps.error} onRetry={apps.reload} />
      <DataTable columns={columns} rows={apps.data} loading={apps.loading} rowKey="application_id" />
    </Card>
  );
}

function Stages() {
  const [plot, setPlot] = useState('');
  const plots = useApi(() => api.get('/farm/plots', { limit: 200 }), []);
  const stages = useApi(() => api.get('/experiment/plot-growth-stages', { plot_id: plot || undefined, limit: 200 }), [plot]);
  const columns = [
    { key: 'plot_code', title: 'Ô' },
    { key: 'season_code', title: 'Mùa vụ' },
    { key: 'stage', title: 'Giai đoạn', render: (r) => `${r.stage_order}. ${r.stage_name}` },
    { key: 'started_at', title: 'Bắt đầu', render: (r) => fmtDate(r.started_at) },
    { key: 'ended_at', title: 'Kết thúc', render: (r) => (r.ended_at ? fmtDate(r.ended_at) : <Badge tone="ok">đang diễn ra</Badge>) },
    { key: 'observed_by_name', title: 'Người ghi nhận' },
  ];
  return (
    <Card title="Giai đoạn sinh trưởng theo ô">
      <div className="tv3-toolbar">
        <Field label="Ô">
          <select value={plot} onChange={(e) => setPlot(e.target.value)}>
            <option value="">Tất cả</option>
            {(plots.data || []).map((p) => <option key={p.plot_id} value={p.plot_id}>{p.plot_code}</option>)}
          </select>
        </Field>
      </div>
      <ErrorBox error={stages.error} onRetry={stages.reload} />
      <DataTable columns={columns} rows={stages.data} loading={stages.loading} rowKey="plot_growth_stage_id" />
    </Card>
  );
}

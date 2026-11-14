import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import { ErrorBox, Spinner } from '../../components/Feedback';
import { Badge, Button, Card, PageHeader, Stat } from '../../components/ui';
import { fmtDate, fmtNum, QuickForm, StatusBadge, Tabs, Toggle, useAction } from '../tv3/shared';

// Màn hình 06 – Biochar & làm giàu (TV3).
// Chuỗi: lô phụ phẩm vải -> nhiệt phân -> lô biochar (chất lượng, an toàn) -> lô làm giàu -> nghiệm thức -> ô.
const FEEDSTOCK = [['LITCHI_PRUNING', 'Cành tỉa vải'], ['LITCHI_BRANCH', 'Cành vải'], ['LITCHI_LEAF', 'Lá vải'],
  ['LITCHI_PEEL', 'Vỏ vải'], ['LITCHI_SEED', 'Hạt vải'], ['MIXED', 'Hỗn hợp'], ['OTHER', 'Khác']];
const FEEDSTOCK_LABEL = Object.fromEntries(FEEDSTOCK);
const ENRICH = [['MICROBIAL', 'Vi sinh'], ['NUTRIENT', 'Dinh dưỡng'], ['COMPOST', 'Ủ compost'], ['MIXED', 'Kết hợp']];
const metals = (m) => (m ? Object.entries(m).map(([k, v]) => `${k} ${fmtNum(v, 3)}`).join(', ') : '—');

export default function BiocharPage() {
  const { can } = useAuth();
  const canWrite = can('biochar.write');
  const feed = useApi(() => api.get('/biochar/feedstock-batches', { limit: 200 }), []);
  const bio = useApi(() => api.get('/biochar/batches', { limit: 200 }), []);
  const enr = useApi(() => api.get('/biochar/enrichment-batches', { limit: 200 }), []);
  const [tab, setTab] = useState('biochar');
  const [trace, setTrace] = useState(null);
  const reloadAll = () => { feed.reload(); bio.reload(); enr.reload(); };

  const failed = (bio.data || []).filter((b) => b.safety_status === 'FAILED').length;
  const pending = (bio.data || []).filter((b) => b.safety_status === 'PENDING').length;
  const yields = (bio.data || []).map((b) => b.yield_pct).filter((v) => v != null);

  return (
    <>
      <PageHeader title="Biochar & làm giàu" subtitle="Từ phụ phẩm cây vải đến lô biochar bón ngoài đồng: thông số nhiệt phân, chất lượng, an toàn và truy xuất nguồn gốc" />
      <div className="tv3-stats">
        <Stat label="Lô phụ phẩm" value={feed.data?.length} hint={`${fmtNum((feed.data || []).reduce((s, f) => s + Number(f.mass_kg), 0))} kg đã thu gom`} />
        <Stat label="Lô biochar" value={bio.data?.length} hint={yields.length ? `Hiệu suất TB ${fmtNum(yields.reduce((a, b) => a + b, 0) / yields.length, 1)}%` : undefined} />
        <Stat label="Chờ kiểm tra an toàn" value={pending} tone={pending ? 'warn' : undefined} />
        <Stat label="Không đạt an toàn" value={failed} tone={failed ? 'bad' : 'ok'} />
        <Stat label="Lô làm giàu" value={enr.data?.length} />
      </div>

      {trace && <Trace {...trace} onClose={() => setTrace(null)} />}

      <Tabs value={tab} onChange={setTab} tabs={[['biochar', 'Lô biochar'], ['feedstock', 'Lô phụ phẩm'], ['enrichment', 'Làm giàu']]} />
      {tab === 'feedstock' && <Feedstock list={feed} canWrite={canWrite} onChanged={reloadAll} />}
      {tab === 'biochar' && <Biochar list={bio} feed={feed.data} canWrite={canWrite} onChanged={reloadAll}
        onTrace={(b) => setTrace({ kind: 'batches', id: b.biochar_batch_id, code: b.batch_code })} />}
      {tab === 'enrichment' && <Enrichment list={enr} bio={bio.data} canWrite={canWrite} onChanged={reloadAll}
        onTrace={(e) => setTrace({ kind: 'enrichment-batches', id: e.enrichment_batch_id, code: e.batch_code })} />}
    </>
  );
}

function Feedstock({ list, canWrite, onChanged }) {
  const columns = [
    { key: 'batch_code', title: 'Mã lô', render: (r) => <strong>{r.batch_code}</strong> },
    { key: 'feedstock_type', title: 'Loại', render: (r) => FEEDSTOCK_LABEL[r.feedstock_type] || r.feedstock_type },
    { key: 'source_location', title: 'Nguồn' },
    { key: 'collected_on', title: 'Ngày thu gom', render: (r) => fmtDate(r.collected_on) },
    { key: 'mass_kg', title: 'Khối lượng (kg)', render: (r) => fmtNum(r.mass_kg) },
    { key: 'used', title: 'Đã nhiệt phân', render: (r) => `${fmtNum(r.used_mass_kg)} kg (${fmtNum((100 * r.used_mass_kg) / r.mass_kg, 0)}%)` },
    { key: 'moisture_pct', title: 'Độ ẩm (%)', render: (r) => fmtNum(r.moisture_pct, 1) },
    { key: 'pretreatment', title: 'Sơ chế' },
  ];
  return (
    <Card title="Lô phụ phẩm cây vải" actions={
      <Toggle label="+ Lô phụ phẩm" allowed={canWrite}>{(close) => (
        <QuickForm submitLabel="Thêm lô" onSubmit={async (b) => { await api.post('/biochar/feedstock-batches', b); close(); onChanged(); }}
          fields={[
            { name: 'batch_code', label: 'Mã lô', required: true },
            { name: 'feedstock_type', label: 'Loại phụ phẩm', options: FEEDSTOCK },
            { name: 'collected_on', label: 'Ngày thu gom', type: 'date', required: true },
            { name: 'mass_kg', label: 'Khối lượng (kg)', type: 'number', required: true },
            { name: 'moisture_pct', label: 'Độ ẩm (%)', type: 'number' },
            { name: 'source_location', label: 'Nguồn (vườn, xã)' },
            { name: 'pretreatment', label: 'Sơ chế (phơi, băm...)' },
          ]} />
      )}</Toggle>
    }>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <DataTable columns={columns} rows={list.data} loading={list.loading} rowKey="feedstock_batch_id" />
    </Card>
  );
}

function Biochar({ list, feed, canWrite, onChanged, onTrace }) {
  const act = useAction();
  const setSafety = (r, safety_status) => act.run(r.biochar_batch_id + safety_status, async () => {
    await api.patch(`/biochar/batches/${r.biochar_batch_id}`, { safety_status });
    onChanged();
  });
  const columns = [
    { key: 'batch_code', title: 'Mã lô', render: (r) => <strong>{r.batch_code}</strong> },
    { key: 'feedstock_batch_code', title: 'Từ lô phụ phẩm' },
    { key: 'produced_on', title: 'Ngày sản xuất', render: (r) => fmtDate(r.produced_on) },
    { key: 'pyro', title: 'Nhiệt phân', render: (r) => `${fmtNum(r.pyrolysis_temp_c, 0)}°C · ${fmtNum(r.residence_time_min, 0)} phút` },
    { key: 'yield_pct', title: 'Hiệu suất', render: (r) => (r.yield_pct != null ? `${fmtNum(r.yield_pct, 1)}%` : '—') },
    { key: 'quality', title: 'pH · C · tro', render: (r) => `${fmtNum(r.ph, 2)} · ${fmtNum(r.carbon_pct, 1)}% · ${fmtNum(r.ash_pct, 1)}%` },
    { key: 'heavy_metals_mg_kg', title: 'Kim loại nặng (mg/kg)', render: (r) => metals(r.heavy_metals_mg_kg) },
    { key: 'safety_status', title: 'An toàn', render: (r) => <StatusBadge value={r.safety_status} /> },
    { key: 'act', title: '', render: (r) => (
      <div className="tv3-actions">
        <Button size="sm" onClick={() => onTrace(r)}>Truy xuất</Button>
        {canWrite && r.safety_status === 'PENDING' && <>
          <Button size="sm" loading={act.busy === r.biochar_batch_id + 'PASSED'} onClick={() => setSafety(r, 'PASSED')}>Đạt</Button>
          <Button size="sm" variant="danger" loading={act.busy === r.biochar_batch_id + 'FAILED'} onClick={() => setSafety(r, 'FAILED')}>Không đạt</Button>
        </>}
      </div>
    ) },
  ];
  return (
    <Card title="Lô biochar" actions={
      <Toggle label="+ Lô biochar" allowed={canWrite}>{(close) => (
        <QuickForm submitLabel="Thêm lô" onSubmit={async (b) => { await api.post('/biochar/batches', b); close(); onChanged(); }}
          fields={[
            { name: 'batch_code', label: 'Mã lô', required: true },
            { name: 'feedstock_batch_id', label: 'Lô phụ phẩm', required: true,
              options: (feed || []).map((f) => [f.feedstock_batch_id, `${f.batch_code} (còn ${fmtNum(f.mass_kg - f.used_mass_kg)} kg)`]) },
            { name: 'produced_on', label: 'Ngày sản xuất', type: 'date', required: true },
            { name: 'reactor_type', label: 'Loại lò' },
            { name: 'pyrolysis_temp_c', label: 'Nhiệt độ (°C, 200–1000)', type: 'number' },
            { name: 'residence_time_min', label: 'Thời gian lưu (phút)', type: 'number' },
            { name: 'input_mass_kg', label: 'Khối lượng vào (kg)', type: 'number' },
            { name: 'output_mass_kg', label: 'Khối lượng ra (kg)', type: 'number' },
            { name: 'ph', label: 'pH', type: 'number' },
            { name: 'carbon_pct', label: 'Carbon (%)', type: 'number' },
            { name: 'ash_pct', label: 'Tro (%)', type: 'number' },
            { name: 'cec_cmol_kg', label: 'CEC (cmol/kg)', type: 'number' },
          ]} />
      )}</Toggle>
    }>
      <p className="muted small">Lô “Không đạt” không được dùng cho nghiệm thức hay làm giàu. Muốn kết luận “Đạt” phải có kết quả kim loại nặng.</p>
      <ErrorBox error={act.error || list.error} onRetry={list.error ? list.reload : undefined} />
      <DataTable columns={columns} rows={list.data} loading={list.loading} rowKey="biochar_batch_id" />
    </Card>
  );
}

function Enrichment({ list, bio, canWrite, onChanged, onTrace }) {
  const columns = [
    { key: 'batch_code', title: 'Mã lô', render: (r) => <strong>{r.batch_code}</strong> },
    { key: 'biochar_batch_code', title: 'Từ lô biochar' },
    { key: 'enrichment_type', title: 'Kiểu', render: (r) => Object.fromEntries(ENRICH)[r.enrichment_type] },
    { key: 'formula', title: 'Công thức', render: (r) => [r.microbial_formula, r.nutrient_formula].filter(Boolean).join(' + ') || '—' },
    { key: 'ratio_desc', title: 'Tỉ lệ phối trộn' },
    { key: 'time', title: 'Thời gian', render: (r) => `${fmtDate(r.started_on)} → ${fmtDate(r.finished_on)}` },
    { key: 'incubation_days', title: 'Số ngày ủ' },
    { key: 'result_count', title: 'Kết quả đo' },
    { key: 'act', title: '', render: (r) => <Button size="sm" onClick={() => onTrace(r)}>Truy xuất</Button> },
  ];
  return (
    <Card title="Lô làm giàu biochar" actions={
      <Toggle label="+ Lô làm giàu" allowed={canWrite}>{(close) => (
        <QuickForm submitLabel="Thêm lô" onSubmit={async (b) => { await api.post('/biochar/enrichment-batches', b); close(); onChanged(); }}
          fields={[
            { name: 'batch_code', label: 'Mã lô', required: true },
            { name: 'biochar_batch_id', label: 'Lô biochar', required: true,
              options: (bio || []).filter((b) => b.safety_status !== 'FAILED').map((b) => [b.biochar_batch_id, b.batch_code]) },
            { name: 'enrichment_type', label: 'Kiểu làm giàu', required: true, options: ENRICH },
            { name: 'microbial_formula', label: 'Chủng / chế phẩm vi sinh' },
            { name: 'nutrient_formula', label: 'Công thức dinh dưỡng' },
            { name: 'ratio_desc', label: 'Tỉ lệ phối trộn' },
            { name: 'started_on', label: 'Ngày bắt đầu', type: 'date', required: true },
            { name: 'finished_on', label: 'Ngày kết thúc', type: 'date' },
          ]} />
      )}</Toggle>
    }>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <DataTable columns={columns} rows={list.data} loading={list.loading} rowKey="enrichment_batch_id" />
    </Card>
  );
}

function Trace({ kind, id, code, onClose }) {
  const t = useApi(() => api.get(`/biochar/${kind}/${id}/trace`), [kind, id]);
  return (
    <Card title={`Truy xuất nguồn gốc – ${code}`} actions={<Button size="sm" onClick={onClose}>Đóng</Button>}>
      <ErrorBox error={t.error} onRetry={t.reload} />
      {t.loading ? <Spinner /> : t.data && (
        <div className="tv3-chain">
          <div className="tv3-step">
            <h3>1. Phụ phẩm · {t.data.feedstock.batch_code}</h3>
            <dl>
              <dt>Loại</dt><dd>{FEEDSTOCK_LABEL[t.data.feedstock.feedstock_type]}</dd>
              <dt>Thu gom</dt><dd>{fmtDate(t.data.feedstock.collected_on)}</dd>
              <dt>Nguồn</dt><dd>{t.data.feedstock.source_location || '—'}</dd>
              <dt>Khối lượng</dt><dd>{fmtNum(t.data.feedstock.mass_kg)} kg</dd>
            </dl>
          </div>
          <div className="tv3-step">
            <h3>2. Biochar · {t.data.biochar.batch_code}</h3>
            <dl>
              <dt>Nhiệt phân</dt><dd>{fmtNum(t.data.biochar.pyrolysis_temp_c, 0)}°C, {fmtNum(t.data.biochar.residence_time_min, 0)} phút</dd>
              <dt>Hiệu suất</dt><dd>{fmtNum(t.data.biochar.yield_pct, 1)}%</dd>
              <dt>Kim loại nặng</dt><dd>{metals(t.data.biochar.heavy_metals_mg_kg)}</dd>
              <dt>An toàn</dt><dd><StatusBadge value={t.data.biochar.safety_status} /></dd>
            </dl>
          </div>
          <div className="tv3-step">
            <h3>3. Làm giàu</h3>
            {t.data.enrichments.length ? t.data.enrichments.map((e) => (
              <div key={e.enrichment_batch_id}>
                <strong>{e.batch_code}</strong> <span className="muted">{e.microbial_formula || e.nutrient_formula}</span>
                <div className="small">{e.results.map((r) => (
                  <div key={r.enrichment_result_id}>{r.parameter_code}: {fmtNum(r.value, 3)} {r.unit}
                    {r.pass_flag != null && <> <Badge tone={r.pass_flag ? 'ok' : 'bad'}>{r.pass_flag ? 'đạt' : 'không đạt'}</Badge></>}</div>
                ))}</div>
              </div>
            )) : <span className="muted">Chưa làm giàu</span>}
          </div>
          <div className="tv3-step">
            <h3>4. Bón ngoài đồng</h3>
            {t.data.used_in_treatments.length ? t.data.used_in_treatments.map((u) => (
              <div key={u.treatment_id}>
                <strong>{u.treatment_code}</strong> <span className="muted">({u.experiment_code})</span>
                <div className="small">{u.plots.map((p) => `${p.plot_code}: ${fmtNum(p.dose_kg_m2, 3)} kg/m² ngày ${fmtDate(p.applied_on)}`).join('; ') || 'chưa bón'}</div>
              </div>
            )) : <span className="muted">Chưa dùng cho nghiệm thức nào</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

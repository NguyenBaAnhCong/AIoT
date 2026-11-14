import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import { ErrorBox } from '../../components/Feedback';
import { Badge, Button, Card, Field, PageHeader, Stat } from '../../components/ui';
import { fmtNum, fmtTime, QuickForm, StatusBadge, Tabs, Toggle, useAction } from '../tv3/shared';

// Màn hình 07 – Dữ liệu phòng thí nghiệm (TV3).
// Mẫu đất -> kết quả phân tích -> duyệt DRAFT -> VERIFIED -> APPROVED -> đối chiếu với cảm biến.
export default function LaboratoryPage() {
  const { can } = useAuth();
  const perms = { write: can('laboratory.write'), approve: can('laboratory.approve') };
  const pending = useApi(() => Promise.all([
    api.page('/laboratory/results', { status: 'DRAFT', limit: 1 }),
    api.page('/laboratory/results', { status: 'VERIFIED', limit: 1 }),
    api.page('/laboratory/results', { status: 'APPROVED', limit: 1 }),
    api.page('/laboratory/samples', { limit: 1 }),
  ]), []);
  const [tab, setTab] = useState('results');
  const [n1, n2, n3, n4] = (pending.data || []).map((p) => p.meta.total);

  return (
    <>
      <PageHeader title="Dữ liệu phòng thí nghiệm" subtitle="Mẫu đất, kết quả phân tích pH/N/P/K/EC, quy trình duyệt và đối chiếu với cảm biến" />
      <div className="tv3-stats">
        <Stat label="Mẫu" value={n4} />
        <Stat label="Chờ xác minh (DRAFT)" value={n1} tone={n1 ? 'warn' : undefined} />
        <Stat label="Chờ duyệt (VERIFIED)" value={n2} tone={n2 ? 'warn' : undefined} />
        <Stat label="Đã duyệt" value={n3} tone="ok" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['results', 'Kết quả & duyệt'], ['samples', 'Mẫu'], ['import', 'Nhập Excel'], ['compare', 'Đối chiếu cảm biến']]} />
      {tab === 'results' && <Results perms={perms} onChanged={pending.reload} />}
      {tab === 'samples' && <Samples perms={perms} />}
      {tab === 'import' && <ImportExcel perms={perms} onChanged={pending.reload} />}
      {tab === 'compare' && <Compare />}
    </>
  );
}

function usePlots() {
  return useApi(() => api.get('/farm/plots', { limit: 200 }), []);
}

function Results({ perms, onChanged }) {
  const plots = usePlots();
  const [filter, setFilter] = useState({ status: 'DRAFT', plot_id: '', parameter_code: '', page: 1 });
  const list = useApi(() => api.page('/laboratory/results', { ...filter, limit: 50 }), [JSON.stringify(filter)]);
  const [sel, setSel] = useState([]);
  const [reason, setReason] = useState('');
  const act = useAction();
  const rows = list.data?.data || [];
  const meta = list.data?.meta;
  const set = (k, v) => { setSel([]); setFilter((f) => ({ ...f, [k]: v, page: k === 'page' ? v : 1 })); };
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const run = (action, ids) => act.run(action, async () => {
    if (action === 'reject' && !reason.trim()) throw new Error('Nhập lý do loại kết quả ở ô bên cạnh trước');
    if (ids.length === 1) await api.post(`/laboratory/results/${ids[0]}/${action}`, { reason });
    else await api.post(`/laboratory/results/bulk/${action}`, { ids, reason });
    setSel([]);
    setReason('');
    list.reload();
    onChanged();
  });

  const columns = [
    { key: 'sel', title: <input type="checkbox" aria-label="Chọn tất cả" checked={rows.length > 0 && sel.length === rows.length}
      onChange={(e) => setSel(e.target.checked ? rows.map((r) => r.lab_result_id) : [])} />,
      render: (r) => <input type="checkbox" checked={sel.includes(r.lab_result_id)} onChange={() => toggle(r.lab_result_id)} /> },
    { key: 'sample_code', title: 'Mẫu' },
    { key: 'plot_code', title: 'Ô' },
    { key: 'sampled_at', title: 'Lấy mẫu', render: (r) => fmtTime(r.sampled_at) },
    { key: 'parameter_code', title: 'Chỉ tiêu', render: (r) => <strong>{r.parameter_code}</strong> },
    { key: 'value', title: 'Giá trị', render: (r) => <>{fmtNum(r.value, 4)} {r.unit} {r.below_lod && <Badge tone="warn">&lt; LOD</Badge>}</> },
    { key: 'method_code', title: 'Phương pháp' },
    { key: 'replicate_no', title: 'Lặp' },
    { key: 'analyst_name', title: 'Người phân tích' },
    { key: 'result_status', title: 'Trạng thái', render: (r) => <StatusBadge value={r.result_status} /> },
    { key: 'approved_by_name', title: 'Người duyệt' },
  ];

  const canVerify = perms.write && sel.length > 0 && filter.status === 'DRAFT';
  const canApprove = perms.approve && sel.length > 0 && filter.status === 'VERIFIED';
  const canReject = perms.approve && sel.length > 0 && ['DRAFT', 'VERIFIED'].includes(filter.status);

  return (
    <Card title="Kết quả phân tích" actions={
      <Toggle label="+ Nhập 1 kết quả" allowed={perms.write}>{(close) => <NewResult onDone={() => { close(); list.reload(); onChanged(); }} />}</Toggle>
    }>
      <div className="tv3-toolbar">
        <Field label="Trạng thái">
          <select value={filter.status} onChange={(e) => set('status', e.target.value)}>
            <option value="DRAFT">Nháp – chờ xác minh</option><option value="VERIFIED">Đã xác minh – chờ duyệt</option>
            <option value="APPROVED">Đã duyệt</option><option value="REJECTED">Đã loại</option><option value="">Tất cả</option>
          </select>
        </Field>
        <Field label="Ô">
          <select value={filter.plot_id} onChange={(e) => set('plot_id', e.target.value)}>
            <option value="">Tất cả</option>
            {(plots.data || []).map((p) => <option key={p.plot_id} value={p.plot_id}>{p.plot_code}</option>)}
          </select>
        </Field>
        <Field label="Chỉ tiêu">
          <select value={filter.parameter_code} onChange={(e) => set('parameter_code', e.target.value)}>
            <option value="">Tất cả</option>
            {['PH', 'EC', 'MOISTURE', 'N', 'P', 'K', 'OC', 'CEC'].map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
      </div>
      {(perms.write || perms.approve) && (
        <div className="tv3-toolbar">
          <span className="muted">Đã chọn {sel.length}</span>
          <Button size="sm" variant="primary" disabled={!canVerify} loading={act.busy === 'verify'} onClick={() => run('verify', sel)}>Xác minh</Button>
          <Button size="sm" variant="primary" disabled={!canApprove} loading={act.busy === 'approve'} onClick={() => run('approve', sel)}>Duyệt</Button>
          <input placeholder="Lý do loại" value={reason} onChange={(e) => setReason(e.target.value)} style={{ maxWidth: 220 }} />
          <Button size="sm" variant="danger" disabled={!canReject} loading={act.busy === 'reject'} onClick={() => run('reject', sel)}>Loại</Button>
          <span className="muted small">Người phân tích không tự duyệt kết quả của mình.</span>
        </div>
      )}
      <ErrorBox error={act.error || list.error} onRetry={list.error ? list.reload : undefined} />
      <DataTable columns={columns} rows={rows} loading={list.loading} rowKey="lab_result_id" empty={{ title: 'Không có kết quả nào', hint: 'Đổi bộ lọc trạng thái để xem kết quả khác' }} />
      {meta && meta.total > meta.limit && (
        <div className="tv3-toolbar">
          <Button size="sm" disabled={meta.page <= 1} onClick={() => set('page', meta.page - 1)}>‹ Trước</Button>
          <span className="muted">Trang {meta.page}/{Math.ceil(meta.total / meta.limit)} · {meta.total} kết quả</span>
          <Button size="sm" disabled={meta.page * meta.limit >= meta.total} onClick={() => set('page', meta.page + 1)}>Sau ›</Button>
        </div>
      )}
    </Card>
  );
}

function NewResult({ onDone }) {
  const samples = useApi(() => api.get('/laboratory/samples', { limit: 200 }), []);
  const methods = useApi(() => api.get('/laboratory/methods', { limit: 200 }), []);
  return (
    <QuickForm submitLabel="Lưu (nháp)" onSubmit={async (b) => { await api.post('/laboratory/results', b); onDone(); }}
      fields={[
        { name: 'sample_id', label: 'Mẫu', required: true,
          options: (samples.data || []).filter((s) => s.status !== 'REJECTED').map((s) => [s.sample_id, `${s.sample_code} (${s.plot_code})`]) },
        { name: 'parameter_code', label: 'Chỉ tiêu', required: true, options: ['PH', 'EC', 'MOISTURE', 'N', 'P', 'K', 'OC', 'CEC', 'BULK_DENSITY', 'MICROBIAL_C'].map((p) => [p, p]) },
        { name: 'value', label: 'Giá trị', type: 'number', required: true },
        { name: 'method_id', label: 'Phương pháp', options: (methods.data || []).map((m) => [m.method_id, `${m.method_code} (${m.parameter_code}, ${m.unit})`]) },
        { name: 'unit', label: 'Đơn vị (bỏ trống = theo phương pháp)' },
        { name: 'replicate_no', label: 'Lần lặp', type: 'number' },
      ]} />
  );
}

function Samples({ perms }) {
  const plots = usePlots();
  const [plot, setPlot] = useState('');
  const list = useApi(() => api.get('/laboratory/samples', { plot_id: plot || undefined, limit: 200 }), [plot]);
  const act = useAction();
  const move = (r, status) => act.run(r.sample_id + status, async () => {
    await api.patch(`/laboratory/samples/${r.sample_id}`, { status });
    list.reload();
  });
  const columns = [
    { key: 'sample_code', title: 'Mã mẫu', render: (r) => <strong>{r.sample_code}</strong> },
    { key: 'plot_code', title: 'Ô' },
    { key: 'sample_type', title: 'Loại' },
    { key: 'sampled_at', title: 'Lấy lúc', render: (r) => fmtTime(r.sampled_at) },
    { key: 'depth', title: 'Độ sâu (cm)', render: (r) => (r.depth_from_cm != null ? `${fmtNum(r.depth_from_cm)}–${fmtNum(r.depth_to_cm)}` : '—') },
    { key: 'near_node_code', title: 'Node gần nhất' },
    { key: 'collected_by_name', title: 'Người lấy' },
    { key: 'status', title: 'Trạng thái', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'results', title: 'Kết quả (nháp/xác minh/duyệt)', render: (r) => `${r.result_count} (${r.draft_count}/${r.verified_count}/${r.approved_count})` },
    { key: 'act', title: '', render: (r) => perms.write && r.status === 'COLLECTED' && (
      <Button size="sm" loading={act.busy === r.sample_id + 'RECEIVED'} onClick={() => move(r, 'RECEIVED')}>Nhận mẫu</Button>) },
  ];
  return (
    <Card title="Mẫu" actions={
      <Toggle label="+ Mẫu mới" allowed={perms.write}>{(close) => (
        <QuickForm submitLabel="Tạo mẫu" onSubmit={async (b) => { await api.post('/laboratory/samples', { ...b, sampled_at: new Date(b.sampled_at).toISOString() }); close(); list.reload(); }}
          fields={[
            { name: 'sample_code', label: 'Mã mẫu', required: true },
            { name: 'plot_id', label: 'Ô', required: true, options: (plots.data || []).map((p) => [p.plot_id, p.plot_code]) },
            { name: 'sample_type', label: 'Loại', options: [['SOIL', 'Đất'], ['SOIL_SOLUTION', 'Dung dịch đất'], ['PLANT', 'Cây'], ['BIOCHAR', 'Biochar']] },
            { name: 'sampled_at', label: 'Thời điểm lấy', type: 'datetime-local', required: true },
            { name: 'depth_from_cm', label: 'Độ sâu từ (cm)', type: 'number' },
            { name: 'depth_to_cm', label: 'Độ sâu đến (cm)', type: 'number' },
            { name: 'composite_of', label: 'Số mẫu đơn gộp', type: 'number' },
          ]} />
      )}</Toggle>
    }>
      <div className="tv3-toolbar">
        <Field label="Ô">
          <select value={plot} onChange={(e) => setPlot(e.target.value)}>
            <option value="">Tất cả</option>
            {(plots.data || []).map((p) => <option key={p.plot_id} value={p.plot_id}>{p.plot_code}</option>)}
          </select>
        </Field>
      </div>
      <ErrorBox error={act.error || list.error} onRetry={list.error ? list.reload : undefined} />
      <DataTable columns={columns} rows={list.data} loading={list.loading} rowKey="sample_id" />
    </Card>
  );
}

const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('Không đọc được file'));
  r.readAsDataURL(file);
});

function ImportExcel({ perms, onChanged }) {
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const act = useAction();
  const send = (dry) => act.run(dry ? 'check' : 'import', async () => {
    const r = await api.post('/laboratory/results/import', { file_base64: await toBase64(file), dry_run: dry });
    setReport(r);
    if (r.inserted) onChanged();
  });
  if (!perms.write) return <Card><p className="muted">Bạn cần quyền laboratory.write để nhập kết quả.</p></Card>;
  return (
    <Card title="Nhập kết quả từ Excel">
      <ol className="small">
        <li>Tải file mẫu, điền vào sheet <strong>KetQua</strong> (mỗi dòng một kết quả). Sheet <strong>DanhMuc</strong> liệt kê mã chỉ tiêu và phương pháp.</li>
        <li>Chọn file và bấm <strong>Kiểm tra</strong>: hệ thống báo lỗi từng dòng, chưa ghi gì.</li>
        <li>Hết lỗi thì bấm <strong>Nhập chính thức</strong>. Kết quả vào ở trạng thái Nháp để xác minh và duyệt. Một dòng lỗi thì không dòng nào được ghi.</li>
      </ol>
      <div className="tv3-toolbar">
        <Button onClick={() => act.run('tpl', () => api.download('/laboratory/results/import-template', 'mau_nhap_ket_qua_lab.xlsx'))}
          loading={act.busy === 'tpl'}>Tải file mẫu</Button>
        <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files[0] || null); setReport(null); }} />
        <Button variant="primary" disabled={!file} loading={act.busy === 'check'} onClick={() => send(true)}>Kiểm tra</Button>
        <Button variant="primary" disabled={!file || !report || report.errors.length > 0 || report.inserted > 0}
          loading={act.busy === 'import'} onClick={() => send(false)}>Nhập chính thức</Button>
      </div>
      <ErrorBox error={act.error} />
      {report && (
        report.inserted ? <div className="alert alert-ok"><strong>Đã nhập {report.inserted} kết quả (trạng thái Nháp).</strong></div>
          : report.errors.length ? (
            <>
              <div className="alert alert-error"><strong>{report.errors.length} lỗi ở {report.total - report.valid}/{report.total} dòng. Sửa file rồi kiểm tra lại.</strong></div>
              <div className="tv3-errors">
                <DataTable rowKey="i" rows={report.errors.map((e, i) => ({ ...e, i }))} columns={[
                  { key: 'line', title: 'Dòng Excel' }, { key: 'field', title: 'Cột' }, { key: 'message', title: 'Lỗi' }]} />
              </div>
            </>
          ) : (
            <>
              <div className="alert alert-ok"><strong>Cả {report.total} dòng hợp lệ.</strong> Xem trước (tối đa 20 dòng), rồi bấm Nhập chính thức.</div>
              <DataTable rowKey="lab_result_id" rows={report.preview} columns={[
                { key: 'sample_code', title: 'Mẫu' }, { key: 'parameter_code', title: 'Chỉ tiêu' },
                { key: 'value', title: 'Giá trị', render: (r) => `${fmtNum(r.value, 4)} ${r.unit}` },
                { key: 'method_code', title: 'Phương pháp' }, { key: 'below_lod', title: '< LOD', render: (r) => (r.below_lod ? 'có' : '') }]} />
            </>
          )
      )}
    </Card>
  );
}

function Compare() {
  const plots = usePlots();
  const [f, setF] = useState({ plot_id: '', parameter_code: '' });
  const data = useApi(() => api.page('/laboratory/sensor-vs-lab', { ...f, limit: 100 }), [f.plot_id, f.parameter_code]);
  const tone = (v) => (v == null ? '' : Math.abs(v) > 15 ? 'tv3-diff-bad' : 'tv3-diff-ok');
  return (
    <>
      <Card title="Sai lệch cảm biến so với phòng thí nghiệm (theo chỉ tiêu)">
        <p className="muted small">Trung bình cảm biến hợp lệ trong ±2 giờ quanh lúc lấy mẫu, so với kết quả lab đã xác minh/duyệt. Lệch trên 15% tô đỏ: nên xem lại hiệu chuẩn cảm biến (TV2).</p>
        <DataTable rowKey="parameter_code" rows={data.data?.summary} loading={data.loading} columns={[
          { key: 'parameter_code', title: 'Chỉ tiêu' }, { key: 'pairs', title: 'Số cặp đối chiếu' },
          { key: 'mean_abs_diff_pct', title: 'Lệch TB (%)', render: (r) => <span className={tone(r.mean_abs_diff_pct)}>{fmtNum(r.mean_abs_diff_pct)}</span> },
          { key: 'max_abs_diff_pct', title: 'Lệch lớn nhất (%)', render: (r) => <span className={tone(r.max_abs_diff_pct)}>{fmtNum(r.max_abs_diff_pct)}</span> }]} />
      </Card>
      <Card title="Chi tiết từng mẫu">
        <div className="tv3-toolbar">
          <Field label="Ô">
            <select value={f.plot_id} onChange={(e) => setF({ ...f, plot_id: e.target.value })}>
              <option value="">Tất cả</option>
              {(plots.data || []).map((p) => <option key={p.plot_id} value={p.plot_id}>{p.plot_code}</option>)}
            </select>
          </Field>
          <Field label="Chỉ tiêu">
            <select value={f.parameter_code} onChange={(e) => setF({ ...f, parameter_code: e.target.value })}>
              <option value="">Tất cả</option>
              {['PH', 'EC', 'MOISTURE', 'N', 'P', 'K'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
        </div>
        <ErrorBox error={data.error} onRetry={data.reload} />
        <DataTable rowKey="k" loading={data.loading} rows={(data.data?.data || []).map((r) => ({ ...r, k: r.sample_id + r.parameter_code }))} columns={[
          { key: 'sample_code', title: 'Mẫu' }, { key: 'plot_code', title: 'Ô' },
          { key: 'sampled_at', title: 'Lấy lúc', render: (r) => fmtTime(r.sampled_at) },
          { key: 'parameter_code', title: 'Chỉ tiêu' },
          { key: 'lab_value', title: 'Lab', render: (r) => fmtNum(r.lab_value, 3) },
          { key: 'sensor_value', title: 'Cảm biến', render: (r) => (r.sensor_value == null ? <span className="muted">không có số đo</span> : fmtNum(r.sensor_value, 3)) },
          { key: 'n_readings', title: 'Số bản tin' },
          { key: 'diff_pct', title: 'Lệch (%)', render: (r) => <span className={tone(r.diff_pct)}>{fmtNum(r.diff_pct)}</span> }]} />
      </Card>
    </>
  );
}

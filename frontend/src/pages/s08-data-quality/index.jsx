import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import { ErrorBox } from '../../components/Feedback';
import { Badge, Button, Card, Field, PageHeader, Stat } from '../../components/ui';
import '../tv4.css';

const PAGE_SIZE = 10;
const ISSUE_TYPES = ['OUT_OF_RANGE', 'SPIKE', 'FLATLINE', 'MISSING', 'DUPLICATE', 'INVALID_TIMESTAMP', 'SENSOR_FAULT', 'LAB_MISMATCH', 'OTHER'];
const RULE_TYPES = ['RANGE', 'RATE_OF_CHANGE', 'FLATLINE', 'TIMESTAMP', 'DUPLICATE', 'MISSING', 'CROSS_CHECK'];
const PARAMETERS = ['PH', 'EC', 'MOISTURE', 'SOIL_TEMP', 'N', 'P', 'K'];
const value = (v, digits = 2) => v == null ? '—' : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: digits });
const dateTime = (v) => v ? new Date(v).toLocaleString('vi-VN') : '—';
const dayStart = (v) => v ? new Date(`${v}T00:00:00`).toISOString() : '';
const dayEnd = (v) => v ? new Date(`${v}T23:59:59.999`).toISOString() : '';

export default function DataQualityPage() {
  const { can } = useAuth();
  const [period, setPeriod] = useState({ from: '', to: '' });
  const [filter, setFilter] = useState({ type: '', status: 'OPEN', sensor_id: '', plot_id: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const stats = useApi(() => {
    if (Boolean(period.from) !== Boolean(period.to)) throw new Error('Hãy chọn cả ngày bắt đầu và ngày kết thúc để lọc thống kê.');
    return api.get('/quality/stats', period.from ? { from: dayStart(period.from), to: dayEnd(period.to) } : {});
  }, [period.from, period.to]);
  const kpis = useApi(() => api.get('/quality/kpis'), []);
  const rules = useApi(() => api.get('/quality/rules'), []);
  const checks = useApi(() => api.get('/quality/checks'), []);
  const issues = useApi(() => api.page('/quality/issues', { ...filter, from: dayStart(filter.from), to: filter.to ? dayEnd(filter.to) : '', page, limit: PAGE_SIZE }), [filter.type, filter.status, filter.sensor_id, filter.plot_id, filter.from, filter.to, page]);
  const audit = useApi(() => api.page('/quality/audit', { page: auditPage, limit: PAGE_SIZE }), [auditPage]);

  async function refreshAll() {
    await Promise.all([stats.reload(), kpis.reload(), rules.reload(), checks.reload(), issues.reload(), audit.reload()]);
  }
  async function runQc(event) {
    event.preventDefault();
    setBusy('qc'); setNotice('');
    try {
      const now = new Date();
      const from = period.from ? new Date(`${period.from}T00:00:00`).toISOString() : new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const to = period.to ? new Date(`${period.to}T23:59:59.999`).toISOString() : now.toISOString();
      const result = await api.post('/quality/checks', { from, to });
      setNotice(`Đã chạy QC${result?.check_id ? ` · mã lần chạy ${result.check_id}` : ''}.`);
      await refreshAll();
    } catch (error) { setNotice(error.message); }
    finally { setBusy(''); }
  }
  async function ruleToggle(rule) {
    setBusy(`rule-${rule.rule_id}`); setNotice('');
    try { await api.patch(`/quality/rules/${rule.rule_id}`, { is_active: !rule.is_active }); await rules.reload(); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(''); }
  }
  async function handleIssue(id, action, body = {}) {
    setBusy(`issue-${id}`); setNotice('');
    try { await api.post(`/quality/issues/${id}/${action}`, body); setNotice('Đã cập nhật issue và ghi audit.'); await refreshAll(); return true; }
    catch (error) { setNotice(error.message); return false; }
    finally { setBusy(''); }
  }

  const summary = stats.data?.summary || {};
  const issueRows = issues.data?.data || [];
  const issueMeta = issues.data?.meta || {};
  const issueColumns = [
    { key: 'observed_at', title: 'Thời gian', render: (r) => dateTime(r.observed_at) },
    { key: 'sensor_code', title: 'Sensor / ô', render: (r) => <><strong>{r.sensor_code || r.source_record_id || '—'}</strong><div className="muted small">{r.plot_code || 'Không rõ ô'}</div></> },
    { key: 'issue_type', title: 'Loại lỗi', render: (r) => <span>{r.issue_type}<div className="muted small">{r.parameter_code || ''}</div></span> },
    { key: 'observed_value', title: 'Giá trị', render: (r) => value(r.observed_value) },
    { key: 'severity', title: 'Mức độ / trạng thái', render: (r) => <><Badge tone={r.severity === 'ERROR' ? 'bad' : 'warn'}>{r.severity}</Badge><Badge tone={r.status === 'OPEN' ? 'warn' : 'ok'}>{r.status}</Badge></> },
    { key: 'actions', title: 'Xử lý', render: (r) => r.status !== 'OPEN' ? 'Đã xử lý' : <IssueActions row={r} busy={busy === `issue-${r.issue_id}`} canWrite={can('data_quality.write')} onAction={handleIssue} /> },
  ];

  return <>
    <PageHeader title="Chất lượng dữ liệu & Nhật ký" subtitle="Theo dõi số đo, quy tắc QC, issue và lịch sử chỉnh sửa." actions={<Button variant="primary" loading={busy === 'qc'} disabled={!can('data_quality.write')} onClick={runQc}>Chạy QC</Button>} />
    {notice && <div className={`alert ${notice.startsWith('Đã') ? 'alert-ok' : 'alert-error'}`} role="status">{notice}</div>}
    <ErrorBox error={stats.error || kpis.error} onRetry={refreshAll} />

    <Card title="Khoảng thống kê" actions={<Button size="sm" onClick={refreshAll}>Làm mới</Button>}>
      <div className="tv4-filter-row">
        <Field label="Từ ngày"><input type="date" value={period.from} onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))} /></Field>
        <Field label="Đến ngày"><input type="date" value={period.to} onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))} /></Field>
        <p className="muted small">Để trống ngày để thống kê toàn bộ khoảng dữ liệu cảm biến hiện có.</p>
      </div>
    </Card>
    <div className="grid-3 tv4-kpis">
      <Stat label="Tổng quan sát" value={value(summary.observations, 0)} />
      <Stat label="Hợp lệ / đã sửa" value={value(summary.valid, 0)} tone="ok" />
      <Stat label="Không hợp lệ" value={value(summary.invalid, 0)} tone={Number(summary.invalid) ? 'bad' : 'ok'} />
      <Stat label="Thiếu" value={value(summary.missing, 0)} tone={Number(summary.missing) ? 'warn' : 'ok'} />
      <Stat label="Trùng" value={value(summary.duplicates, 0)} tone={Number(summary.duplicates) ? 'warn' : 'ok'} />
      <Stat label="Ngoại lệ / bất thường" value={value(summary.outliers, 0)} tone={Number(summary.outliers) ? 'warn' : 'ok'} />
    </div>

    <Card title="KPI chất lượng theo dữ liệu thật">
      <ErrorBox error={kpis.error} onRetry={kpis.reload} />
      <DataTable rows={kpis.data || []} loading={kpis.loading} rowKey="kpi_code" empty={{ title: 'Chưa có số liệu KPI trong database' }} columns={[
        { key: 'name_vi', title: 'Chỉ tiêu' }, { key: 'current_value', title: 'Hiện tại', render: (r) => r.current_value == null ? 'Chưa có dữ liệu' : `${value(r.current_value)} ${r.unit || ''}` },
        { key: 'target_value', title: 'Mục tiêu', render: (r) => `${value(r.target_value)} ${r.unit || ''}` },
        { key: 'passed', title: 'Kết quả', render: (r) => <Badge tone={r.current_value == null ? 'neutral' : r.passed ? 'ok' : 'bad'}>{r.current_value == null ? 'Chưa đánh giá' : r.passed ? 'Đạt' : 'Chưa đạt'}</Badge> },
      ]} />
    </Card>

    <Card title="Thống kê theo ngày">
      <DataTable rows={stats.data?.daily || []} loading={stats.loading} rowKey="day" empty={{ title: 'Khoảng thời gian này chưa có thống kê theo ngày' }} columns={[
        { key: 'day', title: 'Ngày', render: (r) => new Date(r.day).toLocaleDateString('vi-VN') }, { key: 'expected', title: 'Dự kiến' }, { key: 'received', title: 'Đã nhận' }, { key: 'valid', title: 'Hợp lệ' }, { key: 'invalid', title: 'Không hợp lệ' }, { key: 'duplicates', title: 'Trùng' },
      ]} />
    </Card>

    <Card title="Lịch sử chạy QC">
      <ErrorBox error={checks.error} onRetry={checks.reload} />
      <DataTable rows={checks.data || []} loading={checks.loading} rowKey="check_id" empty={{ title: 'Chưa có lần chạy QC' }} columns={[
        { key: 'started_at', title: 'Bắt đầu', render: (r) => dateTime(r.started_at) }, { key: 'scope', title: 'Khoảng dữ liệu', render: (r) => `${dateTime(r.scope_from)} – ${dateTime(r.scope_to)}` },
        { key: 'records_checked', title: 'Đã kiểm tra' }, { key: 'records_valid', title: 'Hợp lệ' }, { key: 'records_suspect', title: 'Nghi ngờ' }, { key: 'records_invalid', title: 'Không hợp lệ' },
        { key: 'pass_rate_pct', title: 'Tỷ lệ đạt', render: (r) => r.pass_rate_pct == null ? '—' : `${value(r.pass_rate_pct)}%` }, { key: 'status', title: 'Trạng thái', render: (r) => <Badge tone={r.status === 'DONE' ? 'ok' : r.status === 'FAILED' ? 'bad' : 'warn'}>{r.status}</Badge> },
      ]} />
    </Card>

    <Card title="Issue dữ liệu" actions={<span className="muted small">{issueMeta.total ?? 0} kết quả</span>}>
      <ErrorBox error={issues.error} onRetry={issues.reload} />
      <div className="tv4-filter-row">
        <Field label="Loại lỗi"><select value={filter.type} onChange={(e) => { setFilter((f) => ({ ...f, type: e.target.value })); setPage(1); }}><option value="">Tất cả</option>{ISSUE_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Trạng thái"><select value={filter.status} onChange={(e) => { setFilter((f) => ({ ...f, status: e.target.value })); setPage(1); }}><option value="">Tất cả</option>{['OPEN', 'CONFIRMED', 'CORRECTED', 'IGNORED'].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Mã sensor (UUID)"><input value={filter.sensor_id} onChange={(e) => { setFilter((f) => ({ ...f, sensor_id: e.target.value })); setPage(1); }} placeholder="Lọc theo sensor" /></Field>
        <Field label="Mã ô (UUID)"><input value={filter.plot_id} onChange={(e) => { setFilter((f) => ({ ...f, plot_id: e.target.value })); setPage(1); }} placeholder="Lọc theo plot" /></Field>
        <Field label="Từ ngày"><input type="date" value={filter.from} onChange={(e) => { setFilter((f) => ({ ...f, from: e.target.value })); setPage(1); }} /></Field>
        <Field label="Đến ngày"><input type="date" value={filter.to} onChange={(e) => { setFilter((f) => ({ ...f, to: e.target.value })); setPage(1); }} /></Field>
      </div>
      <DataTable rows={issueRows} loading={issues.loading} rowKey="issue_id" columns={issueColumns} empty={{ title: 'Không tìm thấy issue phù hợp' }} />
      <Pager page={page} limit={PAGE_SIZE} total={Number(issueMeta.total || 0)} onChange={setPage} />
    </Card>

    <Card title="Quy tắc QC" actions={<span className="muted small">Chỉ người có quyền ghi mới thay đổi được quy tắc.</span>}>
      <ErrorBox error={rules.error} onRetry={rules.reload} />
      <DataTable rows={rules.data || []} loading={rules.loading} rowKey="rule_id" empty={{ title: 'Chưa có quy tắc QC' }} columns={[
        { key: 'rule_code', title: 'Mã quy tắc' }, { key: 'name', title: 'Tên quy tắc', render: (r) => <><strong>{r.name}</strong><div className="muted small">{r.parameter_code || 'Toàn bản ghi'}</div></> }, { key: 'rule_type', title: 'Loại' },
        { key: 'bounds', title: 'Ngưỡng', render: (r) => r.rule_type === 'RANGE' ? `${value(r.min_value)} – ${value(r.max_value)}` : r.max_delta != null ? `Chênh lệch ≤ ${value(r.max_delta)}` : r.window_minutes != null ? `${r.window_minutes} phút` : '—' },
        { key: 'severity', title: 'Mức độ', render: (r) => <Badge tone={r.severity === 'ERROR' ? 'bad' : 'warn'}>{r.severity}</Badge> },
        { key: 'is_active', title: 'Trạng thái / thao tác', render: (r) => <><div><Badge tone={r.is_active ? 'ok' : 'neutral'}>{r.is_active ? 'Đang bật' : 'Đã tắt'}</Badge></div>{can('data_quality.write') && <RuleActions rule={r} busy={busy === `rule-${r.rule_id}`} onToggle={() => ruleToggle(r)} onSaved={rules.reload} onNotice={setNotice} />}</> },
      ]} />
      {can('data_quality.write') && <NewRule onCreated={rules.reload} onNotice={setNotice} />}
    </Card>

    <Card title="Nhật ký audit gần đây">
      <ErrorBox error={audit.error} onRetry={audit.reload} />
      <DataTable rows={audit.data?.data || []} loading={audit.loading} rowKey="audit_id" empty={{ title: 'Chưa có lịch sử thao tác' }} columns={[
        { key: 'occurred_at', title: 'Thời gian', render: (r) => dateTime(r.occurred_at) }, { key: 'action', title: 'Thao tác' }, { key: 'source_table', title: 'Bảng' }, { key: 'record_id', title: 'Bản ghi' },
        { key: 'values', title: 'Giá trị cũ → mới', render: (r) => <span className="tv4-json">{JSON.stringify(r.old_value ?? null)} → {JSON.stringify(r.new_value ?? null)}</span> }, { key: 'reason', title: 'Lý do' }, { key: 'actor_id', title: 'Người thực hiện', render: (r) => r.actor_id || r.actor_type || 'Hệ thống' },
      ]} />
      <Pager page={auditPage} limit={PAGE_SIZE} total={Number(audit.data?.meta?.total || 0)} onChange={setAuditPage} />
    </Card>
  </>;
}

function Pager({ page, limit, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return <div className="tv4-pager"><span className="muted small">Trang {page}/{pages}</span><Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Trước</Button><Button size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Sau</Button></div>;
}

function IssueActions({ row, busy, canWrite, onAction }) {
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');
  const [values, setValues] = useState({});
  if (!canWrite) return <span className="muted">Chỉ xem</span>;
  if (editing) return <form className="tv4-correction" onSubmit={(e) => { e.preventDefault(); const corrected = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])); onAction(row.issue_id, 'correct', { reason, values: corrected }).then((ok) => { if (ok) setEditing(false); }); }}>
    <div className="tv4-correction-grid">{['ph', 'ec', 'soil_moisture', 'soil_temperature', 'n', 'p', 'k'].map((key) => <input key={key} aria-label={key} type="number" step="any" placeholder={key} value={values[key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />)}</div>
    <input aria-label="Lý do chỉnh sửa" placeholder="Lý do chỉnh sửa" value={reason} onChange={(e) => setReason(e.target.value)} required />
    <Button size="sm" variant="primary" loading={busy}>Lưu sửa</Button><Button size="sm" type="button" onClick={() => setEditing(false)}>Hủy</Button>
  </form>;
  return <div className="tv4-actions"><Button size="sm" disabled={busy} onClick={() => onAction(row.issue_id, 'confirm', { reason: 'Đã xác nhận issue' })}>Xác nhận</Button><Button size="sm" disabled={busy} onClick={() => onAction(row.issue_id, 'ignore', { reason: 'Bỏ qua issue' })}>Bỏ qua</Button><Button size="sm" disabled={busy || row.source_table !== 'iot.sensor_readings'} onClick={() => setEditing(true)}>Sửa</Button></div>;
}

function RuleActions({ rule, busy, onToggle, onSaved, onNotice }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: rule.name, min_value: rule.min_value ?? '', max_value: rule.max_value ?? '', max_delta: rule.max_delta ?? '', window_minutes: rule.window_minutes ?? '', severity: rule.severity, description: rule.description || '' });
  async function save(event) {
    event.preventDefault(); onNotice('');
    const body = { ...form, min_value: form.min_value === '' ? null : Number(form.min_value), max_value: form.max_value === '' ? null : Number(form.max_value), max_delta: form.max_delta === '' ? null : Number(form.max_delta), window_minutes: form.window_minutes === '' ? null : Number(form.window_minutes) };
    try { await api.patch(`/quality/rules/${rule.rule_id}`, body); onNotice('Đã cập nhật quy tắc QC.'); setEditing(false); onSaved(); }
    catch (error) { onNotice(error.message); }
  }
  return <div className="tv4-rule-actions"><Button size="sm" disabled={busy} onClick={onToggle}>{rule.is_active ? 'Tắt' : 'Bật'}</Button><Button size="sm" disabled={busy} onClick={() => setEditing((v) => !v)}>{editing ? 'Đóng sửa' : 'Sửa quy tắc'}</Button>{editing && <form className="tv4-correction" onSubmit={save}>
    <input aria-label="Tên quy tắc" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
    {rule.rule_type === 'RANGE' && <div className="tv4-correction-grid"><input aria-label="Giá trị tối thiểu" type="number" step="any" value={form.min_value} onChange={(e) => setForm((f) => ({ ...f, min_value: e.target.value }))} /><input aria-label="Giá trị tối đa" type="number" step="any" value={form.max_value} onChange={(e) => setForm((f) => ({ ...f, max_value: e.target.value }))} /></div>}
    {rule.rule_type === 'RATE_OF_CHANGE' && <input aria-label="Chênh lệch tối đa" type="number" step="any" value={form.max_delta} onChange={(e) => setForm((f) => ({ ...f, max_delta: e.target.value }))} />}
    {['FLATLINE', 'MISSING'].includes(rule.rule_type) && <input aria-label="Cửa sổ phút" type="number" value={form.window_minutes} onChange={(e) => setForm((f) => ({ ...f, window_minutes: e.target.value }))} />}
    <select aria-label="Mức độ" value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}><option>ERROR</option><option>WARN</option></select><input aria-label="Mô tả" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
    <Button size="sm" variant="primary">Lưu thay đổi</Button>
  </form>}</div>;
}

function NewRule({ onCreated, onNotice }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ rule_code: '', name: '', rule_type: 'RANGE', parameter_code: 'PH', min_value: '', max_value: '', max_delta: '', window_minutes: '', severity: 'ERROR', description: '' });
  async function submit(e) {
    e.preventDefault(); setBusy(true); onNotice('');
    const body = { ...form, min_value: form.min_value === '' ? null : Number(form.min_value), max_value: form.max_value === '' ? null : Number(form.max_value), max_delta: form.max_delta === '' ? null : Number(form.max_delta), window_minutes: form.window_minutes === '' ? null : Number(form.window_minutes) };
    try { await api.post('/quality/rules', body); onNotice('Đã tạo quy tắc QC.'); setShow(false); onCreated(); }
    catch (error) { onNotice(error.message); }
    finally { setBusy(false); }
  }
  return <div className="tv4-rule-create"><Button onClick={() => setShow((v) => !v)}>{show ? 'Đóng biểu mẫu' : 'Tạo quy tắc'}</Button>{show && <form className="tv4-filter-row" onSubmit={submit}>
    <Field label="Mã quy tắc"><input required value={form.rule_code} onChange={(e) => setForm((f) => ({ ...f, rule_code: e.target.value.toUpperCase() }))} /></Field>
    <Field label="Tên"><input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
    <Field label="Loại"><select value={form.rule_type} onChange={(e) => setForm((f) => ({ ...f, rule_type: e.target.value }))}>{RULE_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
    <Field label="Chỉ tiêu"><select value={form.parameter_code} onChange={(e) => setForm((f) => ({ ...f, parameter_code: e.target.value }))}>{PARAMETERS.map((x) => <option key={x}>{x}</option>)}</select></Field>
    {form.rule_type === 'RANGE' && <><Field label="Tối thiểu"><input type="number" step="any" required value={form.min_value} onChange={(e) => setForm((f) => ({ ...f, min_value: e.target.value }))} /></Field><Field label="Tối đa"><input type="number" step="any" required value={form.max_value} onChange={(e) => setForm((f) => ({ ...f, max_value: e.target.value }))} /></Field></>}
    {form.rule_type === 'RATE_OF_CHANGE' && <Field label="Chênh lệch tối đa"><input type="number" step="any" required value={form.max_delta} onChange={(e) => setForm((f) => ({ ...f, max_delta: e.target.value }))} /></Field>}
    {['FLATLINE', 'MISSING'].includes(form.rule_type) && <Field label="Cửa sổ (phút)"><input type="number" min="1" value={form.window_minutes} onChange={(e) => setForm((f) => ({ ...f, window_minutes: e.target.value }))} /></Field>}
    <Field label="Mức độ"><select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}><option>ERROR</option><option>WARN</option></select></Field>
    <Field label="Mô tả"><input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
    <Button variant="primary" loading={busy}>Lưu quy tắc</Button>
  </form>}</div>;
}

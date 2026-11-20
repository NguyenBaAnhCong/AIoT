import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import { ErrorBox } from '../../components/Feedback';
import { Badge, Button, Card, Field, PageHeader, Stat } from '../../components/ui';
import Pager from '../tv4/Pager';
import './tv4.css';

const PAGE_SIZE = 10;
const number = (v) => v == null ? '—' : Number(v).toLocaleString('vi-VN');
const timestamp = (v) => v ? new Date(v).toLocaleString('vi-VN') : '—';

export default function DatasetPage() {
  const { can } = useAuth();
  const datasets = useApi(() => api.get('/datasets'), []);
  const [datasetId, setDatasetId] = useState('');
  const versions = useApi(() => datasetId ? api.get(`/datasets/${datasetId}/versions`) : Promise.resolve([]), [datasetId]);
  const [versionId, setVersionId] = useState('');
  const readiness = useApi(() => versionId ? api.get(`/datasets/versions/${versionId}/readiness`) : Promise.resolve(null), [versionId]);
  const labels = useApi(() => api.get('/datasets/labels'), []);
  const distribution = useApi(() => versionId ? api.get(`/datasets/versions/${versionId}/distribution`) : Promise.resolve([]), [versionId]);
  const [recordFilter, setRecordFilter] = useState({ valid: 'true', labeled: '', split: '' });
  const [recordPage, setRecordPage] = useState(1);
  const records = useApi(() => versionId ? api.page(`/datasets/versions/${versionId}/records`, { ...recordFilter, page: recordPage, limit: PAGE_SIZE }) : Promise.resolve({ data: [], meta: { total: 0 } }), [versionId, recordFilter.valid, recordFilter.labeled, recordFilter.split, recordPage]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [showDatasetForm, setShowDatasetForm] = useState(false);
  const [showVersionForm, setShowVersionForm] = useState(false);
  const [datasetForm, setDatasetForm] = useState({ dataset_code: '', name: '', purpose: 'TRAINING', min_valid_observations: 10000, description: '' });
  const [versionForm, setVersionForm] = useState({ time_from: '', time_to: '', aggregation: 'RAW', split_strategy: 'BY_TIME', random_seed: 42, notes: '' });

  useEffect(() => {
    if (!datasetId && datasets.data?.length) setDatasetId(datasets.data[0].dataset_id);
  }, [datasetId, datasets.data]);
  useEffect(() => {
    if (!versions.data?.length) { setVersionId(''); return; }
    if (!versions.data.some((v) => v.dataset_version_id === versionId)) setVersionId(versions.data[0].dataset_version_id);
  }, [versions.data, versionId]);

  async function refresh() {
    await Promise.all([datasets.reload(), versions.reload(), readiness.reload(), distribution.reload(), records.reload()]);
  }
  async function createDataset(event) {
    event.preventDefault(); setBusy('create-dataset'); setNotice('');
    try {
      const created = await api.post('/datasets', { ...datasetForm, min_valid_observations: Number(datasetForm.min_valid_observations) });
      setDatasetId(created.dataset_id); setVersionId(''); setShowDatasetForm(false); setNotice('Đã tạo dataset.'); await datasets.reload();
    } catch (error) { setNotice(error.message); }
    finally { setBusy(''); }
  }
  async function createVersion(event) {
    event.preventDefault(); setBusy('create-version'); setNotice('');
    try {
      const version = await api.post(`/datasets/${datasetId}/versions`, { ...versionForm, random_seed: Number(versionForm.random_seed) });
      setVersionId(version.dataset_version_id); setShowVersionForm(false); setNotice('Đã tạo version nháp.'); await versions.reload();
    } catch (error) { setNotice(error.message); }
    finally { setBusy(''); }
  }
  async function transition(action) {
    setBusy(action); setNotice('');
    try {
      await api.post(`/datasets/versions/${versionId}/${action}`);
      setNotice(action === 'build' ? 'Đã build version bằng hàm trong PostgreSQL.' : 'Đã freeze version.');
      await Promise.all([versions.reload(), readiness.reload(), records.reload(), distribution.reload()]);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(''); }
  }
  async function labelRecord(recordId, labelId) {
    setBusy(`label-${recordId}`); setNotice('');
    try {
      await api.post(`/datasets/versions/${versionId}/records/${recordId}/label`, { label_id: labelId });
      setNotice('Đã gán nhãn chuyên gia và ghi audit.');
      await Promise.all([records.reload(), distribution.reload(), readiness.reload()]);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(''); }
  }

  const current = datasets.data?.find((d) => d.dataset_id === datasetId);
  const ready = readiness.data;
  const frozen = ready?.status === 'FROZEN';
  const canFreeze = ready?.status === 'BUILT' && ready.meets_min_observations && Number(ready.leaking_groups) === 0;
  const recordRows = records.data?.data || [];
  const recordMeta = records.data?.meta || {};

  return <>
    <PageHeader title="Dataset & Gán nhãn" subtitle="Quản lý dataset, tạo và kiểm tra version, gán nhãn rồi xuất dữ liệu cho ML." actions={<>
      {can('dataset.write') && <Button onClick={() => setShowDatasetForm((v) => !v)}>Tạo dataset</Button>}
      {can('dataset.write') && <Button variant="primary" disabled={!datasetId} onClick={() => setShowVersionForm((v) => !v)}>Tạo version</Button>}
    </>} />
    {notice && <div className={`alert ${notice.startsWith('Đã') ? 'alert-ok' : 'alert-error'}`} role="status">{notice}</div>}
    <ErrorBox error={datasets.error || versions.error || readiness.error || records.error || distribution.error || labels.error} onRetry={refresh} />

    {showDatasetForm && <Card title="Tạo dataset"><form className="tv4-filter-row" onSubmit={createDataset}>
      <Field label="Mã dataset"><input required value={datasetForm.dataset_code} onChange={(e) => setDatasetForm((f) => ({ ...f, dataset_code: e.target.value.toUpperCase() }))} /></Field>
      <Field label="Tên dataset"><input required value={datasetForm.name} onChange={(e) => setDatasetForm((f) => ({ ...f, name: e.target.value }))} /></Field>
      <Field label="Mục đích"><select value={datasetForm.purpose} onChange={(e) => setDatasetForm((f) => ({ ...f, purpose: e.target.value }))}>{['REFERENCE', 'TRAINING', 'EVALUATION', 'FIELD_TEST'].map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Số quan sát hợp lệ tối thiểu"><input type="number" min="1" required value={datasetForm.min_valid_observations} onChange={(e) => setDatasetForm((f) => ({ ...f, min_valid_observations: e.target.value }))} /></Field>
      <Field label="Mô tả"><input value={datasetForm.description} onChange={(e) => setDatasetForm((f) => ({ ...f, description: e.target.value }))} /></Field>
      <Button variant="primary" loading={busy === 'create-dataset'}>Lưu dataset</Button><Button type="button" onClick={() => setShowDatasetForm(false)}>Hủy</Button>
    </form></Card>}

    <Card title="Danh sách dataset" actions={<Button size="sm" onClick={() => datasets.reload()}>Làm mới</Button>}>
      <DataTable rows={datasets.data || []} loading={datasets.loading} rowKey="dataset_id" empty={{ title: 'Chưa có dataset' }} columns={[
        { key: 'dataset_code', title: 'Dataset', render: (d) => <><strong>{d.name}</strong><div className="muted small">{d.dataset_code} · {d.purpose}</div></> },
        { key: 'version_no', title: 'Version mới nhất', render: (d) => d.version_no ? `v${d.version_no}` : 'Chưa có' },
        { key: 'version_status', title: 'Trạng thái', render: (d) => d.version_status ? <Badge tone={d.version_status === 'FROZEN' ? 'ok' : d.version_status === 'BUILT' ? 'info' : 'warn'}>{d.version_status}</Badge> : '—' },
        { key: 'valid_count', title: 'Quan sát hợp lệ', render: (d) => number(d.valid_count) },
        { key: 'created_at', title: 'Ngày tạo', render: (d) => timestamp(d.created_at) },
        { key: 'select', title: 'Chọn', render: (d) => <Button size="sm" onClick={() => { setDatasetId(d.dataset_id); setVersionId(''); }}>{d.dataset_id === datasetId ? 'Đang chọn' : 'Mở'}</Button> },
      ]} />
    </Card>

    <Card title="Phiên bản dataset" actions={current && <span className="muted small">{current.dataset_code} · ngưỡng tối thiểu {number(current.min_valid_observations)} quan sát hợp lệ</span>}>
      {!datasetId ? <p className="muted">Chọn hoặc tạo dataset để xem version.</p> : <>
        <div className="tv4-filter-row">
          <Field label="Dataset"><select value={datasetId} onChange={(e) => { setDatasetId(e.target.value); setVersionId(''); }}>{(datasets.data || []).map((d) => <option key={d.dataset_id} value={d.dataset_id}>{d.dataset_code} · {d.name}</option>)}</select></Field>
          <Field label="Version"><select value={versionId} onChange={(e) => setVersionId(e.target.value)}><option value="">Chọn version</option>{(versions.data || []).map((v) => <option key={v.dataset_version_id} value={v.dataset_version_id}>v{v.version_no} · {v.status} · {timestamp(v.time_from)}</option>)}</select></Field>
          {can('dataset.write') && <Button onClick={() => setShowVersionForm((v) => !v)}>Tạo version mới</Button>}
          {ready && <div className="tv4-actions">
            <Button variant="primary" disabled={!can('dataset.write') || frozen} loading={busy === 'build'} onClick={() => transition('build')}>Build version</Button>
            <Button disabled={!can('dataset.write') || !canFreeze} loading={busy === 'freeze'} onClick={() => transition('freeze')}>Freeze</Button>
            <Button disabled={!frozen || !can('dataset.read')} onClick={() => api.download(`/datasets/versions/${versionId}/export.csv`, `dataset-v${ready.version_no}.csv`).catch((e) => setNotice(e.message))}>Xuất CSV</Button>
          </div>}
        </div>
        {showVersionForm && <form className="tv4-filter-row tv4-form" onSubmit={createVersion}>
          <Field label="Từ thời điểm"><input type="datetime-local" required value={versionForm.time_from} onChange={(e) => setVersionForm((f) => ({ ...f, time_from: e.target.value }))} /></Field>
          <Field label="Đến thời điểm"><input type="datetime-local" required value={versionForm.time_to} onChange={(e) => setVersionForm((f) => ({ ...f, time_to: e.target.value }))} /></Field>
          <Field label="Gộp dữ liệu"><select value={versionForm.aggregation} onChange={(e) => setVersionForm((f) => ({ ...f, aggregation: e.target.value }))}>{['RAW', 'HOURLY', 'DAILY'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Chiến lược chia tập"><select value={versionForm.split_strategy} onChange={(e) => setVersionForm((f) => ({ ...f, split_strategy: e.target.value }))}>{['BY_TIME', 'BY_PLOT', 'BY_BLOCK', 'RANDOM'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Hạt giống ngẫu nhiên"><input type="number" value={versionForm.random_seed} onChange={(e) => setVersionForm((f) => ({ ...f, random_seed: e.target.value }))} /></Field>
          <Field label="Ghi chú"><input value={versionForm.notes} onChange={(e) => setVersionForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
          <Button variant="primary" loading={busy === 'create-version'}>Lưu version</Button><Button type="button" onClick={() => setShowVersionForm(false)}>Hủy</Button>
        </form>}
      </>}
    </Card>

    {ready && <>
      <div className="grid-3 tv4-kpis">
        <Stat label="Tổng quan sát" value={number(ready.records)} />
        <Stat label="Hợp lệ" value={number(ready.valid_records)} tone={ready.meets_min_observations ? 'ok' : 'warn'} hint={`Yêu cầu: ${number(ready.min_valid_observations)}`} />
        <Stat label="Train" value={number(ready.train)} />
        <Stat label="Validation" value={number(ready.val)} />
        <Stat label="Test" value={number(ready.test)} />
        <Stat label="Đã gán nhãn" value={number(ready.labeled_records)} />
      </div>
      <Card title="Readiness & chống rò rỉ dữ liệu">
        <div className="tv4-readiness">
          <Badge tone={ready.meets_min_observations ? 'ok' : 'warn'}>{ready.meets_min_observations ? 'Đủ số quan sát' : 'Chưa đủ số quan sát'}</Badge>
          <Badge tone={Number(ready.leaking_groups) === 0 ? 'ok' : 'bad'}>{Number(ready.leaking_groups) === 0 ? 'Không phát hiện leakage' : `${number(ready.leaking_groups)} nhóm bị leakage`}</Badge>
          <Badge tone={ready.status === 'FROZEN' ? 'ok' : 'info'}>{ready.status}</Badge>
          <span className="muted small">Chia tập: {ready.split_strategy} · v{ready.version_no} · {timestamp(ready.time_from)} – {timestamp(ready.time_to)}</span>
        </div>
        {!canFreeze && ready.status !== 'FROZEN' && <p className="muted small">Chỉ freeze sau khi build, đạt số lượng hợp lệ tối thiểu và không có nhóm leakage. Điều kiện được xác nhận bởi database.</p>}
      </Card>

      <Card title="Phân bố nhãn">
        <DataTable rows={(distribution.data || []).map((r) => ({ ...r, _row_id: `${r.label_code}-${r.split}-${r.label_source}` }))} loading={distribution.loading} rowKey="_row_id" empty={{ title: 'Version chưa có nhãn' }} columns={[
          { key: 'label_code', title: 'Nhãn', render: (r) => <><strong>{r.name_vi}</strong><div className="muted small">{r.label_code}</div></> }, { key: 'split', title: 'Tập dữ liệu' }, { key: 'label_source', title: 'Nguồn nhãn' }, { key: 'count', title: 'Số bản ghi' },
        ]} />
      </Card>

      <Card title="Quan sát & gán nhãn" actions={<span className="muted small">{recordMeta.total ?? 0} bản ghi</span>}>
        <div className="tv4-filter-row">
          <Field label="Tính hợp lệ"><select value={recordFilter.valid} onChange={(e) => { setRecordFilter((f) => ({ ...f, valid: e.target.value })); setRecordPage(1); }}><option value="true">Chỉ hợp lệ</option><option value="false">Không hợp lệ</option><option value="">Tất cả</option></select></Field>
          <Field label="Trạng thái nhãn"><select value={recordFilter.labeled} onChange={(e) => { setRecordFilter((f) => ({ ...f, labeled: e.target.value })); setRecordPage(1); }}><option value="">Tất cả</option><option value="false">Chưa gán nhãn</option><option value="true">Đã gán nhãn</option></select></Field>
          <Field label="Tập"><select value={recordFilter.split} onChange={(e) => { setRecordFilter((f) => ({ ...f, split: e.target.value })); setRecordPage(1); }}><option value="">Tất cả</option>{['TRAIN', 'VAL', 'TEST'].map((x) => <option key={x}>{x}</option>)}</select></Field>
        </div>
        <DataTable rows={recordRows} loading={records.loading} rowKey="record_id" empty={{ title: 'Không có quan sát phù hợp' }} columns={[
          { key: 'observed_at', title: 'Thời gian', render: (r) => timestamp(r.observed_at) }, { key: 'plot_code', title: 'Ô thí nghiệm' }, { key: 'features', title: 'Chỉ tiêu', render: (r) => `pH ${number(r.ph)} · EC ${number(r.ec)} · Ẩm ${number(r.soil_moisture)}%` },
          { key: 'split', title: 'Tập' }, { key: 'valid_flag', title: 'Hợp lệ', render: (r) => <Badge tone={r.valid_flag ? 'ok' : 'bad'}>{r.valid_flag ? 'Có' : 'Không'}</Badge> },
          { key: 'label', title: 'Nhãn', render: (r) => r.label_source === 'EXPERT' ? <><Badge tone="info">{r.name_vi || r.label_code}</Badge><div className="muted small">Nhãn chuyên gia</div></> : <LabelControl row={r} labels={labels.data || []} disabled={!can('dataset.write') || frozen || !r.valid_flag} busy={busy === `label-${r.record_id}`} onSave={labelRecord} /> },
        ]} />
        <Pager page={recordPage} limit={PAGE_SIZE} total={Number(recordMeta.total || 0)} onChange={setRecordPage} />
      </Card>
    </>}
  </>;
}

function LabelControl({ row, labels, disabled, busy, onSave }) {
  const [labelId, setLabelId] = useState(row.label_id || '');
  return <div className="tv4-label-control"><select aria-label="Chọn nhãn" value={labelId} disabled={disabled || busy} onChange={(e) => setLabelId(e.target.value)}><option value="">Chọn nhãn</option>{labels.map((l) => <option key={l.label_id} value={l.label_id}>{l.name_vi} ({l.label_code})</option>)}</select><Button size="sm" disabled={disabled || !labelId || busy} onClick={() => onSave(row.record_id, labelId)}>Gán</Button>{row.label_source && <small className="muted">{row.label_source}</small>}</div>;
}

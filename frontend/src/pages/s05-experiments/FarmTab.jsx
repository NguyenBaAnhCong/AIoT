import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import DataTable from '../../components/DataTable';
import { ErrorBox } from '../../components/Feedback';
import { Button, Card } from '../../components/ui';
import { fmtDate, fmtNum, QuickForm, StatusBadge, Tabs, Toggle, useAction } from '../tv3/shared';

// Quản lý khu thí nghiệm, ô, cây trồng, mùa vụ (API /farm/*) – nằm trong màn hình 05.
const PLOT_STATUS = [['ACTIVE', 'Đang dùng'], ['FALLOW', 'Bỏ hóa'], ['INACTIVE', 'Tạm ngừng'], ['RETIRED', 'Ngừng']];

export default function FarmTab({ canWrite }) {
  const [tab, setTab] = useState('plots');
  return (
    <>
      <Tabs value={tab} onChange={setTab} tabs={[['plots', 'Ô'], ['sites', 'Khu'], ['crops', 'Cây trồng'], ['seasons', 'Mùa vụ']]} />
      {tab === 'sites' && <Sites canWrite={canWrite} />}
      {tab === 'plots' && <Plots canWrite={canWrite} />}
      {tab === 'crops' && <Crops canWrite={canWrite} />}
      {tab === 'seasons' && <Seasons canWrite={canWrite} />}
    </>
  );
}

/** Bảng + nút xóa + form thêm, dùng chung cho 4 danh mục. */
function Resource({ title, path, pk, columns, fields, canWrite, canDelete = true, transform }) {
  const list = useApi(() => api.get(path, { limit: 200 }), [path]);
  const act = useAction();
  const cols = [...columns, ...(canWrite && canDelete ? [{
    key: '_del', title: '', render: (r) => (
      <Button size="sm" variant="danger" loading={act.busy === r[pk]}
        onClick={() => window.confirm('Xóa bản ghi này?') && act.run(r[pk], async () => { await api.del(`${path}/${r[pk]}`); list.reload(); })}>Xóa</Button>
    ),
  }] : [])];
  return (
    <Card title={title} actions={
      <Toggle label="+ Thêm" allowed={canWrite}>{(close) => (
        <QuickForm submitLabel="Thêm" fields={fields(list)}
          onSubmit={async (b) => { await api.post(path, transform ? transform(b) : b); close(); list.reload(); }} />
      )}</Toggle>
    }>
      <ErrorBox error={act.error || list.error} onRetry={list.error ? list.reload : undefined} />
      <DataTable columns={cols} rows={list.data} loading={list.loading} rowKey={pk} />
    </Card>
  );
}

function Sites({ canWrite }) {
  return <Resource title="Khu thí nghiệm" path="/farm/sites" pk="site_id" canWrite={canWrite}
    columns={[
      { key: 'site_code', title: 'Mã', render: (r) => <strong>{r.site_code}</strong> },
      { key: 'name', title: 'Tên' },
      { key: 'province', title: 'Tỉnh' }, { key: 'district', title: 'Huyện' },
      { key: 'pos', title: 'Tọa độ', render: (r) => (r.latitude != null ? `${r.latitude}, ${r.longitude}` : '—') },
      { key: 'plot_count', title: 'Số ô' },
    ]}
    fields={() => [
      { name: 'site_code', label: 'Mã khu', required: true }, { name: 'name', label: 'Tên', required: true },
      { name: 'province', label: 'Tỉnh' }, { name: 'district', label: 'Huyện' },
      { name: 'latitude', label: 'Vĩ độ', type: 'number' }, { name: 'longitude', label: 'Kinh độ', type: 'number' },
      { name: 'elevation_m', label: 'Cao độ (m)', type: 'number' }, { name: 'climate_zone', label: 'Vùng khí hậu' },
    ]} />;
}

function Plots({ canWrite }) {
  const sites = useApi(() => api.get('/farm/sites', { limit: 200 }), []);
  return <Resource title="Ô thí nghiệm" path="/farm/plots" pk="plot_id" canWrite={canWrite}
    columns={[
      { key: 'plot_code', title: 'Mã ô', render: (r) => <strong>{r.plot_code}</strong> },
      { key: 'site_code', title: 'Khu' },
      { key: 'area_m2', title: 'Diện tích (m²)', render: (r) => fmtNum(r.area_m2) },
      { key: 'soil_type', title: 'Loại đất' }, { key: 'block_no', title: 'Khối' },
      { key: 'status', title: 'Trạng thái', render: (r) => <StatusBadge value={r.status} /> },
      { key: 'current_treatment_code', title: 'Nghiệm thức', render: (r) => r.current_treatment_code || '—' },
    ]}
    fields={() => [
      { name: 'site_id', label: 'Khu', required: true, options: (sites.data || []).map((s) => [s.site_id, `${s.site_code} – ${s.name}`]) },
      { name: 'plot_code', label: 'Mã ô', required: true },
      { name: 'area_m2', label: 'Diện tích (m²)', type: 'number', required: true },
      { name: 'soil_type', label: 'Loại đất', required: true }, { name: 'soil_texture', label: 'Thành phần cơ giới' },
      { name: 'block_no', label: 'Khối (block)', type: 'number' },
      { name: 'latitude', label: 'Vĩ độ', type: 'number' }, { name: 'longitude', label: 'Kinh độ', type: 'number' },
      { name: 'status', label: 'Trạng thái', options: PLOT_STATUS },
    ]} />;
}

function Crops({ canWrite }) {
  return <Resource title="Cây trồng" path="/farm/crops" pk="crop_id" canWrite={canWrite}
    columns={[
      { key: 'crop_code', title: 'Mã', render: (r) => <strong>{r.crop_code}</strong> },
      { key: 'name_vi', title: 'Tên' }, { key: 'scientific_name', title: 'Tên khoa học' }, { key: 'variety', title: 'Giống' },
    ]}
    fields={() => [
      { name: 'crop_code', label: 'Mã', required: true }, { name: 'name_vi', label: 'Tên', required: true },
      { name: 'scientific_name', label: 'Tên khoa học' }, { name: 'variety', label: 'Giống' },
    ]} />;
}

function Seasons({ canWrite }) {
  const plots = useApi(() => api.get('/farm/plots', { limit: 200 }), []);
  const crops = useApi(() => api.get('/farm/crops', { limit: 200 }), []);
  return <Resource title="Mùa vụ" path="/farm/crop-seasons" pk="crop_season_id" canWrite={canWrite}
    columns={[
      { key: 'season_code', title: 'Mùa vụ', render: (r) => <strong>{r.season_code}</strong> },
      { key: 'plot_code', title: 'Ô' }, { key: 'crop_name', title: 'Cây trồng' },
      { key: 'planted_on', title: 'Ngày trồng', render: (r) => fmtDate(r.planted_on) },
      { key: 'harvested_on', title: 'Thu hoạch', render: (r) => fmtDate(r.harvested_on) },
      { key: 'planting_density', title: 'Mật độ', render: (r) => fmtNum(r.planting_density) },
    ]}
    fields={() => [
      { name: 'plot_id', label: 'Ô', required: true, options: (plots.data || []).map((p) => [p.plot_id, p.plot_code]) },
      { name: 'crop_id', label: 'Cây trồng', required: true, options: (crops.data || []).map((c) => [c.crop_id, c.name_vi]) },
      { name: 'season_code', label: 'Mã mùa vụ', required: true },
      { name: 'planted_on', label: 'Ngày trồng', type: 'date', required: true },
      { name: 'harvested_on', label: 'Ngày thu hoạch', type: 'date' },
      { name: 'planting_density', label: 'Mật độ (cây/ha)', type: 'number' },
    ]} />;
}

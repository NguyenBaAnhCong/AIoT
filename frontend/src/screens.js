// =====================================================================
// Danh sách 14 màn hình: đường dẫn, tên menu, quyền xem, người phụ trách.
// Menu bên trái và route đều tự sinh từ file này, và đã khai báo đủ từ đầu
// nên các thành viên KHÔNG cần sửa file này (tránh xung đột Git).
// Mỗi màn hình nằm trong thư mục riêng pages/sNN-ten/ – chỉ sửa thư mục của mình.
//
// Màn hình có thể tự chia đường dẫn con (vd /admin/users) bằng <Routes> bên trong,
// vì route được khai báo dạng "path/*".
// =====================================================================
import { lazy } from 'react';

export const groups = ['Tổng quan', 'Giám sát', 'Nông học', 'Dữ liệu & AI', 'Vận hành', 'Quản trị'];

export const screens = [
  { id: '01', path: '/',            title: 'Dashboard',            group: 'Tổng quan',    permission: 'reporting.read',    owner: 'TV1', component: lazy(() => import('./pages/s01-dashboard')) },
  { id: '02', path: '/map',         title: 'Bản đồ khu thí nghiệm', group: 'Giám sát',     permission: 'iot.read',          owner: 'TV2', component: lazy(() => import('./pages/s02-map')) },
  { id: '03', path: '/monitoring',  title: 'Monitoring cảm biến',  group: 'Giám sát',     permission: 'iot.read',          owner: 'TV2', component: lazy(() => import('./pages/s03-monitoring')) },
  { id: '05', path: '/experiments', title: 'Thí nghiệm & nghiệm thức', group: 'Nông học', permission: 'experiment.read',   owner: 'TV3', component: lazy(() => import('./pages/s05-experiments')) },
  { id: '06', path: '/biochar',     title: 'Biochar & làm giàu',   group: 'Nông học',     permission: 'biochar.read',      owner: 'TV3', component: lazy(() => import('./pages/s06-biochar')) },
  { id: '07', path: '/laboratory',  title: 'Dữ liệu phòng thí nghiệm', group: 'Nông học', permission: 'laboratory.read',  owner: 'TV3', component: lazy(() => import('./pages/s07-laboratory')) },
  { id: '08', path: '/data-quality', title: 'Data Quality & Audit', group: 'Dữ liệu & AI', permission: 'data_quality.read', owner: 'TV4', component: lazy(() => import('./pages/s08-data-quality')) },
  { id: '09', path: '/dataset',     title: 'Dataset & Labeling',   group: 'Dữ liệu & AI', permission: 'dataset.read',      owner: 'TV4', component: lazy(() => import('./pages/s09-dataset')) },
  { id: '04', path: '/sqi',         title: 'Sức khỏe đất – SQI',   group: 'Dữ liệu & AI', permission: 'sqi.read',          owner: 'TV5', component: lazy(() => import('./pages/s04-sqi')) },
  { id: '10', path: '/ml',          title: 'Embedded ML',          group: 'Dữ liệu & AI', permission: 'ml.read',           owner: 'TV6', component: lazy(() => import('./pages/s10-ml')) },
  { id: '11', path: '/ota',         title: 'OTA & Edge Gateway',   group: 'Vận hành',     permission: 'ota.read',          owner: 'TV6', component: lazy(() => import('./pages/s11-ota')) },
  { id: '12', path: '/alerts',      title: 'Cảnh báo & quyết định', group: 'Vận hành',    permission: 'alert.read',        owner: 'TV5', component: lazy(() => import('./pages/s12-alerts')) },
  { id: '13', path: '/reports',     title: 'Báo cáo',              group: 'Vận hành',     permission: 'reporting.read',    owner: 'TV5', component: lazy(() => import('./pages/s13-reports')) },
  { id: '14', path: '/admin',       title: 'Quản trị hệ thống',    group: 'Quản trị',     permission: 'iam.read',          owner: 'TV1', component: lazy(() => import('./pages/s14-admin')) },
];

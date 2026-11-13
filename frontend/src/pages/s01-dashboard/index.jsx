import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBox, Spinner } from '../../components/Feedback';
import { Badge, Card, PageHeader, Stat } from '../../components/ui';

// Màn hình 01 – Dashboard tổng quan (TV1).
// Hiện mới có trạng thái hệ thống. Sẽ bổ sung: thẻ 12 KPI nghiệm thu (reporting.v_acceptance_summary),
// bảng các ô (reporting.v_dashboard_plots), số cảnh báo đang mở.
export default function DashboardPage() {
  const { user } = useAuth();
  const health = useApi(() => api.get('/health'), []);

  return (
    <>
      <PageHeader title="Dashboard tổng quan" subtitle={`Xin chào, ${user.fullName}`} />
      <div className="grid-3">
        {health.loading && <Spinner />}
        {health.data && (
          <>
            <Stat label="Backend" value="Hoạt động" tone="ok" hint={`Giờ máy chủ: ${new Date(health.data.server_time).toLocaleString('vi-VN')}`} />
            <Stat label="Database" value={health.data.db} tone="ok" hint="PostgreSQL" />
            <Stat label="Schema nghiệp vụ" value={health.data.domain_schemas} unit="/ 16" tone={health.data.domain_schemas === 16 ? 'ok' : 'warn'} />
          </>
        )}
      </div>
      <ErrorBox error={health.error} onRetry={health.reload} />

      <Card title="KPI nghiệm thu">
        <p className="muted">12 chỉ tiêu nghiệm thu (thu thập ≥ 90 %, lỗi/trùng ≤ 5 %, Accuracy ≥ 90 %, OTA ≥ 95 %…) sẽ hiển thị tại đây khi API báo cáo hoàn thành.</p>
        <Badge tone="info">Đang phát triển</Badge>
      </Card>
    </>
  );
}

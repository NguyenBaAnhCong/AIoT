import ComingSoon from '../../components/ComingSoon';

// TV2 thay nội dung file này bằng màn hình 03 thật.
export default function Page() {
  return <ComingSoon id="03" title="Monitoring cảm biến" owner="TV2" sources="iot.sensor_readings (chỉ mục plot_id, measured_at), quality_status, iot.sensor_readings_hourly" />;
}

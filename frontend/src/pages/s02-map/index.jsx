import ComingSoon from '../../components/ComingSoon';

// TV2 thay nội dung file này bằng màn hình 02 thật.
export default function Page() {
  return <ComingSoon id="02" title="Bản đồ khu thí nghiệm" owner="TV2" sources="farm.plots.boundary_geojson, iot.gateways, iot.sensor_nodes (toạ độ, trạng thái, last_seen_at)" />;
}

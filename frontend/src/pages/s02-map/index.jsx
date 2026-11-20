import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { ErrorBox, Spinner } from '../../components/Feedback';
import { Card, PageHeader } from '../../components/ui';

export default function Page() {
  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const layers = useRef(null);

  const plots = useApi(() => api.get('/farm/plots', { limit: 200 }), []);
  const devices = useApi(() => api.get('/devices'), []);

  useEffect(() => {
    if (!mapElement.current || mapInstance.current) return;

    const map = L.map(mapElement.current).setView([16, 106], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    mapInstance.current = map;
    layers.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapInstance.current = null;
      layers.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    const group = layers.current;

    if (!map || !group || plots.loading || devices.loading) return;

    group.clearLayers();
    const bounds = L.latLngBounds([]);

    for (const plot of plots.data ?? []) {
      if (plot.boundary_geojson) {
        try {
          const geometry =
            typeof plot.boundary_geojson === 'string'
              ? JSON.parse(plot.boundary_geojson)
              : plot.boundary_geojson;

          const polygon = L.geoJSON(geometry, {
            style: {
              color: plot.status === 'ACTIVE' ? '#198754' : '#888',
              weight: 2,
              fillOpacity: 0.15,
            },
          });

          const popup = document.createElement('div');
          popup.textContent =
            `Ô: ${plot.plot_code} | Đất: ${plot.soil_type} | Trạng thái: ${plot.status}`;
          polygon.bindPopup(popup);
          polygon.addTo(group);

          if (polygon.getBounds().isValid()) {
            bounds.extend(polygon.getBounds());
          }
        } catch {
          // Bỏ qua ranh giới GeoJSON không hợp lệ.
        }
      } else if (hasCoordinates(plot.latitude, plot.longitude)) {
        L.circleMarker([Number(plot.latitude), Number(plot.longitude)], {
          radius: 7,
          color: '#198754',
        })
          .bindPopup(`Ô ${plot.plot_code}`)
          .addTo(group);
      }
    }

    const deviceRows = devices.data?.devices ?? [];
    const drawnGateways = new Set();
    const drawnNodes = new Set();

    for (const device of deviceRows) {
      if (
        device.gateway_id &&
        !drawnGateways.has(device.gateway_id) &&
        hasCoordinates(device.gateway_latitude, device.gateway_longitude)
      ) {
        drawnGateways.add(device.gateway_id);

        const point = [
          Number(device.gateway_latitude),
          Number(device.gateway_longitude),
        ];
        const marker = L.circleMarker(point, {
          radius: 9,
          color: statusColor(device.gateway_status),
          fillOpacity: 0.9,
        });

        const popup = document.createElement('div');
        popup.textContent =
          `Gateway ${device.gateway_code} | Trạng thái: ${device.gateway_status}`;
        marker.bindPopup(popup).addTo(group);
        bounds.extend(point);
      }

      if (
        device.node_id &&
        !drawnNodes.has(device.node_id) &&
        hasCoordinates(device.node_latitude, device.node_longitude)
      ) {
        drawnNodes.add(device.node_id);

        const point = [
          Number(device.node_latitude),
          Number(device.node_longitude),
        ];
        const marker = L.circleMarker(point, {
          radius: 7,
          color: statusColor(device.node_status),
          fillOpacity: 0.9,
        });

        const popup = document.createElement('div');
        popup.textContent =
          `Node ${device.node_code} | Ô: ${device.plot_code ?? 'chưa gán'} | Trạng thái: ${device.node_status}`;
        marker.bindPopup(popup).addTo(group);
        bounds.extend(point);
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.15));
    }
  }, [plots.data, plots.loading, devices.data, devices.loading]);

  return (
    <>
      <PageHeader
        title="Bản đồ khu thí nghiệm"
        subtitle="Vị trí các ô, gateway và sensor node"
      />

      <ErrorBox error={plots.error} onRetry={plots.reload} />
      <ErrorBox error={devices.error} onRetry={devices.reload} />

      {(plots.loading || devices.loading) && <Spinner />}

      <Card title="Bản đồ thiết bị">
        <div
          ref={mapElement}
          style={{ height: 560, width: '100%', borderRadius: 8 }}
        />
        <p className="muted">
          Màu xanh: hoạt động; vàng: pin yếu; đỏ: trạng thái khác.
          Bấm vào ô hoặc điểm thiết bị để xem chi tiết.
        </p>
      </Card>
    </>
  );
}

function hasCoordinates(latitude, longitude) {
  return (
    latitude !== null &&
    latitude !== undefined &&
    longitude !== null &&
    longitude !== undefined &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude))
  );
}

function statusColor(status) {
  if (status === 'ONLINE') return '#198754';
  if (status === 'LOW_BATTERY') return '#e0a800';
  return '#dc3545';
}
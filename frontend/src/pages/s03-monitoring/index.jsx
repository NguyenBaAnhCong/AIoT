import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { ErrorBox, Spinner } from '../../components/Feedback';
import { Card, PageHeader } from '../../components/ui';

const PARAMETERS = [
  { key: 'ph', label: 'pH' },
  { key: 'ec', label: 'EC' },
  { key: 'soil_moisture', label: 'Độ ẩm đất' },
  { key: 'soil_temperature', label: 'Nhiệt độ đất' },
  { key: 'n', label: 'N' },
  { key: 'p', label: 'P' },
  { key: 'k', label: 'K' },
];

export default function Page() {
  const [filters, setFilters] = useState({
    sensor_id: '',
    from: '',
    to: '',
    plot_id: '',
  });

  const [parameter, setParameter] = useState('ph');

  const devices = useApi(() => api.get('/devices'), []);

  const readings = useApi(
    () =>
      api.get('/devices/readings', {
        plot_id: filters.plot_id || undefined,
        sensor_id: filters.sensor_id || undefined,
        from: filters.from
          ? new Date(filters.from).toISOString()
          : undefined,
        to: filters.to
          ? new Date(filters.to).toISOString()
          : undefined,
        limit: 100,
      }),
    [filters.sensor_id, filters.from, filters.to, filters.plot_id]
  );

  const sensors =
    devices.data?.devices?.filter((device) => device.sensor_id) ?? [];

  const plots = [
    ...new Map(
      (devices.data?.devices ?? [])
        .filter((device) => device.plot_id)
        .map((device) => [
          device.plot_id,
          { plot_id: device.plot_id, plot_code: device.plot_code },
        ])
    ).values(),
  ];

  const rows = readings.data?.readings ?? [];

  return (
    <>
      <PageHeader
        title="Monitoring cảm biến"
        subtitle="Theo dõi số đo và cờ chất lượng dữ liệu"
      />

      <Card title="Bộ lọc">
        <div className="grid-3">
          <label>
            Cảm biến
            <select
              value={filters.sensor_id}
              onChange={(event) =>
                setFilters({ ...filters, sensor_id: event.target.value })
              }
            >
              <option value="">Tất cả cảm biến</option>
              {sensors.map((sensor) => (
                <option key={sensor.sensor_id} value={sensor.sensor_id}>
                  {sensor.sensor_code}
                </option>
              ))}
            </select>
          </label>

          <label>
            Ô thí nghiệm
            <select
              value={filters.plot_id}
              onChange={(event) =>
                setFilters({ ...filters, plot_id: event.target.value })
              }
            >
              <option value="">Tất cả ô</option>
              {plots.map((plot) => (
                <option key={plot.plot_id} value={plot.plot_id}>
                  {plot.plot_code}
                </option>
              ))}
            </select>
          </label>

          <label>
            Từ thời gian
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(event) =>
                setFilters({ ...filters, from: event.target.value })
              }
            />
          </label>

          <label>
            Đến thời gian
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(event) =>
                setFilters({ ...filters, to: event.target.value })
              }
            />
          </label>
        </div>
      </Card>

      <ErrorBox error={devices.error} onRetry={devices.reload} />
      <ErrorBox error={readings.error} onRetry={readings.reload} />

      <Card title="Biểu đồ số đo theo thời gian">
        <label>
          Chỉ tiêu
          <select
            value={parameter}
            onChange={(event) => setParameter(event.target.value)}
          >
            {PARAMETERS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <SensorLineChart rows={rows} parameter={parameter} />
      </Card>

      <Card title={`Số đo (${rows.length})`}>
        {devices.loading || readings.loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <p>Không có số đo phù hợp với bộ lọc.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Cảm biến</th>
                  <th>pH</th>
                  <th>EC</th>
                  <th>Ẩm đất</th>
                  <th>Nhiệt độ</th>
                  <th>N</th>
                  <th>P</th>
                  <th>K</th>
                  <th>QC</th>
                  <th>Cờ QC</th>
                  <th>Dữ liệu thô</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((reading) => (
                  <tr key={`${reading.reading_id}-${reading.measured_at}`}>
                    <td>
                      {new Date(reading.measured_at).toLocaleString('vi-VN')}
                    </td>
                    <td>{reading.sensor_id}</td>
                    <td>{reading.ph ?? '—'}</td>
                    <td>{reading.ec ?? '—'}</td>
                    <td>{reading.soil_moisture ?? '—'}</td>
                    <td>{reading.soil_temperature ?? '—'}</td>
                    <td>{reading.n ?? '—'}</td>
                    <td>{reading.p ?? '—'}</td>
                    <td>{reading.k ?? '—'}</td>
                    <td>{reading.quality_status}</td>
                    <td>{reading.quality_flags?.join(', ') || '—'}</td>
                    <td>
                      <details>
                        <summary>Xem</summary>
                        <pre>{JSON.stringify(reading.raw_payload, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function SensorLineChart({ rows, parameter }) {
  const points = rows
    .filter(
      (row) =>
        row[parameter] !== null &&
        row[parameter] !== undefined &&
        Number.isFinite(Number(row[parameter]))
    )
    .sort(
      (a, b) =>
        new Date(a.measured_at).getTime() -
        new Date(b.measured_at).getTime()
    );

  if (points.length === 0) {
    return <p>Chưa có dữ liệu cho chỉ tiêu này trong khoảng đã chọn.</p>;
  }

  const width = 800;
  const height = 280;
  const padding = 48;
  const values = points.map((point) => Number(point[parameter]));
  const min = Math.min(...values);
  const max = Math.max(...values);

  const coordinates = points.map((point, index) => {
    const x =
      points.length === 1
        ? width / 2
        : padding + (index / (points.length - 1)) * (width - padding * 2);

    const y =
      min === max
        ? height / 2
        : height -
          padding -
          ((Number(point[parameter]) - min) / (max - min)) *
            (height - padding * 2);

    return { x, y };
  });

  const linePoints = coordinates
    .map((point) => `${point.x},${point.y}`)
    .join(' ');

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Biểu đồ ${parameter} theo thời gian`}
        style={{ width: '100%', minWidth: 500, height: 280 }}
      >
        <line
          x1={padding}
          y1={padding}
          x2={padding}
          y2={height - padding}
          stroke="#888"
        />
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="#888"
        />

        <text x="8" y={padding} fontSize="13">{max.toFixed(2)}</text>
        <text x="8" y={height - padding} fontSize="13">{min.toFixed(2)}</text>

        <polyline
          points={linePoints}
          fill="none"
          stroke="#197252"
          strokeWidth="3"
        />

        {coordinates.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r="3"
            fill="#197252"
          />
        ))}

        <text x={padding} y={height - 12} fontSize="12">
          {new Date(points[0].measured_at).toLocaleString('vi-VN')}
        </text>
        <text
          x={width - padding}
          y={height - 12}
          textAnchor="end"
          fontSize="12"
        >
          {new Date(points[points.length - 1].measured_at).toLocaleString('vi-VN')}
        </text>
      </svg>
    </div>
  );
}
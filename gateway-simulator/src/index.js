const API_URL = (process.env.API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');
const API_KEY = process.env.GATEWAY_API_KEY;
const INTERVAL_MS = Number(process.env.SAMPLE_INTERVAL_MS || 60000);

if (!API_KEY) {
  console.error('GATEWAY_API_KEY chưa được cấu hình. Hãy đặt key trong file .env ở thư mục gốc.');
  process.exit(1);
}
if (!Number.isFinite(INTERVAL_MS) || INTERVAL_MS < 60000 || INTERVAL_MS > 900000) {
  console.error('SAMPLE_INTERVAL_MS phải từ 60000 đến 900000 (1–15 phút).');
  process.exit(1);
}

const sensors = [
  { sensor_code: 'S01', seq_no: 0, ph: 5.8, ec: 0.42, moisture: 29, temp: 26.5, n: 42, p: 18, k: 105 },
  { sensor_code: 'S02', seq_no: 0, ph: 6.1, ec: 0.51, moisture: 32, temp: 27.1, n: 55, p: 22, k: 120 },
  { sensor_code: 'S03', seq_no: 0, ph: 6.4, ec: 0.63, moisture: 35, temp: 25.8, n: 68, p: 28, k: 138 },
];

function vary(value, spread, digits = 2) {
  const noise = (Math.random() - 0.5) * spread;
  return Number((value + noise).toFixed(digits));
}

async function sendReading(sensor) {
  sensor.seq_no += 1;
  const payload = {
    sensor_code: sensor.sensor_code,
    measured_at: new Date().toISOString(),
    seq_no: sensor.seq_no,
    battery_v: vary(3.9, 0.08),
    rssi_dbm: Math.round(vary(-97, 8, 0)),
    snr_db: vary(7.5, 1.5),
    raw: {
      PH: vary(sensor.ph, 0.2),
      EC: vary(sensor.ec, 0.08, 3),
      MOISTURE: vary(sensor.moisture, 2),
      SOIL_TEMP: vary(sensor.temp, 1),
      N: vary(sensor.n, 6),
      P: vary(sensor.p, 4),
      K: vary(sensor.k, 10),
    },
  };

  const response = await fetch(`${API_URL}/gateway/ingest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  let result;
  try {
    result = JSON.parse(body);
  } catch {
    result = body;
  }
  const data = result?.data;
  console.log(
    `[${new Date().toISOString()}] ${sensor.sensor_code}: ` +
    (data?.duplicate ? 'bản tin trùng, đã bỏ qua' : `đã gửi (reading_id=${data?.reading_id ?? 'n/a'})`)
  );
}

async function cycle() {
  for (const sensor of sensors) {
    try {
      await sendReading(sensor);
    } catch (error) {
      // Không in API key; vòng sau sẽ thử gửi lại.
      console.error(`[${sensor.sensor_code}] Gửi thất bại: ${error.message}`);
    }
  }
  setTimeout(cycle, INTERVAL_MS);
}

console.log(`Gateway giả lập đang chạy: 1 gateway, ${sensors.length} sensor; chu kỳ ${INTERVAL_MS} ms.`);
console.log(`Backend API: ${API_URL}/gateway/ingest`);
cycle();

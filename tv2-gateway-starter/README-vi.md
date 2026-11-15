# Bộ khởi đầu TV2: backend nhận dữ liệu + Gateway Simulator

## Tệp trong gói
- `backend/src/modules/gateway/gateway.routes.js`: endpoint POST bảo vệ bằng `requireApiKey('iot.ingest')`, ánh xạ sensor_code sang UUID và gọi `iot.ingest_reading()`.
- `backend/REGISTER-ROUTE.txt`: hai dòng cần thêm vào `backend/src/routes.js`.
- `gateway-simulator/`: chương trình Node 20 gửi mẫu đo cho S01, S02, S03.

## Đưa vào Codespaces
Sao chép thư mục `gateway-simulator` vào thư mục gốc repository. Sao chép file route vào `backend/src/modules/gateway/`, sau đó làm theo `backend/REGISTER-ROUTE.txt`.

Đặt API key trong `.env` ở thư mục gốc repository:
`GATEWAY_API_KEY=...`
Không chia sẻ hoặc commit `.env`.

Trong `docker-compose.yml` ở thư mục gốc, bỏ dấu `#` ở khối `gateway-simulator` đã chuẩn bị sẵn. Khi chạy bằng Docker, `API_URL` phải là `http://backend:4000/api/v1`, như khối compose mẫu.

Mặc định simulator gửi mỗi sensor mỗi 15 giây. Có thể đặt `SAMPLE_INTERVAL_MS` trong compose để đổi chu kỳ.

## Điều kiện dữ liệu
Database cần có các sensor `S01`, `S02`, `S03` và hàm `iot.ingest_reading()` đã được nạp. Dữ liệu mẫu chính tạo ba sensor này.

# Gateway giả lập (TV2 phụ trách)

Thư mục dành cho chương trình giả lập **1 Edge Gateway + 3 Sensor Node** gửi dữ liệu vào hệ thống.
TV1 đã chuẩn bị sẵn phần xác thực để TV2 dùng ngay:

## 1. Lấy API key

Đăng nhập web bằng tài khoản `admin` → màn hình **14 Quản trị hệ thống** → *Tạo API key mới*,
chọn phạm vi `iot.ingest` (gateway gửi số đo). Key chỉ hiển thị **một lần**, hãy sao chép vào file `.env` của bạn:

```
GATEWAY_API_KEY=ak_xxxxxxxx_...
```

## 2. Kiểm tra key hoạt động

```
curl -H "X-API-Key: ak_xxxxxxxx_..." http://localhost:4000/api/v1/gateway/ping
```

Thành công → `{"data":{"ok":true,"scopes":["iot.ingest"],...}}`.  Sai/thiếu key → 401. Key thiếu phạm vi → 403.

## 3. Cách viết endpoint nhận dữ liệu (backend)

```js
import { requireApiKey } from '../../middleware/apiKey.js';
router.post('/ingest', requireApiKey('iot.ingest'), handler);   // req.apiKey = { id, scopes, ... }
```

Trong handler gọi hàm SQL `iot.ingest_reading()` (xem `database/init/08_data_quality.sql`).
Bản tin trùng sẽ được cơ sở dữ liệu tự ghi nhận là issue `DUPLICATE`.

## 4. Đưa vào Docker Compose

Khi gateway giả lập sẵn sàng, bỏ dấu `#` ở khối `gateway-simulator` trong `docker-compose.yml`
(đã chuẩn bị sẵn, chỉ cần thêm `Dockerfile` vào thư mục này).

# TV5 — SQI, cảnh báo và báo cáo

Module chạy cục bộ bằng Node.js 22+ và PostgreSQL đã nạp schema của dự án. Mở cả ba màn hình từ cùng một địa chỉ.

## Chạy trên Windows

Nếu chưa có database demo, chạy các lệnh sau từ thư mục chứa `run_all.sql`:

```powershell
createdb -U postgres edge_aiot_biochar_tv5
psql -U postgres -d edge_aiot_biochar_tv5 -v ON_ERROR_STOP=1 -f run_all.sql
```

Trong thư mục `tv5`, tạo hoặc giữ file `.env` đã thiết lập:

```dotenv
PGHOST=localhost
PGPORT=5432
PGDATABASE=edge_aiot_biochar_tv5
PGUSER=postgres
PGPASSWORD="mat_khau_cua_ban"
PORT=3005
TV5_USERNAME=researcher01
```

```powershell
npm.cmd ci
npm.cmd run migrate
npm.cmd start
```

Mở [TV5 trên localhost](http://127.0.0.1:3005). Nếu Node.js đang chạy bản cũ, nhấn Ctrl+C trước khi chạy lại. Các migration sửa hàm đánh giá cảnh báo để dùng phiên bản SQI đang hoạt động và giữ ID điểm SQI khi tính lại, kể cả khi cảnh báo đã tham chiếu đến điểm đó. Tài khoản chạy migration cần quyền sửa các hàm hiện có.

## Demo ba màn hình

Ba trang TV5 dùng Tailwind CSS. Khi sửa HTML, lớp CSS trong JavaScript hoặc các tệp `*.tailwind.css`, chạy `npm.cmd run build:css` rồi commit kèm `public/alerts.css`, `public/sqi.css` và `public/reports.css`. Trình duyệt tải stylesheet đã biên dịch từ server cục bộ.

1. **Sức khỏe đất:** chọn ô và phiên bản. Bấm vào điểm trên biểu đồ để xem chỉ tiêu. Bảng bên dưới so sánh toàn bộ điểm của phiên bản theo nghiệm thức. Để thử bản SQI mới, mở mục tạo phiên bản, đặt mã và tên mới, chỉnh cấu hình được sao chép sẵn, lưu nháp rồi tính điểm. Kích hoạt phiên bản nháp sau khi đã tính điểm. Dataset demo là `FROZEN`, có thể dùng để tính thử điểm. Gán nhãn cần phiên bản SQI `ACTIVE` và dataset `BUILT`, trước khi TV4 đóng băng dữ liệu.
2. **Cảnh báo:** chọn một cảnh báo đang mở, xem bằng chứng rồi xác nhận. Nhập ghi chú và giải quyết. Với khuyến nghị, thử chấp nhận rồi hoàn thành. Để kiểm tra luật trên dữ liệu mẫu, chọn mốc trong tháng 8–9/2026.
3. **Báo cáo:** chọn thí nghiệm và báo cáo kinh tế, sau đó chọn Excel hoặc PDF. Bấm **Tạo báo cáo** rồi tải trong lịch sử. Báo cáo kỹ thuật tổng hợp SQI theo ô, nghiệm thức và phiên bản. Báo cáo môi trường dùng lượng carbon lưu giữ trong `reporting.economic_results`. Các dòng kinh tế/môi trường trong seed chưa gắn mùa vụ, nên giữ mùa vụ **Tất cả** khi demo hai loại này.

Các file báo cáo được lưu tại `.reports/` trên máy chạy server. Windows dùng Arial khi xuất PDF tiếng Việt. Nếu máy không có font mặc định, đặt `TV5_PDF_FONT` thành đường dẫn tới font TTF hỗ trợ tiếng Việt.

## Chạy job

Để kiểm tra bản demo trước buổi báo cáo, giữ server chạy và mở terminal thứ hai:

```powershell
npm.cmd run check
npm.cmd run demo:jobs
```

`check` kiểm tra đường dẫn và API đọc của cả ba màn hình. `demo:jobs` tính lại SQI và đánh giá cảnh báo trong các giao dịch được hoàn tác. Dùng lệnh này để demo mà không lưu thay đổi hoặc gửi Telegram. Có thể thử thời điểm khác bằng `npm.cmd run demo:jobs -- "2026-09-14T14:00:00+07:00"`.

Xem [Tiến độ TV5](TIEN_DO_TV5.md) để chuẩn bị báo cáo tuần.

Chạy một lần với `npm.cmd run jobs -- --once`, hoặc chạy định kỳ trong terminal riêng với `npm.cmd run jobs`.

- `TV5_ALERT_MINUTES` mặc định 15 phút.
- `TV5_SQI_MINUTES` mặc định 1.440 phút. Đặt thêm `TV5_DATASET_ID` bằng UUID của dataset version đang ở trạng thái `BUILT` để job tính SQI và gán nhãn. TV4 quản lý việc build và freeze.
- Thêm `TV5_TELEGRAM_TOKEN` và `TV5_TELEGRAM_CHAT` trong `.env` để job gửi thông báo Telegram cho các cảnh báo vừa sinh. Khi gửi lỗi, job ghi log ID cảnh báo để kiểm tra. Lệnh đánh giá thủ công trên web dùng để thử luật và không gửi thông báo.

## Chạy trong repo chung

Từ thư mục chứa `docker-compose.yml`, chạy `docker compose up -d --build` rồi mở giao diện chung tại `http://localhost:8080`. Nếu chạy frontend bằng Vite, mở `http://localhost:5173` và chạy backend chung ở cổng 4000. Đăng nhập qua giao diện chung để mở **Sức khỏe đất**, **Cảnh báo & quyết định** và **Báo cáo**.

Backend chung phục vụ API tại `/api/v1/tv5`, dùng `DATABASE_URL` và quyền của phiên đăng nhập. Hai migration TV5 nằm trong `database/migrations/` và được áp dụng khi backend chung khởi động theo mặc định. Nếu tắt chế độ tự chạy migration, chạy `npm run migrate` trong `backend/` với cấu hình database chung.

Docker lưu tệp báo cáo TV5 trong volume `tv5_reports`. Khi chạy Node trực tiếp, có thể cấu hình đường dẫn tuyệt đối `TV5_REPORT_DIR` trong `.env` ở thư mục gốc dự án. Mặc định tệp nằm trong `tv5/.reports/`. PostgreSQL lưu thông tin và trạng thái báo cáo.

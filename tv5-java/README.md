# Backend Java TV5

Backend TV5 chạy bằng Java và Spring Boot tại cổng 4005. Ba trang TV5 dùng JavaScript thuần, không dùng React/JSX. Mã giao diện nằm trong `src/main/resources/static/tv5/assets/js/`: JavaScript tạo DOM, kiểu hiển thị, biểu đồ và xử lý tương tác. Không cần file HTML/CSS riêng; Java trả tài liệu khởi động tối thiểu để trình duyệt nạp module JS.

Menu của ứng dụng nhóm mở `/tv5/sqi`, `/tv5/alerts` và `/tv5/reports`. Vite và nginx chuyển `/tv5/*` cùng `/api/v1/tv5/*` trực tiếp tới Java. Các trang của thành viên khác tiếp tục dùng frontend chung; đăng nhập của TV1 dùng backend cổng 4000. TV5 chia sẻ phiên đăng nhập và kiểm tra quyền qua API nhóm.

## Cấu trúc theo dự án mẫu UAV

Chỉ TV5 được tổ chức lại. Mẫu tham chiếu là cách chia tầng và nghiệp vụ của UAV; cơ sở dữ liệu vẫn là PostgreSQL chung của nhóm. Không đưa JavaFX, giao thức bay hoặc dữ liệu mock UAV vào IoT.

```text
src/main/java/vn/biochar/tv5/
├── Application.java
├── rest/                 ISqiRest, IAlertRest, IReportRest, ISystemRest
│   └── impl/             REST adapter theo nghiệp vụ, UiRestImpl phục vụ trang
├── service/              ISqiService, IAlertService, IReportService, ISystemService
│   └── impl/             kiểm tra dữ liệu, nghiệp vụ, transaction, xuất PDF/XLSX
├── dao/                  ISqiDao, IAlertDao, IReportDao, ISystemDao
│   ├── impl/             SQL và truy cập dữ liệu theo nghiệp vụ
│   └── jdbc/             JdbcDatabase: bind tham số, chuẩn hóa JSON/UUID, phân trang
├── entity/               AlertRuleDefinition: dữ liệu luật đã kiểm tra
├── dto/request/          SqiScoreQuery, SqiCalculationRequest
├── dto/response/         ReportDownload
├── wrapper/              ApiResponse, giữ hợp đồng {data} với nhóm
├── common/               exception, util, transaction
├── config/               cấu hình môi trường, datasource, migration
├── security/             token TV1 và quyền thực tế trong database
└── job/                  Tv5Jobs dùng service, không truy vấn trực tiếp

src/main/resources/static/tv5/assets/js/
├── core/                 app.js, layout.js, format.js
├── api/                  http.js, auth-api.js, sqi-api.js, alert-api.js, report-api.js
├── components/           bảng, phân trang, nút, bằng chứng, tải tệp
├── pages/                sqi.page.js, sqi-configuration.page.js,
│                         alerts.page.js, reports.page.js
├── views/                cấu trúc giao diện tĩnh của ba trang
└── theme/                kiểu hiển thị dùng chung, giữ trong JS theo yêu cầu
```

Luồng backend: **REST → Service → DAO → PostgreSQL**. REST chỉ nhận/trả HTTP và kiểm tra quyền thao tác; SQL nằm trong DAO. Luồng frontend: **page → API theo nghiệp vụ → http.js → REST**. Chỉ `api/http.js` gọi `fetch`; các trang dùng component chung để dựng DOM. Các trang có hàm khởi tạo riêng và được nạp bởi `core/app.js`. Giao diện và các URL được giữ như trước khi tổ chức lại.

Ví dụ sửa SQI: API nằm trong `rest/impl/SqiRestImpl.java`, nghiệp vụ trong `service/impl/SqiServiceImpl.java`, câu truy vấn trong `dao/impl/SqiDaoImpl.java`; biểu đồ nằm trong `pages/sqi.page.js`, lời gọi dữ liệu trong `api/sqi-api.js`. Dùng JDBC để giữ các hàm PostgreSQL và schema đã có; không tạo lớp Hibernate giả khi chưa sử dụng ORM.

## Chạy trên Windows

Cần JDK 17 trở lên, khuyến nghị JDK 21 LTS. Maven Wrapper đi kèm tải Maven ở lần chạy đầu. Giữ file `.env` tại gốc `AIoT` với `DATABASE_URL` và `JWT_SECRET` giống backend TV1.

Chạy backend của các thành viên khác trong terminal thứ nhất:

```powershell
cd C:\IOT\AIoT\backend
npm.cmd ci
npm.cmd run dev
```

Chạy TV5 Java trong terminal thứ hai:

```powershell
cd C:\IOT\AIoT\tv5-java
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Chạy frontend trong terminal thứ ba:

```powershell
cd C:\IOT\AIoT\frontend
npm.cmd ci
npm.cmd run dev
```

Mở http://127.0.0.1:5173 và đăng nhập bằng tài khoản nhóm, sau đó chọn trang TV5 trong menu hoặc mở http://127.0.0.1:5173/tv5/sqi. Backend Java xác minh JWT HS256 của TV1, kiểm tra tài khoản còn hoạt động và quyền thực tế trong PostgreSQL. Các thao tác ghi đặt `app.user_id` trong transaction để audit lưu đúng người xử lý.

Docker Compose có dịch vụ `tv5-java` và chuyển API qua nginx. Chạy `docker compose up -d --build` từ thư mục gốc rồi mở http://localhost:8080.

## Database và báo cáo

Java dùng chung `DATABASE_URL` với các module khác. Mặc định đọc `../.env`, có thể chỉ định file khác qua biến `TV5_ENV_FILE`. Biến môi trường tiến trình được ưu tiên.

Hai migration TV5 trong `database/migrations/` được kiểm tra và áp dụng lúc khởi động, dùng cùng bảng `schema_migrations` và khóa PostgreSQL với backend nhóm. Tắt bằng `TV5_RUN_MIGRATIONS=false` khi cần.

Tệp báo cáo lưu tại `tv5/.reports/` để tiếp tục tải các báo cáo cũ. Đặt `TV5_REPORT_DIR` nếu dùng thư mục khác. Docker dùng volume `tv5_reports`. Apache POI tạo XLSX, PDFBox tạo PDF có font tiếng Việt. Windows dùng Arial, Linux dùng DejaVu Sans. Đặt `TV5_PDF_FONT` nếu cần đường dẫn TTF khác.

## Job định kỳ

Thêm vào `.env` gốc rồi khởi động lại Java:

```dotenv
TV5_JOBS_ENABLED=true
TV5_USERNAME=researcher01
TV5_DATASET_ID=uuid_dataset_version_BUILT_do_TV4_cung_cap
TV5_SQI_MINUTES=1440
TV5_ALERT_MINUTES=15
```

Job SQI gọi hàm tính điểm và gán nhãn cho dataset BUILT. Dataset FROZEN được bỏ qua. Job cảnh báo đánh giá dữ liệu cảm biến, SQI và suy luận AI. Đặt `TV5_TELEGRAM_TOKEN` và `TV5_TELEGRAM_CHAT` để gửi cảnh báo mới qua Telegram. Khi gửi thất bại, Java ghi ID cảnh báo vào log.

## API

Giữ nguyên đường dẫn frontend nhóm đang dùng:

| Nhóm | Đường dẫn |
| --- | --- |
| SQI | `GET /sqi/plots`, `GET /sqi/scores`, `GET /sqi/scores/{id}`, `GET /sqi/configuration`, `GET /sqi/comparison` |
| Cấu hình SQI | `POST /sqi/definitions`, `POST /sqi/definitions/{id}/activate`, `POST /sqi/calculate` |
| Cảnh báo | `GET /alerts`, `GET /alerts/summary`, `PATCH /alerts/{id}`, `POST /alerts/evaluate` |
| Luật và khuyến nghị | `GET/POST /alert-rules`, `PUT /alert-rules/{id}`, `PATCH /recommendations/{id}` |
| Báo cáo | `GET/POST /reports`, `GET /reports/options`, `GET /reports/kpis`, `GET /reports/{id}/file` |

Tiền tố chung là `/api/v1/tv5`. Các API nghiệp vụ yêu cầu Bearer token. API đọc trả `{data}`, danh sách phân trang trả `{data,meta:{page,limit,total}}`. Lỗi trả `{error:{code,message}}`. Tải báo cáo trả tệp nhị phân.

## Kiểm thử

Các kiểm thử tích hợp dùng database demo đã nạp schema nhóm, hoàn tác thay đổi sau từng ca và xóa tệp tạo thử. Bật cờ để chạy:

```powershell
cd C:\IOT\AIoT\tv5-java
$env:TV5_INTEGRATION_TESTS='true'
.\mvnw.cmd test
```

Các ca kiểm tra gồm JWT và phân quyền, API SQI, bảo vệ dataset đã đóng băng, nhãn chuyên gia, phiên bản SQI mới, ngưỡng AI, cooldown cảnh báo, audit người xử lý, phân trang trên 100 bản ghi và nội dung Excel/PDF tiếng Việt.

`Tv5ArchitectureTest` chạy không cần database: kiểm tra REST/Service/Job/Security không gọi JDBC trực tiếp và frontend ngoài tầng API không chứa `fetch` hoặc URL API. `Tv5IntegrationTest` gồm 7 ca tích hợp và chỉ chạy khi bật cờ trên. Sau khi đổi package, dùng `mvnw.cmd clean test` để loại class cũ.

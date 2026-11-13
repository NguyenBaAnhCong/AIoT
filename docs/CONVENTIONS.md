# Quy ước chung cho cả nhóm

Mọi người tuân theo để ghép code ở tuần 6 không bị lệch. Cần đổi quy ước: nhờ TV1 sửa file này.

## 1. API

- Đường dẫn: `/api/v1/<tài-nguyên-số-nhiều>`, chữ thường, gạch ngang. Ví dụ `/api/v1/sensor-nodes`.
- Phương thức: `GET` đọc, `POST` tạo, `PUT/PATCH` sửa, `DELETE` xóa.
- Phân trang: `?page=1&limit=20` (dùng `parsePaging()` trong `utils/response.js`).
- Thành công: `{ "data": ..., "meta": { "page", "limit", "total" } }` (dùng `ok()`, `created()`).
- Lỗi: `{ "error": { "code", "message", "details?" } }` – ném `AppError`, KHÔNG tự `res.status(...).json` lỗi.

| HTTP | Khi nào | Hàm |
|---|---|---|
| 400 | Dữ liệu gửi lên sai | `AppError.badRequest()` |
| 401 | Chưa đăng nhập | `AppError.unauthorized()` |
| 403 | Thiếu quyền | `AppError.forbidden()` |
| 404 | Không có dữ liệu | `AppError.notFound()` |
| 409 | Trùng / đang được tham chiếu | `AppError.conflict()` |

## 2. Cấu trúc một module backend

```
backend/src/modules/<ten>/
├── <ten>.routes.js       ← khai báo route, gắn requireAuth / requirePermission
├── <ten>.controller.js   ← đọc request, gọi service, trả response
├── <ten>.service.js      ← logic nghiệp vụ
└── <ten>.queries.js      ← câu SQL (viết SQL trực tiếp bằng pg, tham số $1, $2...)
```

Gắn vào `backend/src/routes.js` bằng đúng 1 dòng `api.use('/<ten>', <ten>Routes)`.
Luôn dùng **tham số** (`$1`) trong SQL, không nối chuỗi (tránh SQL injection).

## 3. Database

- Mọi thay đổi cấu trúc là **file migration mới** trong `database/migrations/`, tên `NN_tvX_mo_ta.sql`
  (ví dụ `18_tv3_them_cot_ghi_chu.sql`). **Không sửa** file đã có trong `init/` hay đã chạy.
- Số thứ tự `NN` bắt đầu từ 18 (**18 đã được TV1 dùng** cho `iam.api_keys.label`), báo nhóm trước khi lấy số để không trùng.
- Backend tự áp migration mới mỗi lần khởi động, hoặc chạy tay bằng `npm run migrate`.
- Cột thời gian dùng `timestamptz`; bảng ID dùng `uuid`.

## 4. Git

- Nhánh chính `main` luôn chạy được. Không push trực tiếp lên `main`.
- Nhánh làm việc: `tv<N>/<mô-tả-ngắn>`, ví dụ `tv3/api-lab-results`.
- Gộp bằng Pull Request, **review chéo theo vòng** TV1→TV2→TV3→TV4→TV5→TV6→TV1.
- Commit rõ ràng: `feat(lab): thêm API nhập kết quả`, `fix(iot): sửa lỗi trùng bản tin`.

## 5. Xác thực và phân quyền (TV1 đã làm xong)

- Đăng nhập: `POST /api/v1/auth/login` → `accessToken` (30 phút) + `refreshToken` (7 ngày). Gửi `Authorization: Bearer <accessToken>`.
- Bảo vệ route: `protect('mã.quyền')` từ `middleware/auth.js`. Mã quyền có dạng `<schema>.<read|write>`,
  ngoài ra `laboratory.approve`, `ml.approve`, `ota.deploy`, `iam.admin`. Xem danh sách đầy đủ trong `database/init/16_reference_data.sql`.
- **Không tự viết kiểm tra quyền riêng.** Cần quyền mới thì báo TV1 thêm bằng migration.
- Thiết bị dùng API key (header `X-API-Key`), middleware `requireApiKey('<phạm vi>')`. Phạm vi hợp lệ: `iot.ingest`, `iot.read`, `ml.inference`, `ota.update`.
- Mọi thao tác ghi dùng `withUserTx(req.user.id, ...)`; thao tác ghi và các lần bị từ chối (401/403) tự được ghi vào `audit.access_logs`.

## 6. Frontend

- Mỗi màn hình nằm trong `frontend/src/pages/sNN-ten/index.jsx` (export default một component). Đường dẫn, menu, quyền xem đã khai báo sẵn ở `src/screens.js`, **không sửa file này**; cần thêm đường dẫn con thì dùng `<Routes>` ngay trong màn hình của bạn.
- Gọi API **chỉ qua** `src/lib/api.js`. Tải dữ liệu bằng hook `useApi`. Không tự viết `fetch`.
- Dùng lại component trong `src/components` (PageHeader, Card, Stat, Badge, Button, Field, DataTable, ErrorBox, EmptyState). Màu sắc lấy từ biến CSS trong `styles.css`, không tự đặt màu riêng.
- Văn bản hiển thị bằng tiếng Việt; hiển thị ngày giờ bằng `toLocaleString('vi-VN')`.

## 7. Kiểm thử

Mỗi người viết test cho phần của mình trong `backend/test/<module>.test.js` (dùng `node:test`, mẫu: `backend/test/auth.test.js`).
Chạy `cd backend && npm test`. Test cần database đang chạy và tự áp migration.

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
- Số thứ tự `NN` bắt đầu từ 18, báo nhóm trước khi lấy số để không trùng.
- Cột thời gian dùng `timestamptz`; bảng ID dùng `uuid`.

## 4. Git

- Nhánh chính `main` luôn chạy được. Không push trực tiếp lên `main`.
- Nhánh làm việc: `tv<N>/<mô-tả-ngắn>`, ví dụ `tv3/api-lab-results`.
- Gộp bằng Pull Request, **review chéo theo vòng** TV1→TV2→TV3→TV4→TV5→TV6→TV1.
- Commit rõ ràng: `feat(lab): thêm API nhập kết quả`, `fix(iot): sửa lỗi trùng bản tin`.

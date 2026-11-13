# Edge-AIoT giám sát sức khỏe đất – Biochar

Hệ thống cơ sở dữ liệu + backend + giao diện cho đề tài Edge-AIoT giám sát sức khỏe đất có bón Biochar.
Nhóm 6 thành viên (TV1 là trưởng nhóm). Tài liệu quy ước chung: [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md).

## 1. Yêu cầu

Node.js ≥ 20, Git, Docker Desktop (WSL2), VS Code.

## 2. Chạy lần đầu

```powershell
git clone <địa-chỉ-repo>
cd edge-aiot-biochar
copy .env.example .env          # Windows. macOS/Linux: cp .env.example .env
docker compose up -d db         # chạy PostgreSQL, tự tạo schema + dữ liệu demo
```

Lần đầu Docker tải image PostgreSQL và nạp SQL nên mất khoảng 1–2 phút. Xem tiến độ bằng `docker compose logs -f db`
(đợi dòng `database system is ready to accept connections` xuất hiện lần thứ hai).

Chạy backend khi phát triển (tự khởi động lại khi sửa code):

```powershell
cd backend
npm install
npm run dev
```

Kiểm tra: mở http://localhost:4000/api/v1/health – thấy `"status":"ok"` và `"domain_schemas":16` là đúng.

Hoặc chạy cả database + backend bằng Docker (dùng khi kiểm tra tích hợp, demo):

```powershell
docker compose up -d --build
```

## 3. Các lệnh thường dùng

| Việc | Lệnh |
|---|---|
| Xem log database | `docker compose logs -f db` |
| Mở psql trong container | `docker exec -it biochar-db psql -U biochar -d edge_aiot_biochar` |
| Dừng (giữ dữ liệu) | `docker compose down` |
| **Xóa sạch và nạp lại từ đầu** | `docker compose down -v` rồi `docker compose up -d db` |
| Áp migration mới | `cd backend && npm run migrate` |

> **Quan trọng:** các file trong `database/init/` chỉ chạy **một lần**, khi volume dữ liệu còn trống.
> Sửa file ở đó rồi muốn thấy hiệu lực phải chạy `docker compose down -v`. Vì vậy, **khi database đã có dữ liệu, mọi thay đổi cấu trúc đi qua `database/migrations/`** (xem bên dưới).

## 4. Cấu trúc thư mục

```
├── docker-compose.yml
├── .env.example                 ← sao chép thành .env (không commit .env)
├── database/
│   ├── init/                    ← 00..17: schema, bảng, hàm, view, dữ liệu tham chiếu (chạy 1 lần)
│   ├── seed/99_demo_seed.sql    ← dữ liệu demo (SEED_DEMO=false để bỏ)
│   ├── optional/                ← TimescaleDB (tùy chọn, không chạy mặc định)
│   └── migrations/              ← thay đổi mới: 18_..., 19_... (mỗi người thêm file riêng)
├── backend/
│   └── src/
│       ├── config/              ← env, kết nối DB, withUserTx()
│       ├── middleware/          ← auth (bản tạm), xử lý lỗi
│       ├── modules/<tên>/       ← MỖI TV một thư mục
│       ├── utils/               ← AppError, response, asyncHandler
│       └── routes.js            ← mỗi TV thêm 1 dòng gắn module
├── frontend/                    ← (sẽ thêm ở bước sau)
└── docs/CONVENTIONS.md          ← quy ước API, Git, migration
```

## 5. Ghi dữ liệu và audit

Mọi thao tác **ghi** phải dùng `withUserTx` để audit biết ai đã sửa:

```js
import { withUserTx } from '../../config/db.js';

await withUserTx(req.user.id, async (client) => {
  await client.query('UPDATE farm.plots SET name = $1 WHERE plot_id = $2', [name, id]);
}, { reason: 'Đổi tên ô thí nghiệm' });
```

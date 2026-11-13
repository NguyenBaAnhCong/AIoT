# Edge-AIoT giám sát sức khỏe đất – Biochar

Hệ thống cơ sở dữ liệu + backend + giao diện cho đề tài Edge-AIoT giám sát sức khỏe đất có bón Biochar.
Nhóm 6 thành viên (TV1 là trưởng nhóm). Quy ước chung: [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md).

## 1. Yêu cầu

Node.js ≥ 20, Git, Docker Desktop (WSL2), VS Code.

## 2. Chạy lần đầu

```powershell
git clone <địa-chỉ-repo>
cd <thư-mục-repo>
copy .env.example .env          # Windows. macOS/Linux: cp .env.example .env
docker compose up -d db         # PostgreSQL: tự tạo 16 schema + dữ liệu demo (1–2 phút lần đầu)
```

> **Cổng 5432 bị chiếm?** Nhiều máy Windows đã cài sẵn PostgreSQL riêng. Khi đó backend sẽ báo
> `password authentication failed` vì nối nhầm vào PostgreSQL đó. Cách xử lý: mở `.env`, đổi
> `DB_PORT=5433` và `DATABASE_URL=postgres://biochar:biochar_dev_pw@127.0.0.1:5433/edge_aiot_biochar`,
> lưu file, rồi chạy lại `docker compose up -d db`. **Phải lưu `.env` xuống đĩa**, kiểm tra bằng `type .env`.

Chạy backend và giao diện ở **hai terminal riêng** (cả hai tự tải lại khi sửa code):

```powershell
# Terminal 1 – backend (http://localhost:4000)
cd backend
npm install
npm run dev

# Terminal 2 – giao diện (http://localhost:5173)
cd frontend
npm install
npm run dev
```

Mở http://localhost:5173 và đăng nhập. Backend tự áp migration mới và tự đặt mật khẩu cho user demo (chỉ ngoài production).

| Tài khoản demo | Vai trò | Mật khẩu |
|---|---|---|
| `admin` | ADMIN (toàn quyền) | `Biochar@2026` |
| `researcher01` | RESEARCHER | `Biochar@2026` |
| `labtech01` | LAB_TECH | `Biochar@2026` |

Kiểm tra nhanh backend: http://localhost:4000/api/v1/health → `"status":"ok"`, `"domain_schemas":16`.

**Chạy tất cả bằng Docker** (dùng khi kiểm tra tích hợp, demo): `docker compose up -d --build`, rồi mở http://localhost:8080.

## 3. Lệnh thường dùng

| Việc | Lệnh |
|---|---|
| Xem log database | `docker compose logs -f db` |
| Mở psql trong container | `docker exec -it biochar-db psql -U biochar -d edge_aiot_biochar` |
| Dừng (giữ dữ liệu) | `docker compose down` |
| **Xóa sạch và nạp lại từ đầu** | `docker compose down -v` rồi `docker compose up -d db` |
| Áp migration thủ công | `cd backend && npm run migrate` |
| Chạy test backend | `cd backend && npm test` (cần database đang chạy) |

> Các file trong `database/init/` chỉ chạy **một lần**, khi volume dữ liệu còn trống. Khi database đã có dữ liệu,
> mọi thay đổi cấu trúc đi qua `database/migrations/` (xem `docs/CONVENTIONS.md`).

## 4. Cấu trúc thư mục

```
├── docker-compose.yml           ← db + backend + frontend (+ gateway-simulator của TV2, đang tắt)
├── .env.example                 ← sao chép thành .env (không commit .env)
├── database/
│   ├── init/                    ← 00..17: schema, bảng, hàm, view, dữ liệu tham chiếu (chạy 1 lần)
│   ├── seed/99_demo_seed.sql    ← dữ liệu demo (SEED_DEMO=false để bỏ)
│   ├── optional/                ← TimescaleDB (tùy chọn)
│   └── migrations/              ← thay đổi mới: 18_..., 19_... (mỗi người thêm file riêng)
├── backend/src/
│   ├── config/                  ← env, kết nối DB, withUserTx()
│   ├── middleware/              ← auth (JWT + phân quyền), apiKey, accessLog, lỗi, validate
│   ├── modules/<tên>/           ← MỖI TV một thư mục (auth, api-keys là của TV1)
│   ├── utils/                   ← AppError, response, asyncHandler
│   └── routes.js                ← mỗi TV thêm 1 dòng gắn module
├── frontend/src/
│   ├── screens.js               ← khai báo 14 màn hình (menu, đường dẫn, quyền) – đã đủ, không cần sửa
│   ├── pages/sNN-ten/           ← MỖI TV chỉ sửa thư mục màn hình của mình
│   ├── components/              ← PageHeader, Card, Stat, Badge, DataTable, Layout… dùng chung
│   ├── lib/api.js               ← bộ gọi API (tự gắn token, tự làm mới)
│   └── auth/                    ← đăng nhập, bảo vệ route
├── gateway-simulator/           ← TV2 (xem README bên trong)
└── docs/CONVENTIONS.md          ← quy ước API, module, migration, Git
```

## 5. Dùng xác thực và phân quyền trong code của bạn

**Backend** – bảo vệ route bằng quyền trong `iam.permissions` (ví dụ `farm.read`, `farm.write`, `laboratory.approve`):

```js
import { protect } from '../../middleware/auth.js';

router.get('/plots',  protect('farm.read'),  handler);   // cần đăng nhập + quyền farm.read
router.post('/plots', protect('farm.write'), handler);
// trong handler: req.user = { id, username, fullName, roles, permissions }
```

**Ghi dữ liệu** – luôn dùng `withUserTx` để nhật ký audit biết ai đã sửa:

```js
import { withUserTx } from '../../config/db.js';

await withUserTx(req.user.id, async (client) => {
  await client.query('UPDATE farm.plots SET name = $1 WHERE plot_id = $2', [name, id]);
}, { reason: 'Đổi tên ô thí nghiệm' });
```

**Thiết bị (gateway)** – xác thực bằng API key thay cho đăng nhập: `router.post('/ingest', requireApiKey('iot.ingest'), handler)`.
Tạo key ở màn hình 14. Chi tiết trong `gateway-simulator/README.md`.

**Frontend** – gọi API và kiểm tra quyền:

```jsx
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';

const { data, loading, error, reload } = useApi(() => api.get('/plots'), []);
const { can } = useAuth();      // can('farm.write') -> ẩn/hiện nút
```

# API của TV1 – xác thực, quản trị, nhật ký, danh mục, dashboard

Địa chỉ gốc: `/api/v1`. Trừ khi ghi khác, gửi `Authorization: Bearer <accessToken>`.
Thành công: `{ "data": ..., "meta": { "page", "limit", "total" } }`. Lỗi: `{ "error": { "code", "message", "details?" } }`.
JSON dùng **snake_case** giống tên cột (riêng `/auth` dùng camelCase). Danh sách có phân trang: `?page=1&limit=20`.

## Xác thực (công khai trừ khi ghi khác)
| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| POST | `/auth/login` | công khai (giới hạn 10 lần/15 phút/IP) | `{username, password}` → `accessToken`, `refreshToken`, `user` |
| POST | `/auth/refresh` | công khai | `{refreshToken}` → `accessToken` mới |
| GET | `/auth/me` | đăng nhập | Thông tin, vai trò, quyền của người dùng hiện tại |
| POST | `/auth/change-password` | đăng nhập | `{currentPassword, newPassword}` (≥ 8 ký tự, có chữ và số) |

## Người dùng (`iam.users`)
| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/users?q=&active=&role=` | `iam.read` | Danh sách, kèm vai trò và `last_login_at` |
| GET | `/users/:id` | `iam.read` | Chi tiết, kèm danh sách quyền hiệu lực |
| POST | `/users` | `iam.write` | `{username, email, full_name, password, role_codes[], organization_id?}` |
| PATCH | `/users/:id` | `iam.write` | `{full_name?, email?, organization_id?, role_codes?}` |
| POST | `/users/:id/deactivate` · `/activate` | `iam.write` | Khóa / mở khóa. **Không có DELETE** vì người dùng đã có lịch sử audit |
| POST | `/users/:id/reset-password` | `iam.write` | `{new_password?}`. Bỏ trống thì sinh mật khẩu tạm, trả về một lần |

Quy tắc an toàn (trả `400 SELF_LOCKOUT` hoặc `409 LAST_ADMIN`):
- Không tự khóa tài khoản của mình, không tự đổi vai trò của mình.
- Không khóa hoặc gỡ vai trò ADMIN của quản trị viên cuối cùng đang hoạt động.
- Khóa tài khoản hoặc đổi vai trò có hiệu lực **ngay** (xóa bộ nhớ đệm quyền); token cũ của người bị khóa bị từ chối.

## Vai trò, quyền, tổ chức
| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/roles` · `/roles/:id` | `iam.read` | Danh sách / chi tiết kèm quyền |
| PUT | `/roles/:id/permissions` | `iam.admin` | `{permission_codes[]}` thay toàn bộ quyền của vai trò |
| GET | `/permissions` | `iam.read` | Toàn bộ mã quyền |
| GET / POST / PATCH | `/organizations` | `iam.read` / `iam.write` | Danh sách, tạo, sửa tổ chức |

Quy tắc: vai trò `ADMIN` luôn giữ `iam.admin`, `iam.read`, `iam.write` (`400 PROTECTED_ROLE`); người thực hiện không được tự mất `iam.admin` (`400 SELF_LOCKOUT`, giao dịch bị hủy).

## API key (thiết bị)
| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api-keys` · `/api-keys/scopes` | `iam.read` | Danh sách (không bao giờ có key gốc hay hash) |
| POST | `/api-keys` | `iam.admin` | `{label, scopes[], expiresInDays?}` → key gốc hiển thị **một lần** |
| POST | `/api-keys/:id/revoke` | `iam.admin` | Thu hồi |
| GET | `/gateway/ping` | header `X-API-Key`, phạm vi `iot.ingest` | Kiểm tra key hoạt động |

## Nhật ký (`audit`)
| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/audit/logs?schema=&table=&operation=&actor_id=&record=&from=&to=` | `audit.read` | Ai sửa gì (do trigger ghi) |
| GET | `/audit/logs/:id` | `audit.read` | Chi tiết, có `old_data` / `new_data` |
| GET | `/audit/access-logs?action=&user_id=&api_key_id=&status=&method=&from=&to=` | `audit.read` | Đăng nhập, thao tác ghi, bị từ chối |
| GET | `/audit/summary` | `audit.read` | Số liệu 24 giờ gần nhất |

## Danh mục chung (`ref`)
| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/ref/parameters?category=` · `/ref/parameters/:code` | đăng nhập | Danh mục chỉ tiêu (PH, EC, N, P, K…) |
| POST / PATCH | `/ref/parameters` · `/ref/parameters/:code` | `iam.admin` | Thêm / sửa; kiểm tra `physical_min ≤ physical_max` kể cả khi chỉ sửa một đầu. Không có DELETE vì bảng khác tham chiếu |

## Màn hình 01 và 14
| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/dashboard/summary` | `reporting.read` | 12 KPI nghiệm thu (`acceptance`), danh sách ô (`plots`), `open_alerts` |
| GET | `/system/status` | `iam.read` | Máy chủ, database, số liệu, danh sách migration |

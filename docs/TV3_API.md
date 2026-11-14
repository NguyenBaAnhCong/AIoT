# API TV3 – Farm, thí nghiệm, biochar, phòng thí nghiệm

Viết lại bằng Node.js + Express theo khung của TV1 (thay bản Spring Boot ở nhánh `tv3`), dùng đúng tên bảng và cột trong `database/init/02_farm.sql`, `03_biochar.sql`, `04_experiment.sql`, `07_laboratory.sql`. Không thêm migration.

Code nằm trong `backend/src/modules/`:

| Thư mục | Gắn tại | Quyền |
|---|---|---|
| `farm/` | `/api/v1/farm` | `farm.read` / `farm.write` |
| `experiment/` | `/api/v1/experiment` | `experiment.read` / `experiment.write` |
| `biochar/` | `/api/v1/biochar` | `biochar.read` / `biochar.write` |
| `laboratory/` | `/api/v1/laboratory` | `laboratory.read` / `laboratory.write`, duyệt cần `laboratory.approve` |
| `tv3-common/crud.js` | – | Khung CRUD dùng chung cho 4 module trên |

Mỗi tài nguyên có đủ 5 thao tác: `GET` danh sách (`?page=&limit=` + bộ lọc), `GET /:id`, `POST`, `PATCH /:id` (`PUT` dùng như `PATCH`), `DELETE /:id`. Định dạng phản hồi và mã lỗi theo `docs/CONVENTIONS.md`. Cột ngày (`DATE`) trả về dạng `YYYY-MM-DD`.

## Đường dẫn

| Đường dẫn | Bộ lọc | Ghi chú |
|---|---|---|
| `/farm/sites` | `q`, `province` | Kèm số ô |
| `/farm/plots` | `site_id`, `site_code`, `status`, `q` | Kèm nghiệm thức đang áp dụng (màn hình 02, 05) |
| `/farm/crops` | `q` | |
| `/farm/crop-seasons` | `plot_id`, `plot_code`, `crop_id` | |
| `/experiment/experiments` | `site_id`, `status`, `q` | Kèm số nghiệm thức, số ô |
| `GET /experiment/experiments/:id/summary` | | Thí nghiệm + bảng so sánh nghiệm thức (màn hình 05) |
| `/experiment/treatments` | `experiment_id`, `experiment_code`, `control_flag` | |
| `/experiment/treatment-applications` | `plot_id`, `plot_code`, `treatment_id`, `experiment_id`, `active` | Áp dụng nghiệm thức lên ô |
| `/experiment/growth-stages` | `crop_id` | Danh mục giai đoạn sinh trưởng |
| `/experiment/plot-growth-stages` | `crop_season_id`, `plot_id` | Giai đoạn thực tế của mùa vụ |
| `/biochar/feedstock-batches` | `feedstock_type`, `q` | Kèm khối lượng đã đưa vào lò |
| `/biochar/batches` | `feedstock_batch_id`, `safety_status`, `q` | `yield_pct` do database tự tính |
| `GET /biochar/batches/:id/trace` | | Phụ phẩm → biochar → làm giàu → nghiệm thức → ô (màn hình 06) |
| `/biochar/enrichment-batches` | `biochar_batch_id`, `enrichment_type` | |
| `GET /biochar/enrichment-batches/:id/trace` | | Truy ngược từ lô làm giàu |
| `/biochar/enrichment-results` | `enrichment_batch_id`, `parameter_code` | |
| `/laboratory/methods` | `parameter_code` | |
| `/laboratory/samples` | `plot_id`, `plot_code`, `status`, `sample_type`, `from`, `to`, `q` | Kèm số kết quả theo trạng thái |
| `/laboratory/results` | `sample_id`, `plot_id`, `plot_code`, `parameter_code`, `method_id`, `status` | |
| `POST /laboratory/results/:id/verify` | | DRAFT → VERIFIED (`laboratory.write`) |
| `POST /laboratory/results/:id/approve` | | VERIFIED → APPROVED (`laboratory.approve`) |
| `POST /laboratory/results/:id/reject` | body `{ "reason" }` | DRAFT/VERIFIED → REJECTED (`laboratory.approve`) |
| `POST /laboratory/results/bulk/:action` | body `{ "ids": [...], "reason"? }` | verify/approve/reject nhiều kết quả; một lỗi thì hủy cả lô |
| `GET /laboratory/sensor-vs-lab` | `plot_id`, `plot_code`, `parameter_code`, `from`, `to` | Đối chiếu cảm biến với lab, kèm `summary` sai lệch theo chỉ tiêu (màn hình 07) |

## Quy tắc nghiệp vụ

**Farm**
- Một ô không có hai mùa vụ chồng thời gian; ngày thu hoạch không trước ngày trồng.
- Ô đang có nghiệm thức hiệu lực thì không chuyển sang `RETIRED` / `INACTIVE`.

**Thí nghiệm**
- Vòng đời: `PLANNED → RUNNING → COMPLETED`, hoặc chuyển sang `CANCELLED`; không đi lùi. `COMPLETED` phải có ngày kết thúc.
- Nghiệm thức đối chứng: liều biochar bằng 0, không gắn lô biochar. Nghiệm thức có liều biochar phải chỉ rõ lô biochar hoặc lô làm giàu, để truy xuất được nguồn gốc.
- Không dùng lô biochar có `safety_status = FAILED`.
- Áp dụng nghiệm thức:
  - Ô phải thuộc khu của thí nghiệm, và đang ở trạng thái `ACTIVE`.
  - Thí nghiệm chưa kết thúc.
  - Mùa vụ (nếu có) phải thuộc ô đó.
  - **Một ô tại một thời điểm chỉ có một nghiệm thức**, để dữ liệu cảm biến được gán đúng nghiệm thức.
  - `effective_from` mặc định là 0h ngày bón; người bón mặc định là người đang đăng nhập.

**Biochar**
- Khối lượng ra không lớn hơn khối lượng vào. Tổng khối lượng đưa vào lò không vượt khối lượng của lô phụ phẩm.
- Ngày nhiệt phân không trước ngày thu gom phụ phẩm. Ngày làm giàu không trước ngày sản xuất biochar.
- Muốn kết luận `PASSED` phải có kết quả kim loại nặng. Lô `FAILED` không được làm giàu.
- Làm giàu vi sinh phải ghi chủng vi sinh; làm giàu dinh dưỡng phải ghi công thức.

**Phòng thí nghiệm**
- Kết quả mới luôn ở `DRAFT`; chỉ sửa hoặc xóa được khi còn `DRAFT`.
- Phương pháp phải đúng chỉ tiêu. Nếu không gửi đơn vị, lấy đơn vị của phương pháp. Giá trị dưới giới hạn phát hiện thì tự đánh dấu `below_lod`.
- **Nguyên tắc 4 mắt:** người phân tích không tự duyệt kết quả của mình (trừ ADMIN). Loại kết quả phải ghi lý do; lý do được ghi vào audit.
- Mẫu tự chuyển `ANALYZING` khi có kết quả, và `COMPLETED` khi mọi kết quả đã chốt. Mẫu đã có kết quả thì không xóa được; mẫu bị loại thì không nhập thêm kết quả.

## Kiểm thử

`backend/test/tv3.test.js` có 5 nhóm test: đọc dữ liệu, kiểm tra đầu vào, quy tắc ô/nghiệm thức, quy tắc biochar, luồng duyệt lab. Chạy bằng `cd backend && npm test`. Dữ liệu test tự xóa sau khi chạy.

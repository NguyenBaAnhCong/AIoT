# Tiến độ TV5

## Phần đã hoàn thành

| Hạng mục | Kết quả |
| --- | --- |
| 04 Sức khỏe đất | Lọc theo ô và thời gian, xem điểm và chỉ tiêu, so sánh nghiệm thức, tạo và kích hoạt cấu hình SQI. |
| 12 Cảnh báo và quyết định | Xem bằng chứng, xác nhận và giải quyết cảnh báo, xử lý khuyến nghị và quản lý luật. |
| 13 Báo cáo | Tạo và tải PDF hoặc Excel cho báo cáo kỹ thuật, kinh tế và môi trường. |
| Tác vụ định kỳ | Có job tính SQI và đánh giá cảnh báo. Có chế độ chạy thử hoàn tác thay đổi để trình bày kết quả trên dữ liệu demo. |

## Kết quả kiểm tra trên PostgreSQL demo

- Kiểm tra tự động đọc được lịch sử ô P01 gồm 45 điểm, chi tiết 8 chỉ tiêu và so sánh 3 nghiệm thức.
- API trả về 5 cảnh báo và 7 luật. Màn hình báo cáo đọc được 1 thí nghiệm để tạo tệp.
- Chạy thử tính lại được 135 điểm SQI. Đánh giá tại 14:00 ngày 21/08/2026 tạo thử 1 cảnh báo pH. Đã xác minh dữ liệu điểm, cảnh báo và khuyến nghị được hoàn tác.
- Đã kiểm tra tải báo cáo kinh tế và môi trường dạng XLSX, báo cáo kỹ thuật dạng PDF trên database thử nghiệm. Lệnh `check` kiểm tra API đọc và không tạo tệp mới.

## Nội dung cần phối hợp

| Thành viên | Đầu vào cần chốt | Tiêu chí kiểm tra chung |
| --- | --- | --- |
| TV1 | Vị trí module, định tuyến và tài khoản đăng nhập | Ba màn hình mở từ app chung. Người xử lý cảnh báo và người tạo báo cáo lấy từ phiên đăng nhập. |
| TV3 | Mùa vụ và nghiệm thức dùng trong báo cáo | Dữ liệu và bộ lọc khớp với thí nghiệm của nhóm. |
| TV4 | UUID dataset `BUILT` và thời điểm đóng băng | Job tính điểm và gán nhãn chạy trước bước freeze. |
| TV6 | Kết quả suy luận mẫu cho cảnh báo AI | Cảnh báo ML hiển thị bằng chứng từ dữ liệu suy luận của nhóm. |

Nếu nhóm chọn Telegram, cần cấu hình bot và thử gửi trong chat thử nghiệm. Tích hợp repo chung và gửi Telegram thực tế chưa được xác minh.

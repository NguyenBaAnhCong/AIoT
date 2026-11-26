# TV5

Backend SQI, cảnh báo và báo cáo dùng **Java Spring Boot**, tại [tv5-java](../tv5-java/README.md). Giao diện dùng **JavaScript thuần**, trong `tv5-java/src/main/resources/static/tv5/assets/js/`, gồm ba trang `/tv5/sqi`, `/tv5/alerts`, `/tv5/reports`.

Thư mục này giữ tài liệu tiến độ, bản lưu migration và các tệp báo cáo trong `.reports/`. Bản chạy hiện tại nằm trong `tv5-java/`, mở từ menu ứng dụng nhóm. Hai migration TV5 dùng chung nằm trong `database/migrations/`. Các tệp báo cáo cũng có thể lưu ở thư mục `TV5_REPORT_DIR`.

Xem [README Java](../tv5-java/README.md) để chạy, cấu hình database, job và kiểm thử.

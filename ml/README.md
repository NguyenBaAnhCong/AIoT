# ml/ – Embedded ML (TV6)

Phần việc của TV6: huấn luyện mô hình, chuyển TFLite để chạy trên Edge Gateway, API model registry.

| Bước | Ở đâu | Kết quả |
|---|---|---|
| 1. Huấn luyện | [`01_train_models.ipynb`](01_train_models.ipynb) | Mô hình scikit-learn, version `1.1.0` |
| 2. Chuyển TFLite | [`02_convert_tflite.ipynb`](02_convert_tflite.ipynb), [`edge/edge_runtime.py`](edge/edge_runtime.py) | File `.tflite` + code chạy trên gateway, version `1.2.0` |
| 3. API model registry | [`backend/src/modules/ml/`](../backend/src/modules/ml/) | `/api/v1/ml/...` (xem mục API bên dưới) |

Hai notebook đã chạy sẵn kết quả, GitHub hiển thị luôn, không cần chạy lại.

| Mô hình | `model_code` | Thuật toán | File chạy trên gateway |
|---|---|---|---|
| Phân loại sức khỏe đất | `SOIL-HEALTH-CLS` | Logistic Regression (7 chỉ số cảm biến) | `soil_health_cls.tflite` (INT8, ~2,6 KB) |
| Phát hiện bất thường cảm biến | `SENSOR-ANOMALY` | Robust z-score (MAD), so với trung vị 8 bản tin trước | `sensor_anomaly.tflite` (FP32, ~1,3 KB) |

Trên tập test, cả hai đều đạt toàn bộ tiêu chí nghiệm thu, và bản TFLite cho kết quả giống hệt bản gốc. **Lưu ý:** dữ liệu demo là giả lập và rất dễ, xem phần *Kết luận* của notebook 1 trước khi trình bày.

## Cấu trúc

```
ml/
├── 01_train_models.ipynb     bước 1: huấn luyện + đánh giá
├── 02_convert_tflite.ipynb   bước 2: chuyển TFLite, kiểm tra bằng code gateway, đo độ trễ
├── edge/edge_runtime.py      code chạy 2 mô hình trên gateway (TV2 dùng khi tích hợp)
├── export_data.mjs           xuất dữ liệu từ PostgreSQL của nhóm ra data/*.csv
├── queries/*.sql             câu SQL lấy dữ liệu (dùng chung cho export và notebook)
├── data/*.csv                dữ liệu đã xuất từ database demo
├── models/
│   ├── *.joblib              mô hình scikit-learn (bước 1)
│   ├── *.tflite              mô hình TFLite (bước 2) – file sẽ gửi xuống gateway qua OTA
│   └── *.json                mô tả đầu vào/đầu ra, ngưỡng, tham số MAD
└── output/
    ├── metrics.json, metrics_tflite.json
    ├── register_models.sql   đăng ký version 1.1.0 (SKLEARN) + metrics
    └── register_tflite.sql   đăng ký version 1.2.0 (TFLITE) + metrics
```

## API model registry (`/api/v1/ml`)

Code nằm ở `backend/src/modules/ml/`, theo đúng quy ước trong `docs/CONVENTIONS.md`. Quyền dùng là `ml.read`, `ml.write` và `ml.approve`.

| Phương thức | Đường dẫn | Việc |
|---|---|---|
| GET | `/ml/models` | Danh sách model (`?task_type=&page=&limit=`), kèm version mới nhất và version đang chạy |
| POST | `/ml/models` | Tạo model mới |
| GET | `/ml/models/:modelCode` | Chi tiết model + các version + đối chiếu ngưỡng |
| POST | `/ml/models/:modelCode/versions` | Đăng ký version mới, gửi kèm `metrics` được |
| GET | `/ml/model-versions/:id` | Chi tiết version, metrics, gateway đang chạy version này |
| PUT | `/ml/model-versions/:id/metrics` | Thêm/cập nhật metrics (upsert) |
| POST | `/ml/model-versions/:id/approve` | Duyệt. Trả **422 `ACCEPTANCE_NOT_MET`** nếu chưa đạt ngưỡng |
| PATCH | `/ml/model-versions/:id/status` | Đổi trạng thái tay: `VALIDATING`, `REJECTED`, `RETIRED` |
| GET | `/ml/acceptance` | Bảng tiêu chí nghiệm thu của mọi version (cho màn hình 10) |
| GET | `/ml/inference-results` | Kết quả suy luận (`?model_code=&plot_code=&gateway_code=&from=&to=&anomaly=`) |
| GET | `/ml/inference-results/daily` | Thống kê theo ngày: số lần suy luận, số bất thường, độ trễ (mặc định 7 ngày) |
| POST | `/ml/inference-results` | Gateway gửi lô kết quả, tối đa 1000 bản ghi. Lô có bản ghi sai thì hủy cả lô |

Quy tắc trạng thái của model version:
- Chỉ chuyển sang `APPROVED` qua `/approve`, và phải đạt ngưỡng nghiệm thu.
- Trạng thái `DEPLOYED` do OTA đặt (TV6, bước 4), không đổi tay được.
- Không thể chuyển sang `RETIRED` hoặc `REJECTED` khi version đang chạy trên gateway.

Ví dụ gateway gửi kết quả. Định dạng này khớp với đầu ra của `edge_runtime.py`; gateway chỉ cần biết mã gateway và mã node:

```json
POST /api/v1/ml/inference-results
{ "results": [
  { "model_version_id": "<uuid>", "gateway_code": "GW01", "node_code": "N01",
    "inferred_at": "2026-11-13T08:00:05+07:00", "predicted_label": "FAIR", "confidence": 0.9961,
    "prediction": { "class": "FAIR" }, "latency_ms": 0.121 } ] }
```

## Chạy mô hình trên gateway

`edge_runtime.py` chỉ cần `numpy` và một trình chạy TFLite. Trên Raspberry Pi nên dùng `ai-edge-litert`, nhẹ hơn nhiều so với TensorFlow.

```bash
pip install numpy ai-edge-litert
```
```bash
python ml/edge/edge_runtime.py ml/models ml/data/readings.csv --limit 5
```

```python
from edge_runtime import EdgeModels
models = EdgeModels('ml/models')
out = models.infer({'sensor_code': 'S01', 'ph': 5.1, 'ec': 0.4, 'soil_moisture': 27,
                    'soil_temperature': 26, 'n': 60, 'p': 25, 'k': 140})
# out['anomaly'] -> anomaly_score, is_anomaly ; out['health'] -> predicted_label, confidence
```

- Gateway phải gọi `infer()` **lần lượt từng bản tin, theo thứ tự thời gian của từng cảm biến**, vì mô hình bất thường cần nhớ 8 bản tin trước.
- Nếu bản tin bị đánh giá là bất thường, phần phân loại sức khỏe đất của bản tin đó sẽ để trống.

## Chạy lại các notebook

1. **Lấy dữ liệu.** Chạy database bằng `docker compose up -d db`, chạy `npm install` trong `backend` một lần, rồi chạy:
   ```bash
   node ml/export_data.mjs
   ```
   Script đọc `DATABASE_URL` từ file `.env`. Cách khác: cài `psycopg` và đặt `DATABASE_URL`, khi đó notebook đọc thẳng database.
2. **Môi trường Python.**
   - Notebook 1 cần `pandas`, `numpy`, `scikit-learn`, `matplotlib`, `joblib`, `jupyter`.
   - Notebook 2 cần thêm **TensorFlow ≥ 2.16**.
   - Trên Windows, cài TensorFlow vào venv ở **đường dẫn ngắn**. Python bản Microsoft Store nằm trong thư mục có đường dẫn dài nên vượt giới hạn 260 ký tự.
   ```bash
   python -m venv C:\Users\<tên>\.tfenv
   ```
   ```bash
   C:\Users\<tên>\.tfenv\Scripts\pip install tensorflow scikit-learn pandas matplotlib joblib jupyter
   ```
3. **Ghi model và metrics vào database.** Cả hai file chạy lại nhiều lần vẫn an toàn. Đây là dữ liệu chứ không phải thay đổi cấu trúc, nên không cần migration.
   ```bash
   docker exec -i biochar-db psql -U biochar -d edge_aiot_biochar < ml/output/register_models.sql
   ```
   ```bash
   docker exec -i biochar-db psql -U biochar -d edge_aiot_biochar < ml/output/register_tflite.sql
   ```
   Cách khác: đăng ký qua API `POST /api/v1/ml/models/:modelCode/versions`.

## Lưu ý

- Metrics của version `1.0.0` / `0.3.0` trong `database/seed/99_demo_seed.sql` là **số gõ tay** để có dữ liệu mẫu. Metrics thật là của version `1.1.0` và `1.2.0`.
- Độ trễ đo trên máy tính chưa tới 1 ms mỗi mẫu. Khi có bộ giả lập gateway (TV2) hoặc Raspberry Pi, chạy lại trên đó và ghi metric với `environment = 'EDGE'`.
- TFLite trên Windows không mở được file khi đường dẫn có ký tự tiếng Việt. `edge_runtime.py` đã xử lý bằng cách tự đọc nội dung file rồi đưa vào TFLite.

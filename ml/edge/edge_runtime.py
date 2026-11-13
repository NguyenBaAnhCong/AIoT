"""Chạy 2 mô hình TFLite tại Edge Gateway (TV6 - bước 2).

Dùng chung cho bộ giả lập gateway của TV2 và cho notebook 02 kiểm tra kết quả.
Chỉ cần numpy + một trình chạy TFLite (thử lần lượt: ai-edge-litert, tflite-runtime, tensorflow).

    from edge_runtime import EdgeModels
    models = EdgeModels('ml/models')                      # thư mục chứa *.tflite + *.json
    out = models.infer({'sensor_code': 'S01', 'ph': 5.1, 'ec': 0.4, 'soil_moisture': 27,
                        'soil_temperature': 26, 'n': 60, 'p': 25, 'k': 140})
    # -> {'health': {...}, 'anomaly': {...}}  (khớp cột của ml.inference_results)

Chạy thử từ dòng lệnh trên file CSV bản tin (in mỗi dòng 1 JSON):
    python ml/edge/edge_runtime.py ml/models ml/data/readings.csv --limit 5
"""
import json
import sys
import time
from collections import defaultdict, deque
from pathlib import Path

import numpy as np


def _interpreter(path):
    try:
        from ai_edge_litert.interpreter import Interpreter
    except ImportError:
        try:
            from tflite_runtime.interpreter import Interpreter
        except ImportError:
            import tensorflow as tf
            Interpreter = tf.lite.Interpreter
    # Đọc bằng Python rồi truyền nội dung: TFLite trên Windows không mở được đường dẫn có ký tự Unicode
    it = Interpreter(model_content=Path(path).read_bytes())
    it.allocate_tensors()
    return it


class _TFLiteModel:
    def __init__(self, model_dir, name):
        model_dir = Path(model_dir)
        self.spec = json.loads((model_dir / f'{name}.json').read_text(encoding='utf-8'))
        self.it = _interpreter(model_dir / f'{name}.tflite')
        self.inp = self.it.get_input_details()[0]
        self.outs = self.it.get_output_details()

    def run(self, x):
        x = np.asarray(x, dtype=np.float32).reshape(self.inp['shape'])
        if self.inp['dtype'] == np.int8:                       # model nhận input int8
            scale, zero = self.inp['quantization']
            x = np.clip(np.round(x / scale + zero), -128, 127).astype(np.int8)
        self.it.set_tensor(self.inp['index'], x)
        self.it.invoke()
        out = self.it.get_tensor(self.outs[0]['index'])
        if self.outs[0]['dtype'] == np.int8:
            scale, zero = self.outs[0]['quantization']
            out = (out.astype(np.float32) - zero) * scale
        return out.reshape(-1)


class SoilHealthModel(_TFLiteModel):
    """Phân loại sức khỏe đất từ 1 bản tin."""

    def __init__(self, model_dir):
        super().__init__(model_dir, 'soil_health_cls')
        self.features = self.spec['features']
        self.classes = self.spec['classes']

    def predict(self, reading):
        proba = self.run([reading[f] for f in self.features])
        i = int(np.argmax(proba))
        return {'task_type': 'CLASSIFICATION', 'predicted_label': self.classes[i],
                'confidence': round(float(proba[i]), 4),
                'prediction': {'class': self.classes[i],
                               'proba': {c: round(float(p), 4) for c, p in zip(self.classes, proba)}}}


class SensorAnomalyModel(_TFLiteModel):
    """Phát hiện bất thường: so bản tin với trung vị N bản tin trước của cùng cảm biến."""

    def __init__(self, model_dir):
        super().__init__(model_dir, 'sensor_anomaly')
        self.features = self.spec['features']
        self.threshold = float(self.spec['threshold'])
        self.window = int(self.spec['history_window'])
        self.history = defaultdict(lambda: {f: deque(maxlen=self.window) for f in self.features})

    def predict(self, reading):
        hist = self.history[reading['sensor_code']]
        dev = []
        for f in self.features:
            h = hist[f]
            dev.append(abs(reading[f] - float(np.median(h))) if h else 0.0)
            h.append(reading[f])                               # lưu cả bản tin lỗi, giống lúc huấn luyện
        score = float(self.run(dev)[0])
        return {'task_type': 'ANOMALY_DETECTION', 'anomaly_score': round(score, 4),
                'is_anomaly': score >= self.threshold,
                'prediction': {'anomaly': score >= self.threshold,
                               'deviation': {f: round(d, 4) for f, d in zip(self.features, dev)}}}


class EdgeModels:
    def __init__(self, model_dir):
        self.health = SoilHealthModel(model_dir)
        self.anomaly = SensorAnomalyModel(model_dir)

    def infer(self, reading):
        out = {}
        for key, model in (('anomaly', self.anomaly), ('health', self.health)):
            if key == 'health' and out['anomaly']['is_anomaly']:
                # Bản tin lỗi thì không đánh giá sức khỏe đất, tránh kết luận sai từ số đo sai
                out[key] = {'task_type': 'CLASSIFICATION', 'predicted_label': None, 'confidence': None,
                            'prediction': {'skipped': 'bản tin bất thường'}, 'latency_ms': 0.0}
                continue
            t0 = time.perf_counter()
            res = model.predict(reading)
            res['latency_ms'] = round((time.perf_counter() - t0) * 1000, 3)
            out[key] = res
        return out


if __name__ == '__main__':
    import csv
    import argparse

    ap = argparse.ArgumentParser(description='Chạy 2 mô hình TFLite trên file CSV bản tin cảm biến')
    ap.add_argument('model_dir')
    ap.add_argument('csv')
    ap.add_argument('--limit', type=int, default=10)
    a = ap.parse_args()
    models = EdgeModels(a.model_dir)
    num = set(models.health.features) | set(models.anomaly.features)
    with open(a.csv, encoding='utf-8') as fh:
        for i, row in enumerate(csv.DictReader(fh)):
            if i >= a.limit:
                break
            reading = {k: (float(v) if k in num else v) for k, v in row.items()}
            print(json.dumps({'sensor_code': row['sensor_code'], 'measured_at': row['measured_at'],
                              **models.infer(reading)}, ensure_ascii=False))
    sys.exit(0)

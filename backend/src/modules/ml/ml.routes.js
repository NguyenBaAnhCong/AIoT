// Module ml (TV6) – gắn tại /api/v1/ml
//
//   GET    /ml/models                          danh sách model (?task_type=&page=&limit=)
//   POST   /ml/models                          tạo model
//   GET    /ml/models/:modelCode               chi tiết model + các version
//   POST   /ml/models/:modelCode/versions      đăng ký version mới (kèm metrics)
//   GET    /ml/model-versions/:id              chi tiết version + metrics + đối chiếu ngưỡng
//   PUT    /ml/model-versions/:id/metrics      thêm/cập nhật metrics
//   POST   /ml/model-versions/:id/approve      duyệt (chỉ khi đạt tiêu chí nghiệm thu)
//   PATCH  /ml/model-versions/:id/status       đổi trạng thái tay (VALIDATING, REJECTED, RETIRED)
//   GET    /ml/acceptance                      bảng tiêu chí nghiệm thu của mọi version
//   GET    /ml/inference-results               kết quả suy luận (?model_code=&plot_code=&gateway_code=&from=&to=&anomaly=)
//   GET    /ml/inference-results/daily         thống kê theo ngày (?from=&to=, mặc định 7 ngày)
//   POST   /ml/inference-results               gateway gửi lô kết quả suy luận (tối đa 1000)
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as c from './ml.controller.js';

const router = Router();
const read = requirePermission('ml.read');
const write = requirePermission('ml.write');

router.use(requireAuth);

router.get('/models', read, asyncHandler(c.listModels));
router.post('/models', write, asyncHandler(c.createModel));
router.get('/models/:modelCode', read, asyncHandler(c.getModel));
router.post('/models/:modelCode/versions', write, asyncHandler(c.createVersion));

router.get('/model-versions/:id', read, asyncHandler(c.getVersion));
router.put('/model-versions/:id/metrics', write, asyncHandler(c.putMetrics));
router.post('/model-versions/:id/approve', requirePermission('ml.approve'), asyncHandler(c.approveVersion));
router.patch('/model-versions/:id/status', write, asyncHandler(c.changeVersionStatus));

router.get('/acceptance', read, asyncHandler(c.acceptance));

router.get('/inference-results', read, asyncHandler(c.listInference));
router.get('/inference-results/daily', read, asyncHandler(c.inferenceDaily));
router.post('/inference-results', write, asyncHandler(c.createInferenceBatch));

export default router;

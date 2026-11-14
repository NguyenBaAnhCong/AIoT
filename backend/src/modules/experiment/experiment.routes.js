// Module experiment (TV3) – gắn tại /api/v1/experiment. Quyền: experiment.read / experiment.write
//
//   /experiment/experiments               thí nghiệm        (?site_id=&status=&q=)
//   /experiment/experiments/:id/summary   thí nghiệm + bảng so sánh nghiệm thức (màn hình 05)
//   /experiment/treatments                nghiệm thức       (?experiment_id=&experiment_code=&control_flag=)
//   /experiment/treatment-applications    áp dụng nghiệm thức lên ô (?plot_id=&plot_code=&treatment_id=&experiment_id=&active=)
//   /experiment/growth-stages             danh mục giai đoạn sinh trưởng (?crop_id=)
//   /experiment/plot-growth-stages        giai đoạn thực tế của từng mùa vụ (?crop_season_id=&plot_id=)
//
// Mỗi đường dẫn có đủ GET danh sách, GET /:id, POST, PATCH(PUT) /:id, DELETE /:id.
import { Router, mountCrud, protect, asyncHandler, ok } from '../tv3-common/crud.js';
import * as S from './experiment.service.js';

const router = Router();
router.get('/experiments/:id/summary', protect('experiment.read'),
  asyncHandler(async (req, res) => ok(res, await S.experimentSummary(req.params.id))));
mountCrud(router, '/experiments', S.experiments, 'experiment');
mountCrud(router, '/treatments', S.treatments, 'experiment');
mountCrud(router, '/treatment-applications', S.applications, 'experiment');
mountCrud(router, '/growth-stages', S.growthStages, 'experiment');
mountCrud(router, '/plot-growth-stages', S.plotGrowthStages, 'experiment');

export default router;

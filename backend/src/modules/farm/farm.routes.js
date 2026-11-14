// Module farm (TV3) – gắn tại /api/v1/farm. Quyền: farm.read / farm.write
//
//   /farm/sites          khu thí nghiệm   (?q=&province=)
//   /farm/plots          ô thí nghiệm     (?site_id=&site_code=&status=&q=) – kèm nghiệm thức đang áp dụng
//   /farm/crops          cây trồng        (?q=)
//   /farm/crop-seasons   mùa vụ           (?plot_id=&plot_code=&crop_id=)
//
// Mỗi đường dẫn có đủ GET danh sách, GET /:id, POST, PATCH(PUT) /:id, DELETE /:id.
import { Router, mountCrud } from '../tv3-common/crud.js';
import * as S from './farm.service.js';

const router = Router();
mountCrud(router, '/sites', S.sites, 'farm');
mountCrud(router, '/plots', S.plots, 'farm');
mountCrud(router, '/crops', S.crops, 'farm');
mountCrud(router, '/crop-seasons', S.cropSeasons, 'farm');

export default router;

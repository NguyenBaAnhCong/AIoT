// Module biochar (TV3) – gắn tại /api/v1/biochar. Quyền: biochar.read / biochar.write
//
//   /biochar/feedstock-batches            lô phụ phẩm vải (?feedstock_type=&q=) – kèm khối lượng đã dùng
//   /biochar/batches                      lô biochar      (?feedstock_batch_id=&safety_status=&q=)
//   /biochar/batches/:id/trace            truy xuất: phụ phẩm -> biochar -> làm giàu -> nghiệm thức -> ô
//   /biochar/enrichment-batches           lô làm giàu     (?biochar_batch_id=&enrichment_type=)
//   /biochar/enrichment-batches/:id/trace truy ngược toàn chuỗi từ lô làm giàu
//   /biochar/enrichment-results           kết quả đo của lô làm giàu (?enrichment_batch_id=&parameter_code=)
//
// Mỗi đường dẫn có đủ GET danh sách, GET /:id, POST, PATCH(PUT) /:id, DELETE /:id.
import { Router, mountCrud, protect, asyncHandler, ok } from '../tv3-common/crud.js';
import * as S from './biochar.service.js';

const router = Router();
const read = protect('biochar.read');
router.get('/batches/:id/trace', read, asyncHandler(async (req, res) => ok(res, await S.traceFromBiochar(req.params.id))));
router.get('/enrichment-batches/:id/trace', read,
  asyncHandler(async (req, res) => ok(res, await S.traceFromEnrichment(req.params.id))));
mountCrud(router, '/feedstock-batches', S.feedstock, 'biochar');
mountCrud(router, '/batches', S.biochar, 'biochar');
mountCrud(router, '/enrichment-batches', S.enrichment, 'biochar');
mountCrud(router, '/enrichment-results', S.enrichmentResults, 'biochar');

export default router;

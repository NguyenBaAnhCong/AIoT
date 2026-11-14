// Module laboratory (TV3) – gắn tại /api/v1/laboratory.
// Quyền: laboratory.read / laboratory.write; duyệt và loại kết quả cần laboratory.approve.
//
//   /laboratory/methods                 phương pháp phân tích (?parameter_code=)
//   /laboratory/samples                 mẫu đất / dung dịch   (?plot_id=&plot_code=&status=&sample_type=&from=&to=&q=)
//   /laboratory/results                 kết quả phân tích     (?sample_id=&plot_id=&plot_code=&parameter_code=&method_id=&status=)
//   POST /laboratory/results/:id/verify    DRAFT -> VERIFIED       (laboratory.write)
//   POST /laboratory/results/:id/approve   VERIFIED -> APPROVED    (laboratory.approve)
//   POST /laboratory/results/:id/reject    DRAFT|VERIFIED -> REJECTED, body { reason } (laboratory.approve)
//   POST /laboratory/results/bulk/:action  { ids: [...] } verify|approve|reject nhiều kết quả một lần
//   GET  /laboratory/sensor-vs-lab         đối chiếu cảm biến với lab + tổng hợp sai lệch (màn hình 07)
//   GET  /laboratory/results/import-template   tải file Excel mẫu
//   POST /laboratory/results/import            { file_base64, dry_run } nhập Excel, báo lỗi từng dòng (laboratory.write)
//
// Mỗi tài nguyên có đủ GET danh sách, GET /:id, POST, PATCH(PUT) /:id, DELETE /:id.
import { Router, mountCrud, protect, asyncHandler, ok, AppError } from '../tv3-common/crud.js';
import * as S from './laboratory.service.js';
import { buildTemplate, importResults } from './laboratory.import.js';

const router = Router();
const PERM = { verify: 'laboratory.write', approve: 'laboratory.approve', reject: 'laboratory.approve' };

router.get('/sensor-vs-lab', protect('laboratory.read'), asyncHandler(async (req, res) => {
  const { rows, meta, summary } = await S.sensorVsLab(req.query);
  res.json({ data: rows, meta, summary });
}));

router.post('/results/bulk/:action', protect('laboratory.write', 'laboratory.approve'), asyncHandler(async (req, res) => {
  const { action } = req.params;
  if (!PERM[action]) throw AppError.notFound(`Không có thao tác ${action}`);
  if (!req.user.permissions.includes(PERM[action])) throw AppError.forbidden(`Thiếu quyền: ${PERM[action]}`);
  ok(res, await S.bulkChangeStatus(req.body?.ids, action, req.user, { reason: req.body?.reason }));
}));

// Nhập Excel: tải file mẫu, rồi gửi { file_base64, dry_run } (dry_run mặc định true = chỉ kiểm tra)
router.get('/results/import-template', protect('laboratory.read'), asyncHandler(async (req, res) => {
  const buf = await buildTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="mau_nhap_ket_qua_lab.xlsx"');
  res.send(Buffer.from(buf));
}));
router.post('/results/import', protect('laboratory.write'), asyncHandler(async (req, res) => {
  const dryRun = req.body?.dry_run !== false;
  const report = await importResults(req.body?.file_base64, req.user, { dryRun });
  res.status(report.inserted ? 201 : 200).json({ data: report });
}));

for (const action of Object.keys(PERM)) {
  router.post(`/results/:id/${action}`, protect(PERM[action]), asyncHandler(async (req, res) =>
    ok(res, await S.changeResultStatus(req.params.id, action, req.user, { reason: req.body?.reason }))));
}

mountCrud(router, '/methods', S.methods, 'laboratory');
mountCrud(router, '/samples', S.samples, 'laboratory');
mountCrud(router, '/results', S.results, 'laboratory');

export default router;

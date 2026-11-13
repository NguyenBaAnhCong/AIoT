import assert from 'node:assert/strict';

const base = `http://127.0.0.1:${process.env.PORT || 3005}`;
async function get(path) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(5000) });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  return response.headers.get('content-type')?.startsWith('application/json') ? response.json() : response.text();
}

try {
  for (const [path, title] of [['/', 'Sức khỏe đất'], ['/alerts-ui', 'Cảnh báo'], ['/reports-ui', 'Báo cáo']]) {
    assert.ok((await get(path)).includes(title), `${path}: thiếu nội dung giao diện`);
  }
  const [plot] = await get('/sqi/plots');
  assert.ok(plot, 'Chưa có điểm SQI. Nạp dữ liệu demo trước.');
  const query = new URLSearchParams({
    plotId: plot.plot_id, definitionId: plot.definition_id, from: plot.first_day, to: plot.last_day,
  });
  const scores = await get('/sqi/scores?' + query);
  assert.ok(scores.length, 'Không tìm thấy lịch sử SQI của ô demo.');
  const detail = await get('/sqi/scores/' + scores[0].sqi_score_id);
  assert.ok(detail.indicators.length, 'Thiếu chi tiết chỉ tiêu.');
  const comparison = await get('/sqi/comparison?definitionId=' + plot.definition_id);
  const config = await get('/sqi/configuration');
  assert.ok(config.parameters?.length && config.labels?.length, 'Hãy khởi động lại server TV5 để tải danh mục mới.');
  console.log(`PASS SQI · ${plot.plot_code} · ${scores.length} điểm · ${detail.indicators.length} chỉ tiêu · ${comparison.length} nghiệm thức`);

  const [alerts, rules] = await Promise.all([get('/alerts'), get('/alert-rules')]);
  assert.ok(alerts.length && rules.length, 'Thiếu luật hoặc cảnh báo demo.');
  console.log(`PASS Cảnh báo · ${alerts.length} cảnh báo trong danh sách · ${rules.length} luật`);

  const [options, history] = await Promise.all([get('/reports/options'), get('/reports')]);
  assert.ok(options.experiments?.length && Array.isArray(history), 'Thiếu thí nghiệm hoặc không đọc được lịch sử báo cáo.');
  console.log(`PASS Báo cáo · ${options.experiments.length} thí nghiệm · ${history.length} báo cáo trong lịch sử`);
} catch (error) {
  console.error(`FAIL ${error.message}`);
  if (error.message === 'fetch failed') console.error(`Mở server bằng npm.cmd start và kiểm tra ${base}.`);
  process.exitCode = 1;
}

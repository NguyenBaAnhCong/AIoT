import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { db, fail } from './db.mjs';
import { sqiApi } from './sqi.mjs';
import { activate, calculate, comparison, configuration, createDefinition } from './sqi-admin.mjs';
import { alertSummary, changeAlert, changeRecommendation, evaluate, listAlerts, listRules, saveRule } from './alerts.mjs';
import { createReport, downloadReport, listReports, reportOptions } from './reports.mjs';

const port = Number(process.env.PORT || 3005);
const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ['/alerts-ui', ['alerts.html', 'text/html']],
  ['/reports-ui', ['reports.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/workspace.js', ['workspace.js', 'text/javascript']],
  ['/sqi-tools.js', ['sqi-tools.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']],
  ['/alerts.css', ['alerts.css', 'text/css']],
  ['/sqi.css', ['sqi.css', 'text/css']],
  ['/reports.css', ['reports.css', 'text/css']],
]);

const routes = [
  ['GET', /^\/sqi\/configuration$/, () => configuration(db)],
  ['GET', /^\/sqi\/comparison$/, (_, url) => comparison(db, url.searchParams.get('definitionId'))],
  ['POST', /^\/sqi\/definitions$/, (_, __, data) => createDefinition(db, data)],
  ['POST', /^\/sqi\/definitions\/([^/]+)\/activate$/, id => activate(db, id)],
  ['POST', /^\/sqi\/calculate$/, (_, __, { definition, dataset, label }) => calculate(db, definition, dataset, label)],
  ['GET', /^\/alerts$/, (_, url) => listAlerts(db, url.searchParams)],
  ['GET', /^\/alerts\/summary$/, () => alertSummary(db)],
  ['PATCH', /^\/alerts\/([^/]+)$/, (id, _, data) => changeAlert(db, id, data)],
  ['PATCH', /^\/recommendations\/([^/]+)$/, (id, _, data) => changeRecommendation(db, id, data)],
  ['GET', /^\/alert-rules$/, () => listRules(db)],
  ['POST', /^\/alert-rules$/, (_, __, data) => saveRule(db, null, data)],
  ['PUT', /^\/alert-rules\/([^/]+)$/, (id, _, data) => saveRule(db, id, data)],
  ['POST', /^\/alerts\/evaluate$/, (_, __, { at }) => evaluate(db, at)],
  ['GET', /^\/reports$/, () => listReports(db)],
  ['GET', /^\/reports\/options$/, () => reportOptions(db)],
  ['POST', /^\/reports$/, (_, __, data) => createReport(db, data)],
  ['GET', /^\/reports\/([^/]+)\/file$/, id => downloadReport(db, id)],
];

async function body(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) {
    fail(415, 'Yêu cầu phải gửi dữ liệu JSON.');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 128 * 1024) fail(413, 'Dữ liệu gửi lên quá lớn.');
    chunks.push(chunk);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail(400, 'Dữ liệu JSON không hợp lệ.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'Cần gửi một đối tượng JSON.');
  return data;
}

createServer(async (request, response) => {
  function send(status, data) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(data));
  }
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  try {
    const host = request.headers.host;
    const origin = `http://${host}`;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host) ||
        (request.headers.origin && request.headers.origin !== origin)) {
      fail(403, 'Chỉ hỗ trợ truy cập từ ứng dụng cục bộ.');
    }
    const url = new URL(request.url, origin);
    if (request.method === 'GET' && assets.has(url.pathname)) {
      const [filename, type] = assets.get(url.pathname);
      const asset = await readFile(new URL(`./public/${filename}`, import.meta.url));
      response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      return response.end(asset);
    }
    for (const [method, pattern, handle] of routes) {
      const match = url.pathname.match(pattern);
      if (request.method !== method || !match) continue;
      const result = await handle(match[1], url, method === 'GET' ? undefined : await body(request));
      if (result.file) {
        response.writeHead(200, { 'Content-Type': result.type,
          'Content-Disposition': `attachment; filename="${result.filename}"` });
        return response.end(result.file);
      }
      return send(200, result);
    }
    if (request.method === 'GET') {
      const result = await sqiApi(db, url);
      return send(result.status, result.body);
    }
    return send(404, { error: 'Không tìm thấy đường dẫn.' });
  } catch (error) {
    if (error.status) return send(error.status, { error: error.message });
    if (error.code === '23505') return send(409, { error: 'Mã hoặc cấu hình bị trùng.' });
    if (error.code === '23P01') return send(409, { error: 'Khoảng ngày và ô đã có điểm từ dataset khác trong phiên bản SQI này.' });
    if (['23503','23514','22001','22003','22P02'].includes(error.code)) {
      return send(400, { error: 'Giá trị không hợp lệ theo ràng buộc của cơ sở dữ liệu.' });
    }
    console.error(error.message);
    return send(500, { error: 'Không xử lý được yêu cầu. Kiểm tra log Node.js và kết nối PostgreSQL.' });
  }
}).listen(port, '127.0.0.1', () => console.log(`TV5: http://127.0.0.1:${port}`));

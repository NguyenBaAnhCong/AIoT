import { request } from './http.js';
const root = '/api/v1/tv5';
const data = async (path, options) => (await request(root + path, options)).data;
export const alertApi = {
  list: query => request(root + '/alerts?' + query),
  summary: () => data('/alerts/summary'),
  rules: () => data('/alert-rules'),
  change: (id, body) => data('/alerts/' + encodeURIComponent(id), { method: 'PATCH', data: body }),
  decide: (id, body) => data('/recommendations/' + encodeURIComponent(id), { method: 'PATCH', data: body }),
  evaluate: body => data('/alerts/evaluate', { method: 'POST', data: body }),
  saveRule: (id, body) => data('/alert-rules' + (id ? '/' + encodeURIComponent(id) : ''), { method: id ? 'PUT' : 'POST', data: body }),
};

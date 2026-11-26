import { request } from './http.js';
const root = '/api/v1/tv5/sqi';
const data = async (path, options) => (await request(root + path, options)).data;
export const sqiApi = {
  plots: signal => data('/plots', { signal }),
  scores: (query, signal) => data('/scores?' + query, { signal }),
  detail: (id, signal) => data('/scores/' + encodeURIComponent(id), { signal }),
  comparison: id => data('/comparison?definitionId=' + encodeURIComponent(id)),
  configuration: () => data('/configuration'),
  calculate: body => data('/calculate', { method: 'POST', data: body }),
  activate: id => data('/definitions/' + encodeURIComponent(id) + '/activate', { method: 'POST', data: {} }),
  createDefinition: body => data('/definitions', { method: 'POST', data: body }),
};

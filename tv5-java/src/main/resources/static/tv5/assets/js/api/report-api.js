import { request } from './http.js';
const root = '/api/v1/tv5/reports';
export const reportApi = {
  list: query => request(root + '?' + query),
  options: async () => (await request(root + '/options')).data,
  kpis: async () => (await request(root + '/kpis')).data,
  create: async body => (await request(root, { method: 'POST', data: body })).data,
  download: id => request(root + '/' + encodeURIComponent(id) + '/file', { binary: true }),
};

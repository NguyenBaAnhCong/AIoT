import { can, currentUser } from '../api/auth-api.js';
import { mount } from './layout.js';
const screens = {
  sqi: { title: 'Sức khỏe đất – SQI', permission: 'sqi.read' },
  alerts: { title: 'Cảnh báo & quyết định', permission: 'alert.read' },
  reports: { title: 'Báo cáo', permission: 'reporting.read' },
};
const screen = location.pathname.split('/').filter(Boolean).at(-1);
try {
  const user = await currentUser();
  const info = screens[screen];
  if (!info || !can(info.permission)) throw new Error('Tài khoản chưa được cấp quyền xem trang này.');
  const view = await import('../views/' + screen + '.view.js');
  document.title = info.title + ' · Edge-AIoT';
  mount(user, screen, info.title, view.markup);
  if (screen === 'alerts') (await import('../pages/alerts.page.js')).initAlerts();
  if (screen === 'reports') (await import('../pages/reports.page.js')).initReports();
  if (screen === 'sqi') {
    const [monitor, configuration] = await Promise.all([import('../pages/sqi.page.js'), import('../pages/sqi-configuration.page.js')]);
    await Promise.all([monitor.initSqi(), configuration.initSqiConfiguration()]);
  }
} catch (error) {
  const message = document.createElement('p');
  message.setAttribute('role', 'alert'); message.textContent = error.message;
  const home = document.createElement('a'); home.href = '/'; home.textContent = 'Về dashboard';
  document.body.append(message, home);
}

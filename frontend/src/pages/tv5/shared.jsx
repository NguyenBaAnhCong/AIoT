import { useState } from 'react';
import { ErrorBox, Spinner } from '../../components/Feedback';
import './tv5.css';
export { default as Pager } from '../s14-admin/Pager';

export const healthNames = { VERY_GOOD: 'Rất tốt', GOOD: 'Tốt', FAIR: 'Trung bình', POOR: 'Kém' };
export const conditionNames = {
  LT: 'Thấp hơn ngưỡng', GT: 'Cao hơn ngưỡng', OUTSIDE: 'Ngoài khoảng cho phép',
  CLASS_IN: 'Thuộc nhóm phân loại', ANOMALY: 'Phát hiện bất thường', OFFLINE: 'Mất kết nối',
};

export function readableReason(value) {
  const match = /^Luật\s+\S+\s+\(([A-Z_]+)\)$/.exec(value);
  return match && conditionNames[match[1]] ? 'Lý do: ' + conditionNames[match[1]].toLocaleLowerCase('vi-VN') + '.' : value;
}

export const apiRoot = '/tv5';
export const columns = fields => fields.map(([key, title, render]) => ({ key, title, render }));
export const formatDate = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
export const formatNumber = value => value == null ? '—' : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 4 });

export function Load({ request, children }) {
  if (request.error) return <ErrorBox error={request.error} onRetry={request.reload} />;
  return request.loading ? <Spinner /> : children(request.data);
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  async function run(task) {
    setBusy(true);
    setError(null);
    setMessage('');
    try { setMessage((await task()) ?? ''); }
    catch (err) { setError(err); }
    finally { setBusy(false); }
  }
  return { busy, run, feedback: <><ErrorBox error={error} />{message && <p role="status">{message}</p>}</> };
}

export function Options({ values, blank }) {
  return <>
    {blank !== undefined && <option value="">{blank}</option>}
    {values.map(([value, label]) => <option key={value} value={value}>{label ?? value}</option>)}
  </>;
}

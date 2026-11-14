import { useState } from 'react';
import { ErrorBox, Spinner } from '../../components/Feedback';

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

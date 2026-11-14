// Phần dùng chung cho 3 màn hình của TV3 (05, 06, 07).
import { useState } from 'react';
import { ErrorBox } from '../../components/Feedback';
import { Badge, Button, Field } from '../../components/ui';
import './tv3.css';

export const fmtNum = (v, digits = 2) =>
  v == null || v === '' ? '—' : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: digits });
export const fmtDate = (v) => (v ? new Date(v.length === 10 ? `${v}T00:00:00` : v).toLocaleDateString('vi-VN') : '—');
export const fmtTime = (v) => (v ? new Date(v).toLocaleString('vi-VN') : '—');
export const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD theo giờ máy

const TONES = {
  ACTIVE: 'ok', RUNNING: 'ok', PASSED: 'ok', APPROVED: 'ok', COMPLETED: 'ok',
  PLANNED: 'info', VERIFIED: 'info', RECEIVED: 'info', ANALYZING: 'info', COLLECTED: 'neutral',
  PENDING: 'warn', DRAFT: 'warn', FALLOW: 'warn',
  FAILED: 'bad', REJECTED: 'bad', CANCELLED: 'bad', RETIRED: 'bad', INACTIVE: 'neutral',
};
const LABELS = {
  ACTIVE: 'Đang dùng', FALLOW: 'Bỏ hóa', INACTIVE: 'Tạm ngừng', RETIRED: 'Ngừng',
  PLANNED: 'Kế hoạch', RUNNING: 'Đang chạy', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy',
  PENDING: 'Chờ kiểm tra', PASSED: 'Đạt', FAILED: 'Không đạt',
  DRAFT: 'Nháp', VERIFIED: 'Đã xác minh', APPROVED: 'Đã duyệt', REJECTED: 'Đã loại',
  COLLECTED: 'Đã lấy', RECEIVED: 'Đã nhận', ANALYZING: 'Đang phân tích',
};
export const StatusBadge = ({ value }) => <Badge tone={TONES[value] || 'neutral'}>{LABELS[value] || value}</Badge>;

/** Thanh tab đơn giản. tabs = [[key, nhãn], ...] */
export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tv3-tabs" role="tablist">
      {tabs.map(([key, label]) => (
        <button key={key} type="button" role="tab" aria-selected={value === key}
          className={value === key ? 'tv3-tab active' : 'tv3-tab'} onClick={() => onChange(key)}>{label}</button>
      ))}
    </div>
  );
}

/**
 * Form tạo nhanh. fields = [{ name, label, type?, options?, required?, step?, placeholder? }]
 * onSubmit(values) trả Promise; lỗi API hiện ngay trên form, thành công thì xóa form.
 */
export function QuickForm({ fields, onSubmit, submitLabel = 'Lưu', initial = {} }) {
  const blank = Object.fromEntries(fields.map((f) => [f.name, initial[f.name] ?? (f.type === 'checkbox' ? false : '')]));
  const [values, setValues] = useState(blank);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (name, v) => setValues((s) => ({ ...s, [name]: v }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // bỏ trường trống; số thì ép kiểu
      const body = {};
      for (const f of fields) {
        const v = values[f.name];
        if (f.type === 'checkbox') body[f.name] = Boolean(v);
        else if (v !== '' && v != null) body[f.name] = f.type === 'number' ? Number(v) : v;
      }
      await onSubmit(body);
      setValues(blank);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form tv3-form" onSubmit={submit}>
      <ErrorBox error={error} />
      <div className="tv3-form-grid">
        {fields.map((f) => (
          <Field key={f.name} label={f.label + (f.required ? ' *' : '')}>
            {f.options ? (
              <select value={values[f.name]} required={f.required} onChange={(e) => set(f.name, e.target.value)}>
                <option value="">— chọn —</option>
                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : f.type === 'checkbox' ? (
              <input type="checkbox" checked={values[f.name]} onChange={(e) => set(f.name, e.target.checked)} />
            ) : (
              <input type={f.type || 'text'} step={f.step || (f.type === 'number' ? 'any' : undefined)} value={values[f.name]}
                required={f.required} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />
            )}
          </Field>
        ))}
      </div>
      <div><Button variant="primary" type="submit" loading={busy}>{submitLabel}</Button></div>
    </form>
  );
}

/** Nút mở/đóng form tạo mới, chỉ hiện khi có quyền. */
export function Toggle({ label, children, allowed = true }) {
  const [open, setOpen] = useState(false);
  if (!allowed) return null;
  return (
    <>
      <Button size="sm" variant={open ? 'default' : 'primary'} onClick={() => setOpen((o) => !o)}>{open ? 'Đóng' : label}</Button>
      {open && <div className="tv3-drawer">{typeof children === 'function' ? children(() => setOpen(false)) : children}</div>}
    </>
  );
}

/** Gọi một thao tác (duyệt, kết thúc...) và hiện lỗi nếu có. */
export function useAction() {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  async function run(key, fn) {
    setBusy(key);
    setError(null);
    try { await fn(); } catch (e) { setError(e); } finally { setBusy(null); }
  }
  return { error, busy, run, clear: () => setError(null) };
}

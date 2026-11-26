export const get = id => document.getElementById(id);
export const el = (tag, text) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  return node;
};

export function pager(meta, change) {
  const node = el('div');
  node.className = 'native-pager';
  const pages = Math.max(1, Math.ceil(meta.total / meta.limit));
  node.append(el('span', `${meta.total.toLocaleString('vi-VN')} bản ghi · Trang ${meta.page}/${pages}`));
  const controls = el('div');
  for (const [text, page, disabled] of [['Trước', meta.page - 1, meta.page <= 1], ['Sau', meta.page + 1, meta.page >= pages]]) {
    const button = el('button', text);
    button.type = 'button';
    button.disabled = disabled;
    button.addEventListener('click', async () => {
      for (const control of controls.children) control.disabled = true;
      await change(page);
    });
    controls.append(button);
  }
  node.append(controls);
  return node;
}
export function table(headings, rows) {
  const node = el('table');
  const header = node.createTHead().insertRow();
  for (const text of headings) header.append(el('th', text));
  const body = node.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const value of row) {
      const cell = tr.insertCell();
      if (value instanceof Node) cell.append(value);
      else cell.textContent = value ?? '—';
    }
  }
  return node;
}
export async function task(button, status, run) {
  button.disabled = true;
  status.textContent = 'Đang xử lý…';
  try { status.textContent = await run() || ''; }
  catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
}
export function action(label, status, run) {
  const button = el('button', label);
  button.type = 'button';
  button.addEventListener('click', () => void task(button, status, run));
  return button;
}

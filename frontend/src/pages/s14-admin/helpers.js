export const fmt = (v) => (v ? new Date(v).toLocaleString('vi-VN') : '—');

/** Ngày YYYY-MM-DD -> ISO. endOfDay=true thì lấy đầu ngày kế tiếp (khoảng thời gian dạng [từ, đến) ). */
export const dayToIso = (day, endOfDay = false) => {
  if (!day) return undefined;
  const d = new Date(`${day}T00:00:00`);
  if (endOfDay) d.setDate(d.getDate() + 1);
  return d.toISOString();
};

export const copyText = (text) => navigator.clipboard?.writeText(text);

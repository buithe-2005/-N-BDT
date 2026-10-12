// Tiện ích dùng chung: render an toàn (tự thoát HTML), định dạng tiền tệ, helper DOM.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
/** Đánh dấu chuỗi đã là HTML an toàn (do chính ứng dụng sinh ra). */
export const raw = (s) => new Raw(s);

/** Template tag: mọi giá trị nội suy đều bị thoát, trừ raw() và mảng của raw(). */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    const part = Array.isArray(v)
      ? v.map((x) => (x instanceof Raw ? x.s : esc(x))).join('')
      : v instanceof Raw ? v.s : esc(v);
    out += part + strings[i + 1];
  });
  return new Raw(out);
}

export const vnd = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;

export const GENDER_LABEL = { nam: 'Nam', nu: 'Nữ', unisex: 'Unisex' };
export const STATUS_LABEL = { pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', shipping: 'Đang giao', delivered: 'Đã giao', cancelled: 'Đã hủy' };
export const PAYMENT_LABEL = { cod: 'Thanh toán khi nhận hàng (COD)', bank_transfer: 'Chuyển khoản ngân hàng' };

export function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Phần tử có thể focus bên trong container (phục vụ focus trap). */
export function focusables(root) {
  return $$('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', root)
    .filter((e) => !e.hidden && e.offsetParent !== null);
}

/** Bẫy focus trong container và đóng bằng Escape. Trả về hàm gỡ bỏ. */
export function trapFocus(container, onClose) {
  const prev = document.activeElement;
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables(container);
    if (!f.length) return;
    const first = f[0]; const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey, true);
  return () => {
    document.removeEventListener('keydown', onKey, true);
    if (prev && document.contains(prev)) prev.focus();
  };
}

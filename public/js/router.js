// Router hash đơn giản: #/duong-dan?khoa=gia-tri
const routes = [];
let current = null;
let notFound = null;
export const setNotFound = (page) => { notFound = page; };

export function addRoute(pattern, page) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ re, keys, page });
}

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function navigate(to, { replace = false } = {}) {
  const target = `#${to}`;
  if (replace) history.replaceState(null, '', target);
  else if (location.hash !== target) location.hash = to;
  else render();
  if (replace) render();
}

export function buildQuery(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v !== '' && v != null && v !== false) p.set(k, v === true ? '1' : v); });
  const s = p.toString();
  return s ? `?${s}` : '';
}

let renderToken = 0;
export async function render() {
  const { path, query } = parseHash();
  const oldMain = document.getElementById('main');
  // Thay phần tử main bằng bản sao rỗng để gỡ toàn bộ listener của trang trước.
  const main = oldMain.cloneNode(false);
  oldMain.replaceWith(main);
  if (current && current.cleanup) { try { current.cleanup(); } catch { /* bỏ qua */ } }
  current = null;
  const token = ++renderToken;
  let match = null;
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) { const params = {}; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); match = { r, params }; break; }
  }
  const page = match ? match.r.page : notFound;
  if (!page) return;
  const ctx = { params: match ? match.params : {}, query, path, isCurrent: () => token === renderToken };
  const result = await page(main, ctx);
  if (token !== renderToken) return;
  current = result || null;
  document.dispatchEvent(new CustomEvent('route-changed', { detail: { path, query } }));
}

export function startRouter() {
  window.addEventListener('hashchange', () => { render().then(() => { window.scrollTo(0, 0); focusMain(); }); });
  render();
}

function focusMain() { const m = document.getElementById('main'); if (m) m.focus({ preventScroll: true }); }

export function setTitle(t) { document.title = t ? `${t} – STRIDEX` : 'STRIDEX – Giày thể thao chính hãng, tư vấn bởi AI'; }

/** Cập nhật query của route hiện tại mà không cuộn/focus lại. */
export function replaceQuery(path, query) {
  history.replaceState(null, '', `#${path}${buildQuery(query)}`);
  document.dispatchEvent(new CustomEvent('route-changed', { detail: { path, query } }));
}

// Toast & Modal dùng chung
import { html, $, trapFocus, focusables } from '../util.js';
import { icon } from '../icons.js';

export function toast(message, type = 'info') {
  const region = document.getElementById('toast-region');
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
}

let modalSeq = 0;
/**
 * Mở modal có quản lý focus, đóng bằng Escape hoặc click nền.
 * @returns {{close:Function, el:HTMLElement}}
 */
export function openModal({ title, body, wide = false, onMount }) {
  const root = document.getElementById('modal-root');
  const id = `modal-title-${++modalSeq}`;
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = html`
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <div class="modal-head">
        <h2 id="${id}">${title}</h2>
        <button class="icon-btn" type="button" data-close aria-label="Đóng">${icon('close')}</button>
      </div>
      <div class="modal-body"></div>
    </div>`.toString();
  const bodyEl = $('.modal-body', wrap);
  bodyEl.innerHTML = String(body);
  root.appendChild(wrap);
  document.body.classList.add('no-scroll');
  let release;
  const close = () => {
    release && release();
    wrap.remove();
    if (!root.children.length) document.body.classList.remove('no-scroll');
  };
  release = trapFocus(wrap, close);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  $('[data-close]', wrap).addEventListener('click', close);
  const f = focusables(bodyEl);
  (f[0] || $('[data-close]', wrap)).focus();
  if (onMount) onMount(bodyEl, close);
  return { close, el: bodyEl };
}

export function confirmDialog(message, confirmLabel = 'Xác nhận') {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const m = openModal({
      title: 'Xác nhận',
      body: html`<p>${message}</p><div class="row" style="margin-top:1.5rem;justify-content:flex-end">
        <button class="btn btn-secondary" type="button" data-no>Hủy</button>
        <button class="btn btn-primary" type="button" data-yes>${confirmLabel}</button></div>`,
      onMount: (el, close) => {
        $('[data-no]', el).addEventListener('click', () => { finish(false); close(); });
        $('[data-yes]', el).addEventListener('click', () => { finish(true); close(); });
      },
    });
    // Escape/click nền cũng coi như hủy
    const obs = new MutationObserver(() => { if (!document.contains(m.el)) { finish(false); obs.disconnect(); } });
    obs.observe(document.getElementById('modal-root'), { childList: true });
  });
}

// Trợ lý mua sắm AI: nút nổi nhỏ gọn, KHÔNG tự mở. Gọi /api/ai/chat qua backend (không có khóa API ở frontend).
import { html, vnd, $, trapFocus } from '../util.js';
import { icon } from '../icons.js';
import { api } from '../api.js';

const KEY = 'stridex.ai';
const SUGGESTIONS = [
  'Giày chạy bộ dưới 2,5 triệu',
  'Giày nữ đi làm, size 38',
  'Giày bóng rổ màu đen',
  'Phí giao hàng thế nào?',
];

let ui = null; // { panel, release }
let session = load();
let busy = false;
let lastUserMessage = null;

function load() {
  try { return JSON.parse(sessionStorage.getItem(KEY)) || { conversationId: null, messages: [] }; }
  catch { return { conversationId: null, messages: [] }; }
}
const save = () => sessionStorage.setItem(KEY, JSON.stringify(session));

export function initAI() {
  const root = document.getElementById('ai-root');
  root.innerHTML = html`<button class="ai-fab" type="button" id="ai-fab" aria-haspopup="dialog" aria-label="Mở trợ lý tư vấn giày AI">${icon('chat')}<span>Tư vấn AI</span></button>`.toString();
  $('#ai-fab').addEventListener('click', openPanel);
}

function msgHTML(m) {
  if (m.role === 'user') return html`<div class="ai-msg user">${m.content}</div>`;
  return html`<div class="ai-msg bot">${m.content}</div>${m.products && m.products.length ? html`
    <div class="ai-cards">${m.products.map((p) => html`
      <a class="ai-card" href="#/product/${p.slug}" data-ai-link>
        <img src="${p.image}" alt="${p.name}" width="72" height="72" loading="lazy">
        <div><div class="t">${p.name}</div>
        <div class="s">${p.category} · ${p.colors.join(', ')}</div>
        <div class="s"><strong>${vnd(p.effectivePrice)}</strong>${p.salePrice ? html` <s>${vnd(p.price)}</s>` : ''} · size còn: ${p.sizes.join(', ')}</div></div>
      </a>`)}</div>` : ''}`;
}

function renderLog() {
  const log = $('.ai-log', ui.panel);
  const intro = session.messages.length ? '' : html`<div class="ai-msg bot">Xin chào! Mình là trợ lý tư vấn giày của cửa hàng. Mình chỉ gợi ý từ các sản phẩm đang bán và còn hàng. Bạn cứ hỏi theo mục đích, ngân sách hoặc size nhé.</div>`;
  log.innerHTML = String(intro) + session.messages.map((m) => msgHTML(m).toString()).join('');
  log.scrollTop = log.scrollHeight;
  $('.ai-chips', ui.panel).hidden = session.messages.length > 0;
}

function openPanel() {
  if (ui) return;
  const fab = $('#ai-fab');
  const panel = document.createElement('section');
  panel.className = 'ai-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Trợ lý tư vấn giày AI');
  panel.innerHTML = html`
    <div class="ai-head">
      <h2>Tư vấn giày AI<small>Gợi ý từ sản phẩm đang bán</small></h2>
      <div class="row" style="gap:0">
        <button class="icon-btn" type="button" id="ai-reset" aria-label="Kết thúc hội thoại và bắt đầu lại" title="Kết thúc hội thoại">${icon('refresh')}</button>
        <button class="icon-btn" type="button" id="ai-close" aria-label="Đóng trợ lý">${icon('close')}</button>
      </div>
    </div>
    <div class="ai-log" role="log" aria-live="polite" aria-relevant="additions"></div>
    <div class="ai-chips">${SUGGESTIONS.map((s) => html`<button class="chip" type="button" data-s="${s}">${s}</button>`)}</div>
    <form class="ai-form" id="ai-form">
      <label class="sr-only" for="ai-input">Nhập câu hỏi</label>
      <input class="input" id="ai-input" maxlength="500" autocomplete="off" placeholder="Hỏi về giày, ngân sách, size…">
      <button class="btn btn-primary btn-sm" type="submit" aria-label="Gửi">${icon('send', 'icon icon-sm')}</button>
    </form>
    <div class="ai-foot"><span>Kiểm tra giá và tồn kho trên trang sản phẩm.</span></div>`.toString();
  document.getElementById('ai-root').appendChild(panel);
  fab.hidden = true;
  ui = { panel, release: null };
  const close = () => {
    ui.release && ui.release();
    panel.remove();
    ui = null;
    fab.hidden = false;
    fab.focus();
  };
  ui.release = trapFocus(panel, close);
  renderLog();
  $('#ai-close', panel).addEventListener('click', close);
  $('#ai-reset', panel).addEventListener('click', () => { session = { conversationId: null, messages: [] }; save(); renderLog(); $('#ai-input', panel).focus(); });
  $('#ai-form', panel).addEventListener('submit', (e) => { e.preventDefault(); const i = $('#ai-input', panel); const v = i.value.trim(); if (v) { i.value = ''; send(v); } });
  panel.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-s]'); if (chip) send(chip.dataset.s);
    if (e.target.closest('[data-ai-link]') && window.matchMedia('(max-width: 600px)').matches) close();
    if (e.target.closest('[data-retry]')) { e.target.closest('.ai-msg').remove(); if (lastUserMessage) send(lastUserMessage, { retry: true }); }
  });
  $('#ai-input', panel).focus();
}

async function send(text, { retry = false } = {}) {
  if (busy || !ui) return;
  busy = true;
  lastUserMessage = text;
  const log = $('.ai-log', ui.panel);
  $('.ai-chips', ui.panel).hidden = true;
  if (!retry) {
    session.messages.push({ role: 'user', content: text });
    log.insertAdjacentHTML('beforeend', msgHTML({ role: 'user', content: text }).toString());
  }
  log.insertAdjacentHTML('beforeend', '<div class="ai-msg bot ai-typing" id="ai-typing" aria-label="Đang xử lý"><span></span><span></span><span></span></div>');
  log.scrollTop = log.scrollHeight;
  const submit = $('#ai-form button', ui.panel);
  submit.disabled = true;
  try {
    const r = await api('/ai/chat', { method: 'POST', body: { message: text, conversationId: session.conversationId } });
    session.conversationId = r.conversationId;
    const m = { role: 'assistant', content: r.reply, products: r.products };
    session.messages.push(m);
    save();
    if (ui) { $('#ai-typing', ui.panel)?.remove(); log.insertAdjacentHTML('beforeend', msgHTML(m).toString()); }
  } catch (err) {
    if (ui) {
      $('#ai-typing', ui.panel)?.remove();
      const msg = err.status === 503 ? err.message : err.message || 'Đã xảy ra lỗi.';
      log.insertAdjacentHTML('beforeend', html`<div class="ai-msg bot error alert alert-error" role="alert">${msg}<br><button class="btn btn-secondary btn-sm" type="button" data-retry style="margin-top:.5rem">Thử lại</button></div>`.toString());
    }
    // Giữ tin nhắn người dùng trong phiên để có thể thử lại; không bao giờ lưu phản hồi giả.
    save();
  } finally {
    busy = false;
    if (ui) { submit.disabled = false; log.scrollTop = log.scrollHeight; $('#ai-input', ui.panel).focus(); }
  }
}

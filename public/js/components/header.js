// Announcement bar, header, drawer mobile, tìm kiếm và menu tài khoản
import { html, raw, $, $$, trapFocus, esc } from '../util.js';
import { icon, logoMark } from '../icons.js';
import { state, cartCount, subscribe, logout } from '../store.js';
import { navigate, parseHash } from '../router.js';
import { openModal, toast } from './ui.js';
import { vnd } from '../util.js';

const NAV = [
  { label: 'Hàng mới', href: '/shop?isNew=1', match: (q) => q.isNew === '1' },
  { label: 'Nam', href: '/shop?gender=nam', match: (q) => q.gender === 'nam' },
  { label: 'Nữ', href: '/shop?gender=nu', match: (q) => q.gender === 'nu' },
  { label: 'Thể thao', href: '/shop?sport=1', match: (q) => q.sport === '1' },
  { label: 'Giảm giá', href: '/shop?sale=1', match: (q) => q.sale === '1' },
];

export function renderAnnouncement() {
  const el = document.getElementById('announcement');
  const c = state.config && state.config.publicCoupon;
  const ship = state.config && state.config.freeShippingThreshold;
  if (!c && !ship) { el.innerHTML = ''; return; }
  const parts = [];
  if (c) parts.push(`Nhập mã <strong>${esc(c.code)}</strong> giảm ${c.percent}% cho đơn từ ${vnd(c.minOrder)}`);
  if (ship) parts.push(`Miễn phí giao hàng cho đơn từ ${vnd(ship)}`);
  el.innerHTML = `<div class="announcement" role="region" aria-label="Thông báo ưu đãi">${parts.join(' &nbsp;·&nbsp; ')}</div>`;
}

function accountMenu() {
  const u = state.user;
  if (!u) return html`<a class="icon-btn" href="#/login" aria-label="Đăng nhập">${icon('user')}</a>`;
  return html`
    <div class="account-menu">
      <button class="icon-btn" type="button" id="account-btn" aria-haspopup="true" aria-expanded="false" aria-controls="account-pop" aria-label="Tài khoản của ${u.name}">${icon('user')}</button>
      <div class="account-pop" id="account-pop" hidden>
        <div class="who"><strong>${u.name}</strong><br><span class="muted">${u.email}</span></div>
        <a href="#/account">Hồ sơ & địa chỉ</a>
        <a href="#/orders">Đơn hàng của tôi</a>
        <a href="#/wishlist">Yêu thích</a>
        ${u.role === 'admin' ? html`<a href="#/admin">Trang quản trị</a>` : ''}
        <button type="button" id="logout-btn">Đăng xuất</button>
      </div>
    </div>`;
}

export function renderHeader() {
  const el = document.getElementById('site-header');
  const { query } = parseHash();
  const name = (state.config && state.config.store && state.config.store.name) || 'STRIDEX';
  el.innerHTML = html`
    <div class="header-inner">
      <button class="icon-btn nav-toggle" type="button" id="nav-toggle" aria-label="Mở menu" aria-expanded="false" aria-controls="mobile-drawer">${icon('menu')}</button>
      <a class="logo" href="#/" aria-label="${name} – Trang chủ">${logoMark}<span>${name}</span></a>
      <nav class="main-nav" aria-label="Danh mục chính">
        ${NAV.map((n) => html`<a href="#${n.href}" ${n.match(query) ? raw('aria-current="page"') : ''}>${n.label}</a>`)}
      </nav>
      <div class="header-actions">
        <button class="icon-btn" type="button" id="search-btn" aria-label="Tìm kiếm">${icon('search')}</button>
        ${accountMenu()}
        <a class="icon-btn hide-sm" href="#/wishlist" aria-label="Yêu thích">${icon('heart')}</a>
        <a class="icon-btn" href="#/cart" aria-label="Giỏ hàng, ${cartCount()} sản phẩm" id="cart-link">${icon('bag')}<span class="cart-count" id="cart-count" ${cartCount() ? '' : raw('hidden')}>${cartCount()}</span></a>
      </div>
    </div>`.toString();
  bindHeader();
}

export function updateCartBadge() {
  const n = cartCount();
  const badge = document.getElementById('cart-count');
  const link = document.getElementById('cart-link');
  if (badge) { badge.textContent = n; badge.hidden = !n; }
  if (link) link.setAttribute('aria-label', `Giỏ hàng, ${n} sản phẩm`);
}

function bindHeader() {
  $('#nav-toggle').addEventListener('click', openDrawer);
  $('#search-btn').addEventListener('click', openSearch);
  const btn = $('#account-btn');
  if (btn) {
    const pop = $('#account-pop');
    const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = pop.hidden;
      pop.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) $('a', pop).focus();
    });
    pop.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
    document.addEventListener('click', (e) => { if (!pop.contains(e.target) && e.target !== btn) close(); });
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); btn.focus(); } });
    $('#logout-btn').addEventListener('click', () => { close(); logout(); toast('Bạn đã đăng xuất.'); navigate('/'); });
  }
}

function openSearch() {
  openModal({
    title: 'Tìm kiếm sản phẩm',
    body: html`
      <form id="search-form" role="search" class="stack">
        <div class="field"><label for="search-input">Từ khóa (tên giày, danh mục, màu sắc)</label>
        <input class="input" id="search-input" type="search" autocomplete="off" placeholder="Ví dụ: chạy bộ, đen, Velo"></div>
        <button class="btn btn-primary" type="submit">Tìm kiếm</button>
      </form>`,
    onMount: (el, close) => {
      $('#search-form', el).addEventListener('submit', (e) => {
        e.preventDefault();
        const q = $('#search-input', el).value.trim();
        close();
        navigate(q ? `/shop?q=${encodeURIComponent(q)}` : '/shop');
      });
    },
  });
}

let releaseDrawer = null;
function openDrawer() {
  if (releaseDrawer) return;
  const root = document.getElementById('modal-root');
  const u = state.user;
  const wrap = document.createElement('div');
  wrap.innerHTML = html`
    <div class="drawer-backdrop" data-close></div>
    <aside class="drawer" id="mobile-drawer" role="dialog" aria-modal="true" aria-label="Menu">
      <div class="drawer-head"><strong class="logo">${logoMark}</strong>
        <button class="icon-btn" type="button" data-close aria-label="Đóng menu">${icon('close')}</button></div>
      <nav aria-label="Danh mục chính (di động)">
        ${NAV.map((n) => html`<a href="#${n.href}">${n.label}</a>`)}
        <a href="#/wishlist">Yêu thích</a>
        ${u ? html`<a href="#/account">Tài khoản</a><a href="#/orders">Đơn hàng</a>${u.role === 'admin' ? html`<a href="#/admin">Quản trị</a>` : ''}` : html`<a href="#/login">Đăng nhập</a><a href="#/register">Đăng ký</a>`}
      </nav>
    </aside>`.toString();
  root.appendChild(wrap);
  document.body.classList.add('no-scroll');
  $('#nav-toggle').setAttribute('aria-expanded', 'true');
  const close = () => {
    releaseDrawer && releaseDrawer();
    releaseDrawer = null;
    wrap.remove();
    document.body.classList.remove('no-scroll');
    const t = $('#nav-toggle'); if (t) t.setAttribute('aria-expanded', 'false');
  };
  releaseDrawer = trapFocus(wrap, close);
  $$('[data-close]', wrap).forEach((b) => b.addEventListener('click', close));
  $$('a', wrap).forEach((a) => a.addEventListener('click', close));
  $('.drawer a, .drawer button', wrap).focus();
}

export function initHeader() {
  renderAnnouncement();
  renderHeader();
  subscribe((what) => {
    if (what === 'cart') updateCartBadge();
    if (what === 'user' || what === 'config') { renderAnnouncement(); renderHeader(); }
  });
  document.addEventListener('route-changed', () => {
    // Cập nhật trạng thái "đang chọn" trong menu mà không dựng lại popup
    const { query } = parseHash();
    $$('.main-nav a').forEach((a, i) => {
      if (NAV[i].match(query)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  });
}

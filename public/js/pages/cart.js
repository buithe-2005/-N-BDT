// Giỏ hàng: giỏ lưu cục bộ (variantId, qty); giá/tồn kho/giảm giá/phí ship lấy từ /api/cart/quote
import { html, $, $$, vnd } from '../util.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { setTitle, navigate } from '../router.js';
import { state, setCartQty, removeFromCart, syncCartWithQuote } from '../store.js';
import { stateBox } from '../components/productCard.js';
import { toast } from '../components/ui.js';

const COUPON_KEY = 'stridex.coupon';
export const getCoupon = () => sessionStorage.getItem(COUPON_KEY) || '';
export const setCoupon = (c) => (c ? sessionStorage.setItem(COUPON_KEY, c) : sessionStorage.removeItem(COUPON_KEY));

export function summaryHTML(q, { checkout = false } = {}) {
  const free = q.freeShippingThreshold;
  const remain = free - (q.subtotal - q.discount);
  return html`
    <div class="line"><span>Tạm tính</span><span>${vnd(q.subtotal)}</span></div>
    ${q.discount ? html`<div class="line"><span>Giảm giá (${q.coupon.code})</span><span>-${vnd(q.discount)}</span></div>` : ''}
    <div class="line"><span>Phí giao hàng</span><span>${q.shipping ? vnd(q.shipping) : 'Miễn phí'}</span></div>
    ${q.shipping && remain > 0 && q.subtotal > 0 ? html`<p class="field-hint">Mua thêm ${vnd(remain)} để được miễn phí giao hàng.</p>` : ''}
    <div class="line total"><span>Tổng cộng</span><span>${vnd(q.total)}</span></div>`;
}

export async function cartPage(main, ctx) {
  setTitle('Giỏ hàng');
  let quote = null;

  async function load(showSkeleton = true) {
    if (!state.cart.length) { quote = null; return render(); }
    if (showSkeleton) main.innerHTML = html`<div class="container"><div class="page-head"><h1>Giỏ hàng</h1></div><div class="skeleton" style="height:200px"></div></div>`.toString();
    try {
      quote = await api('/cart/quote', { method: 'POST', body: { items: state.cart, coupon: getCoupon() } });
      if (!ctx.isCurrent()) return;
      const hadIssues = quote.issues.length > 0;
      syncCartWithQuote(quote);
      if (quote.couponError) { toast(quote.couponError, 'error'); setCoupon(''); }
      render(hadIssues);
    } catch (err) {
      if (!ctx.isCurrent()) return;
      main.innerHTML = html`<div class="container">${stateBox({ title: 'Không tải được giỏ hàng', text: err.message, actionLabel: 'Thử lại', actionId: 'retry-cart' })}</div>`.toString();
      $('#retry-cart', main)?.addEventListener('click', () => load());
    }
  }

  function render() {
    if (!state.cart.length || !quote || !quote.lines.length) {
      main.innerHTML = html`<div class="container"><div class="page-head"><h1>Giỏ hàng</h1></div>${quote && quote.issues.length ? html`<div class="alert alert-warning" role="alert">${quote.issues.map((i) => html`<div>${i.message}</div>`)}</div>` : ''}
        ${stateBox({ title: 'Giỏ hàng của bạn đang trống', text: 'Khám phá các mẫu giày mới và thêm vào giỏ hàng.', actionLabel: 'Tiếp tục mua sắm', actionHref: '#/shop' })}</div>`.toString();
      return;
    }
    main.innerHTML = html`
      <div class="container">
        <div class="page-head"><h1>Giỏ hàng</h1></div>
        ${quote.issues.length ? html`<div class="alert alert-warning" role="alert" style="margin-bottom:1rem">${quote.issues.map((i) => html`<div>${i.message}</div>`)}</div>` : ''}
        <div class="cart-layout">
          <section aria-label="Sản phẩm trong giỏ">
            ${quote.lines.map((l) => html`
              <article class="cart-line" data-vid="${l.variantId}">
                <a href="#/product/${l.slug}"><img src="${l.image}" alt="${l.name}" width="112" height="112"></a>
                <div>
                  <a class="name" href="#/product/${l.slug}">${l.name}</a>
                  <p class="muted">Màu ${l.color} · Size ${l.size}</p>
                  <p>${vnd(l.unitPrice)}${l.unitPrice < l.listPrice ? html` <s class="muted">${vnd(l.listPrice)}</s>` : ''}</p>
                  <div class="actions">
                    <div class="qty" role="group" aria-label="Số lượng ${l.name} size ${l.size}">
                      <button type="button" data-dec aria-label="Giảm số lượng">${icon('minus', 'icon icon-sm')}</button>
                      <output>${l.qty}</output>
                      <button type="button" data-inc aria-label="Tăng số lượng" ${l.qty >= Math.min(l.stock, state.config.maxQtyPerLine) ? 'disabled' : ''}>${icon('plus', 'icon icon-sm')}</button>
                    </div>
                    <button class="btn btn-ghost" type="button" data-remove>${icon('trash', 'icon icon-sm')} Xóa</button>
                  </div>
                </div>
                <div class="line-total">${vnd(l.lineTotal)}</div>
              </article>`)}
          </section>
          <aside class="summary" aria-label="Tóm tắt đơn hàng">
            <h2>Tóm tắt đơn hàng</h2>
            <form class="coupon-form" id="coupon-form">
              <label class="sr-only" for="coupon">Mã giảm giá</label>
              <input class="input" id="coupon" placeholder="Mã giảm giá" value="${getCoupon()}" autocomplete="off">
              <button class="btn btn-secondary" type="submit">Áp dụng</button>
            </form>
            ${quote.coupon ? html`<p class="field-hint">Đã áp dụng mã ${quote.coupon.code} (-${quote.coupon.percent}%). <button type="button" class="btn-ghost btn" id="coupon-remove" style="min-height:auto;padding:0">Bỏ mã</button></p>` : ''}
            ${summaryHTML(quote)}
            <button class="btn btn-primary btn-block" type="button" id="go-checkout">Tiến hành thanh toán</button>
            <p class="field-hint">Giá, giảm giá và phí giao hàng do hệ thống tính. Số lượng tối đa ${state.config.maxQtyPerLine} đôi mỗi sản phẩm.</p>
          </aside>
        </div>
      </div>`.toString();
  }

  main.addEventListener('click', async (e) => {
    const line = e.target.closest('.cart-line');
    if (line) {
      const id = Number(line.dataset.vid);
      const cur = state.cart.find((i) => i.variantId === id);
      if (e.target.closest('[data-inc]')) { setCartQty(id, cur.qty + 1); load(false); }
      if (e.target.closest('[data-dec]')) { setCartQty(id, cur.qty - 1); load(false); }
      if (e.target.closest('[data-remove]')) { removeFromCart(id); toast('Đã xóa sản phẩm khỏi giỏ hàng.'); load(false); }
    }
    if (e.target.closest('#coupon-remove')) { setCoupon(''); load(false); }
    if (e.target.closest('#go-checkout')) navigate(state.user ? '/checkout' : `/login?next=${encodeURIComponent('/checkout')}`);
  });
  main.addEventListener('submit', (e) => {
    if (e.target.id !== 'coupon-form') return;
    e.preventDefault();
    setCoupon($('#coupon', main).value.trim().toUpperCase());
    load(false);
  });

  await load();
  return { cleanup() {} };
}

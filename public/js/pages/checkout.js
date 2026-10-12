// Thanh toán: thông tin giao hàng, phương thức, xác nhận. Tổng tiền luôn lấy từ backend.
import { html, raw, $, $$, vnd, PAYMENT_LABEL } from '../util.js';
import { api, ApiError } from '../api.js';
import { setTitle, navigate } from '../router.js';
import { state, clearCart, syncCartWithQuote } from '../store.js';
import { stateBox } from '../components/productCard.js';
import { toast } from '../components/ui.js';
import { summaryHTML, getCoupon, setCoupon } from './cart.js';

export async function checkoutPage(main, ctx) {
  setTitle('Thanh toán');
  if (!state.user) { navigate(`/login?next=${encodeURIComponent('/checkout')}`, { replace: true }); return; }
  if (!state.cart.length) {
    main.innerHTML = html`<div class="container">${stateBox({ title: 'Giỏ hàng trống', text: 'Hãy thêm sản phẩm trước khi thanh toán.', actionLabel: 'Tiếp tục mua sắm', actionHref: '#/shop' })}</div>`.toString();
    return;
  }
  main.innerHTML = html`<div class="container"><div class="page-head"><h1>Thanh toán</h1></div><div class="skeleton" style="height:240px"></div></div>`.toString();

  let quote; let addresses = [];
  try {
    [quote, { addresses }] = await Promise.all([
      api('/cart/quote', { method: 'POST', body: { items: state.cart, coupon: getCoupon() } }),
      api('/addresses'),
    ]);
  } catch (err) {
    if (!ctx.isCurrent()) return;
    main.innerHTML = html`<div class="container">${stateBox({ title: 'Không tải được thông tin thanh toán', text: err.message, actionLabel: 'Thử lại', actionId: 'retry-co' })}</div>`.toString();
    $('#retry-co', main)?.addEventListener('click', () => checkoutPage(main, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;
  syncCartWithQuote(quote);
  if (quote.couponError) setCoupon('');
  if (!quote.lines.length) { navigate('/cart', { replace: true }); return; }

  const def = addresses.find((a) => a.isDefault) || addresses[0];
  const val = (k, fb = '') => (def ? def[k] : fb);

  function render(msg) {
    main.innerHTML = html`
      <div class="container">
        <div class="page-head"><h1>Thanh toán</h1></div>
        ${msg ? html`<div class="alert alert-warning" role="alert" style="margin-bottom:1rem">${msg}</div>` : ''}
        ${quote.issues.length ? html`<div class="alert alert-warning" role="alert" style="margin-bottom:1rem">${quote.issues.map((i) => html`<div>${i.message}</div>`)}</div>` : ''}
        <form class="cart-layout" id="checkout-form" novalidate>
          <div>
            <section class="checkout-section" aria-labelledby="ship-h">
              <h2 id="ship-h">Thông tin giao hàng</h2>
              ${addresses.length ? html`<div class="field" style="margin-bottom:1rem"><label for="addr-pick">Dùng địa chỉ đã lưu</label>
                <select class="select" id="addr-pick"><option value="">Nhập địa chỉ mới</option>${addresses.map((a) => html`<option value="${a.id}" ${def && def.id === a.id ? raw('selected') : ''}>${a.fullName} – ${a.line}, ${a.district}, ${a.city}</option>`)}</select></div>` : ''}
              <div class="form-grid">
                <div class="field"><label for="fullName">Họ và tên</label><input class="input" id="fullName" name="fullName" autocomplete="name" required value="${val('fullName', state.user.name)}"><span class="field-error" data-err="fullName" hidden></span></div>
                <div class="field"><label for="phone">Số điện thoại</label><input class="input" id="phone" name="phone" inputmode="tel" autocomplete="tel" required value="${val('phone', state.user.phone || '')}"><span class="field-error" data-err="phone" hidden></span></div>
                <div class="field span-2"><label for="line">Địa chỉ (số nhà, đường)</label><input class="input" id="line" name="line" autocomplete="address-line1" required value="${val('line')}"><span class="field-error" data-err="line" hidden></span></div>
                <div class="field"><label for="district">Quận / Huyện</label><input class="input" id="district" name="district" required value="${val('district')}"><span class="field-error" data-err="district" hidden></span></div>
                <div class="field"><label for="city">Tỉnh / Thành phố</label><input class="input" id="city" name="city" autocomplete="address-level1" required value="${val('city')}"><span class="field-error" data-err="city" hidden></span></div>
                <div class="field span-2"><label for="note">Ghi chú (không bắt buộc)</label><textarea class="textarea" id="note" name="note" maxlength="300"></textarea></div>
              </div>
            </section>
            <section class="checkout-section" aria-labelledby="pay-h">
              <h2 id="pay-h">Phương thức thanh toán</h2>
              <div class="stack">
                <label class="pay-option"><input type="radio" name="payment" value="cod" checked><span><strong>${PAYMENT_LABEL.cod}</strong><br><span class="muted">Thanh toán bằng tiền mặt khi nhận hàng.</span></span></label>
                <label class="pay-option"><input type="radio" name="payment" value="bank_transfer"><span><strong>${PAYMENT_LABEL.bank_transfer}</strong><br><span class="muted">Cửa hàng sẽ liên hệ hướng dẫn chuyển khoản; đơn được xác nhận thanh toán thủ công sau khi nhận tiền. Hệ thống chưa tích hợp cổng thanh toán trực tuyến.</span></span></label>
              </div>
            </section>
          </div>
          <aside class="summary" aria-label="Tóm tắt đơn hàng">
            <h2>Đơn hàng của bạn</h2>
            ${quote.lines.map((l) => html`<div class="mini-line"><img src="${l.image}" alt="" width="56" height="56"><div>${l.name}<br><span class="muted">Màu ${l.color} · Size ${l.size} · SL ${l.qty}</span></div><span>${vnd(l.lineTotal)}</span></div>`)}
            ${summaryHTML(quote, { checkout: true })}
            <p class="alert alert-error" id="form-error" role="alert" hidden></p>
            <button class="btn btn-primary btn-block" type="submit" id="place-order">Đặt hàng</button>
            <a class="btn btn-ghost btn-block" href="#/cart">Quay lại giỏ hàng</a>
          </aside>
        </form>
      </div>`.toString();
    bind();
  }

  function bind() {
    const form = $('#checkout-form', main);
    $('#addr-pick', main)?.addEventListener('change', (e) => {
      const a = addresses.find((x) => String(x.id) === e.target.value) || { fullName: state.user.name, phone: state.user.phone || '', line: '', district: '', city: '' };
      ['fullName', 'phone', 'line', 'district', 'city'].forEach((k) => { $(`#${k}`, main).value = a[k] || ''; });
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const shipping = Object.fromEntries(['fullName', 'phone', 'line', 'district', 'city'].map((k) => [k, String(fd.get(k) || '').trim()]));
      let ok = true;
      $$('[data-err]', main).forEach((el) => { el.hidden = true; $(`#${el.dataset.err}`, main).removeAttribute('aria-invalid'); });
      const fail = (k, t) => { const el = $(`[data-err="${k}"]`, main); el.textContent = t; el.hidden = false; $(`#${k}`, main).setAttribute('aria-invalid', 'true'); if (ok) $(`#${k}`, main).focus(); ok = false; };
      if (!shipping.fullName) fail('fullName', 'Vui lòng nhập họ tên.');
      if (!/^(0|\+84)\d{9,10}$/.test(shipping.phone.replace(/[\s.-]/g, ''))) fail('phone', 'Số điện thoại không hợp lệ.');
      if (!shipping.line) fail('line', 'Vui lòng nhập địa chỉ.');
      if (!shipping.district) fail('district', 'Vui lòng nhập quận/huyện.');
      if (!shipping.city) fail('city', 'Vui lòng nhập tỉnh/thành phố.');
      if (!ok) return;
      const btn = $('#place-order', main);
      const err = $('#form-error', main);
      err.hidden = true; btn.disabled = true; btn.textContent = 'Đang đặt hàng…';
      try {
        const { order } = await api('/orders', { method: 'POST', body: { items: state.cart, coupon: getCoupon(), shipping, paymentMethod: fd.get('payment'), note: fd.get('note') } });
        clearCart(); setCoupon('');
        navigate(`/orders/${order.code}?placed=1`);
      } catch (e2) {
        btn.disabled = false; btn.textContent = 'Đặt hàng';
        if (e2 instanceof ApiError && e2.status === 409 && e2.data.quote) {
          quote = e2.data.quote; syncCartWithQuote(quote);
          if (!quote.lines.length) { toast(e2.message, 'error'); navigate('/cart'); return; }
          render(e2.message);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        err.textContent = e2.message; err.hidden = false;
      }
    });
  }

  render();
  return { cleanup() {} };
}

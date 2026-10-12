// Lịch sử đơn hàng, chi tiết đơn, yêu thích, trang chính sách và 404
import { html, raw, $, vnd, fmtDate, STATUS_LABEL, PAYMENT_LABEL } from '../util.js';
import { api } from '../api.js';
import { setTitle, navigate } from '../router.js';
import { state } from '../store.js';
import { productCard, bindCards, skeletonGrid, stateBox } from '../components/productCard.js';
import { toast, confirmDialog } from '../components/ui.js';
import { summaryHTML } from './cart.js';

function needLogin(next) { navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true }); }

export async function ordersPage(main, ctx) {
  setTitle('Đơn hàng của tôi');
  if (!state.user) return needLogin('/orders');
  main.innerHTML = html`<div class="container"><div class="page-head"><h1>Đơn hàng của tôi</h1></div><div class="skeleton" style="height:160px"></div></div>`.toString();
  try {
    const { orders } = await api('/orders');
    if (!ctx.isCurrent()) return;
    main.innerHTML = html`<div class="container" style="padding-bottom:3rem"><div class="page-head"><h1>Đơn hàng của tôi</h1></div>
      ${orders.length ? orders.map((o) => html`
        <article class="order-card">
          <div class="order-head"><div><strong>Đơn ${o.code}</strong><br><span class="muted">${fmtDate(o.createdAt)}</span></div>
            <span class="status status-${o.status}">${STATUS_LABEL[o.status]}</span></div>
          <div class="order-thumbs">${o.items.slice(0, 5).map((i) => html`<img src="${i.image}" alt="${i.name}" width="56" height="56" loading="lazy">`)}</div>
          <div class="order-head"><span>${o.items.reduce((s, i) => s + i.qty, 0)} sản phẩm · <strong>${vnd(o.total)}</strong></span>
            <a class="btn btn-secondary btn-sm" href="#/orders/${o.code}">Xem chi tiết</a></div>
        </article>`) : stateBox({ title: 'Bạn chưa có đơn hàng nào', text: 'Khi đặt hàng, đơn sẽ xuất hiện tại đây.', actionLabel: 'Bắt đầu mua sắm', actionHref: '#/shop' })}
    </div>`.toString();
  } catch (err) {
    if (!ctx.isCurrent()) return;
    if (err.status === 401) return needLogin('/orders');
    main.innerHTML = html`<div class="container">${stateBox({ title: 'Không tải được đơn hàng', text: err.message, actionLabel: 'Thử lại', actionId: 'retry-o' })}</div>`.toString();
    $('#retry-o', main)?.addEventListener('click', () => ordersPage(main, ctx));
  }
}

const FLOW = ['pending', 'confirmed', 'shipping', 'delivered'];

export async function orderDetailPage(main, ctx) {
  setTitle(`Đơn ${ctx.params.code}`);
  if (!state.user) return needLogin(`/orders/${ctx.params.code}`);
  main.innerHTML = html`<div class="container"><div class="skeleton" style="height:240px;margin-top:2rem"></div></div>`.toString();
  async function load() {
    try {
      const { order: o } = await api(`/orders/${encodeURIComponent(ctx.params.code)}`);
      if (!ctx.isCurrent()) return;
      const idx = FLOW.indexOf(o.status);
      main.innerHTML = html`<div class="container" style="padding-bottom:3rem">
        <nav class="crumbs" aria-label="Đường dẫn"><a href="#/orders">Đơn hàng</a> / <span aria-current="page">${o.code}</span></nav>
        <div class="page-head"><h1>Đơn ${o.code}</h1><p class="muted">Đặt lúc ${fmtDate(o.createdAt)}</p></div>
        ${ctx.query.placed ? html`<div class="alert alert-success" role="status" style="margin-bottom:1rem"><strong>Đặt hàng thành công.</strong> Đơn đang ở trạng thái “${STATUS_LABEL[o.status]}”.
          ${o.paymentMethod === 'bank_transfer' ? ' Cửa hàng sẽ liên hệ hướng dẫn chuyển khoản; thanh toán chỉ được xác nhận sau khi cửa hàng nhận tiền.' : ' Bạn sẽ thanh toán khi nhận hàng.'}</div>` : ''}
        <div class="row" style="margin-bottom:1.5rem"><span class="status status-${o.status}">${STATUS_LABEL[o.status]}</span>
          <span class="status">${o.paymentStatus === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}</span></div>
        ${o.status !== 'cancelled' ? html`<ol class="timeline" aria-label="Tiến trình đơn hàng">${FLOW.map((s, i) => html`<li class="${i <= idx ? 'done' : ''}" ${i === idx ? raw('aria-current="step"') : ''}>${STATUS_LABEL[s]}</li>`)}</ol>` : ''}
        <div class="cart-layout" style="margin-top:2rem">
          <section aria-label="Sản phẩm trong đơn">
            ${o.items.map((i) => html`<article class="cart-line" style="grid-template-columns:96px 1fr auto">
              <a href="#/product/${i.slug}"><img src="${i.image}" alt="${i.name}" width="96" height="96" style="width:96px;height:96px"></a>
              <div><a class="name" href="#/product/${i.slug}">${i.name}</a><p class="muted">Màu ${i.color} · Size ${i.size} · SL ${i.qty}</p><p>${vnd(i.unitPrice)}</p></div>
              <div class="line-total">${vnd(i.lineTotal)}</div></article>`)}
          </section>
          <aside class="summary"><h2>Chi tiết thanh toán</h2>
            ${summaryHTML({ subtotal: o.subtotal, discount: o.discount, coupon: { code: o.couponCode }, shipping: o.shipping, total: o.total, freeShippingThreshold: 0 })}
            <p><strong>Phương thức:</strong> ${PAYMENT_LABEL[o.paymentMethod]}</p>
            <p><strong>Giao đến:</strong><br>${o.shipName} · ${o.shipPhone}<br>${o.shipAddress}</p>
            ${o.note ? html`<p><strong>Ghi chú:</strong> ${o.note}</p>` : ''}
            ${o.status === 'pending' ? html`<button class="btn btn-danger btn-block" type="button" id="cancel-order">Hủy đơn hàng</button>` : ''}
          </aside></div></div>`.toString();
      $('#cancel-order', main)?.addEventListener('click', async () => {
        if (!(await confirmDialog('Bạn chắc chắn muốn hủy đơn hàng này?', 'Hủy đơn'))) return;
        try { await api(`/orders/${o.code}/cancel`, { method: 'POST' }); toast('Đã hủy đơn hàng.'); load(); }
        catch (e) { toast(e.message, 'error'); }
      });
    } catch (err) {
      if (!ctx.isCurrent()) return;
      if (err.status === 401) return needLogin(`/orders/${ctx.params.code}`);
      main.innerHTML = html`<div class="container">${stateBox({ title: err.status === 404 ? 'Không tìm thấy đơn hàng' : 'Không tải được đơn hàng', text: err.message, actionLabel: 'Về danh sách đơn hàng', actionHref: '#/orders' })}</div>`.toString();
    }
  }
  await load();
}

export async function wishlistPage(main, ctx) {
  setTitle('Yêu thích');
  if (!state.user) return needLogin('/wishlist');
  main.innerHTML = html`<div class="container"><div class="page-head"><h1>Danh sách yêu thích</h1></div>${skeletonGrid(4)}</div>`.toString();
  async function load() {
    try {
      const { products } = await api('/wishlist');
      if (!ctx.isCurrent()) return;
      main.innerHTML = html`<div class="container" style="padding-bottom:3rem"><div class="page-head"><h1>Danh sách yêu thích</h1></div>
        ${products.length ? html`<div class="product-grid">${products.map((p) => productCard(p))}</div>` : stateBox({ title: 'Chưa có sản phẩm yêu thích', text: 'Nhấn biểu tượng trái tim trên sản phẩm để lưu lại.', actionLabel: 'Khám phá sản phẩm', actionHref: '#/shop' })}</div>`.toString();
      bindCards(main, { onWishChange: (id, on) => { if (!on) { $(`.product-card[data-id="${id}"]`, main)?.remove(); if (!$('.product-card', main)) load(); } } });
    } catch (err) {
      if (!ctx.isCurrent()) return;
      main.innerHTML = html`<div class="container">${stateBox({ title: 'Không tải được danh sách', text: err.message, actionLabel: 'Thử lại', actionId: 'retry-w' })}</div>`.toString();
      $('#retry-w', main)?.addEventListener('click', load);
    }
  }
  await load();
}

export async function policyPage(main) {
  setTitle('Giao hàng & thanh toán');
  const c = state.config;
  main.innerHTML = html`<div class="container" style="max-width:760px;padding-bottom:3rem">
    <div class="page-head"><h1>Giao hàng & thanh toán</h1></div>
    <div class="stack">
      <h2>Phí giao hàng</h2>
      <p>Phí giao hàng hiện tại là <strong>${vnd(c.shippingFee)}</strong> cho mỗi đơn. Đơn từ <strong>${vnd(c.freeShippingThreshold)}</strong> (sau khi trừ giảm giá) được miễn phí giao hàng. Phí được hệ thống tính tự động khi thanh toán.</p>
      <h2>Phương thức thanh toán</h2>
      <p>Cửa hàng hỗ trợ thanh toán khi nhận hàng (COD) và chuyển khoản. Với chuyển khoản, cửa hàng xác nhận thanh toán thủ công sau khi nhận được tiền; hệ thống chưa tích hợp cổng thanh toán trực tuyến.</p>
      <h2>Hủy đơn hàng</h2>
      <p>Bạn có thể tự hủy đơn khi đơn đang ở trạng thái “Chờ xác nhận”. Với các trạng thái khác, vui lòng liên hệ cửa hàng.</p>
      <h2>Giới hạn số lượng</h2>
      <p>Tối đa ${c.maxQtyPerLine} đôi cho mỗi sản phẩm (cùng màu, cùng size) trong một đơn.</p>
      <p class="alert">Chính sách đổi trả và bảo hành chưa được cửa hàng cung cấp nội dung xác nhận nên chưa được hiển thị tại đây.</p>
    </div></div>`.toString();
}

export async function notFoundPage(main) {
  setTitle('Không tìm thấy trang');
  main.innerHTML = html`<div class="container">${stateBox({ title: 'Không tìm thấy trang', text: 'Đường dẫn bạn truy cập không tồn tại.', actionLabel: 'Về trang chủ', actionHref: '#/' })}</div>`.toString();
}

// Trang chủ
import { html, $ } from '../util.js';
import { api } from '../api.js';
import { setTitle } from '../router.js';
import { productCard, bindCards, skeletonGrid, stateBox } from '../components/productCard.js';
import { state } from '../store.js';

const TILES = [
  { label: 'Giày nam', href: '/shop?gender=nam', img: '/assets/products/court-classic.jpg', alt: 'Giày sneaker nam màu trắng' },
  { label: 'Giày nữ', href: '/shop?gender=nu', img: '/assets/products/pulse-knit.jpg', alt: 'Giày chạy nữ màu hồng' },
  { label: 'Thể thao', href: '/shop?sport=1', img: '/assets/products/sprint-elite.jpg', alt: 'Giày chạy bộ màu xanh' },
  { label: 'Giảm giá', href: '/shop?sale=1', img: '/assets/products/hardwood-pro.jpg', alt: 'Giày bóng rổ đang giảm giá' },
];

export async function homePage(main, ctx) {
  setTitle('');
  main.innerHTML = html`
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-inner">
        <img src="/assets/hero.jpg" alt="Đôi giày chạy bộ đen trắng với điểm nhấn vàng chanh" width="1600" height="900" fetchpriority="high">
        <div class="hero-copy">
          <p class="eyebrow">Bộ sưu tập mới</p>
          <h1 id="hero-title">Chạy đúng nhịp<br>của bạn</h1>
          <p>Giày thể thao tuyển chọn cho chạy bộ, bóng rổ, dã ngoại và phong cách hằng ngày. Không biết chọn đôi nào? Hỏi trợ lý AI.</p>
          <div class="row">
            <a class="btn btn-primary" href="#/shop?isNew=1">Mua hàng mới</a>
            <a class="btn btn-secondary" href="#/shop">Xem tất cả</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section container" aria-labelledby="cat-title">
      <div class="section-head"><h2 class="section-title" id="cat-title">Mua theo danh mục</h2></div>
      <div class="category-tiles">
        ${TILES.map((t) => html`<a class="tile" href="#${t.href}"><img src="${t.img}" alt="${t.alt}" loading="lazy" width="800" height="800"><span>${t.label}</span></a>`)}
      </div>
    </section>

    <section class="section container" aria-labelledby="new-title" style="padding-top:0">
      <div class="section-head"><h2 class="section-title" id="new-title">Sản phẩm mới</h2><a class="btn-ghost btn" href="#/shop?isNew=1">Xem tất cả</a></div>
      <div id="new-grid">${skeletonGrid(4)}</div>
    </section>

    <section class="container" aria-labelledby="ai-promo-title" style="padding-bottom:var(--space-7)">
      <div class="promo-band">
        <div class="copy">
          <p class="eyebrow">Trợ lý mua sắm</p>
          <h2 id="ai-promo-title">Chọn giày theo cách của bạn</h2>
          <p class="muted">Cho trợ lý biết mục đích, ngân sách và size. Trợ lý chỉ gợi ý từ sản phẩm đang bán và còn hàng.</p>
          <div><button class="btn btn-primary" type="button" id="open-ai">Hỏi trợ lý AI</button></div>
        </div>
        <img src="/assets/products/trail-ridge.jpg" alt="Giày dã ngoại màu đen đế gai" loading="lazy" width="800" height="800">
      </div>
    </section>

    <section class="container" aria-labelledby="sale-title" id="sale-section" hidden style="padding-bottom:var(--space-7)">
      <div class="section-head"><h2 class="section-title" id="sale-title">Đang giảm giá</h2><a class="btn-ghost btn" href="#/shop?sale=1">Xem tất cả</a></div>
      <div id="sale-grid"></div>
    </section>`.toString();

  $('#open-ai', main).addEventListener('click', () => $('#ai-fab')?.click());
  bindCards(main);

  try {
    const [news, sale] = await Promise.all([
      api('/products?isNew=1&sort=new'),
      api('/products?sale=1'),
    ]);
    if (!ctx.isCurrent()) return;
    const ng = $('#new-grid', main);
    ng.innerHTML = news.products.length
      ? html`<div class="product-grid">${news.products.slice(0, 4).map((p) => productCard(p))}</div>`.toString()
      : stateBox({ title: 'Chưa có sản phẩm mới', text: 'Hãy xem toàn bộ sản phẩm đang bán.', actionLabel: 'Xem tất cả', actionHref: '#/shop' }).toString();
    if (sale.products.length) {
      $('#sale-section', main).hidden = false;
      $('#sale-grid', main).innerHTML = html`<div class="product-grid">${sale.products.slice(0, 4).map((p) => productCard(p))}</div>`.toString();
    }
  } catch (err) {
    if (!ctx.isCurrent()) return;
    $('#new-grid', main).innerHTML = stateBox({ title: 'Không tải được sản phẩm', text: err.message, actionLabel: 'Thử lại', actionId: 'retry-home' }).toString();
    $('#retry-home', main)?.addEventListener('click', () => homePage(main, ctx));
  }
  return { cleanup() {} };
}

export { state };

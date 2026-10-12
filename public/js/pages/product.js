// Chi tiết sản phẩm: biến thể thật (màu/size), tồn kho theo biến thể, thêm giỏ hàng
import { html, raw, $, $$, vnd, GENDER_LABEL } from '../util.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { setTitle, navigate } from '../router.js';
import { state, addToCart, toggleWishlist } from '../store.js';
import { productCard, bindCards, stateBox } from '../components/productCard.js';
import { toast } from '../components/ui.js';

export async function productPage(main, ctx) {
  setTitle('Đang tải…');
  main.innerHTML = html`<div class="container pdp" aria-busy="true"><div class="skeleton" style="aspect-ratio:1"></div><div><div class="skeleton" style="height:40px;width:70%"></div><div class="skeleton" style="height:24px;width:30%;margin-top:16px"></div></div></div>`.toString();
  let data;
  try {
    data = await api(`/products/${encodeURIComponent(ctx.params.slug)}`);
  } catch (err) {
    if (!ctx.isCurrent()) return;
    setTitle('Không tìm thấy sản phẩm');
    main.innerHTML = html`<div class="container">${stateBox(err.status === 404
      ? { title: 'Không tìm thấy sản phẩm', text: 'Sản phẩm có thể đã ngừng bán hoặc đường dẫn không đúng.', actionLabel: 'Về cửa hàng', actionHref: '#/shop' }
      : { title: 'Không tải được sản phẩm', text: err.message, actionLabel: 'Thử lại', actionId: 'retry-pdp' })}</div>`.toString();
    $('#retry-pdp', main)?.addEventListener('click', () => productPage(main, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;
  const p = data.product;
  const max = (state.config && state.config.maxQtyPerLine) || 5;
  const sel = { color: p.colors.length === 1 ? p.colors[0] : null, variant: null, qty: 1, image: 0 };
  setTitle(p.name);

  main.innerHTML = html`
    <div class="container">
      <nav class="crumbs" aria-label="Đường dẫn"><a href="#/">Trang chủ</a> / <a href="#/shop?category=${encodeURIComponent(p.category)}">${p.category}</a> / <span aria-current="page">${p.name}</span></nav>
      <div class="pdp">
        <div class="gallery ${p.images.length > 1 ? '' : 'single'}" id="gallery"></div>
        <div class="pdp-info">
          <div><p class="eyebrow" style="margin:0">${p.category} · ${GENDER_LABEL[p.gender]}</p>
          <h1>${p.name}</h1></div>
          <div class="pdp-price">
            ${p.salePrice ? html`<span class="text-sale">${vnd(p.salePrice)}</span><span class="old">${vnd(p.price)}</span><span class="badge badge-sale">-${p.discountPercent}%</span>` : html`<span>${vnd(p.price)}</span>`}
          </div>
          <p>${p.description}</p>
          ${p.colors.length ? html`<div class="field"><span class="field-label" id="color-label">Màu sắc: <strong id="color-val">${sel.color || 'Chọn màu'}</strong></span>
            <div class="swatches" role="radiogroup" aria-labelledby="color-label">${p.colors.map((c) => html`<button type="button" role="radio" aria-checked="${sel.color === c}" data-color="${c}">${c}</button>`)}</div></div>` : ''}
          <div class="field"><span class="field-label" id="size-label">Chọn size</span>
            <div class="size-grid" id="size-grid" role="radiogroup" aria-labelledby="size-label"></div>
            <p class="field-error" id="size-error" role="alert" hidden>Vui lòng chọn size trước khi thêm vào giỏ hàng.</p></div>
          <p class="stock-note" id="stock-note" aria-live="polite"></p>
          <div class="row">
            <div class="qty" role="group" aria-label="Số lượng">
              <button type="button" id="qty-minus" aria-label="Giảm số lượng">${icon('minus', 'icon icon-sm')}</button>
              <output id="qty-val" aria-live="polite">1</output>
              <button type="button" id="qty-plus" aria-label="Tăng số lượng">${icon('plus', 'icon icon-sm')}</button>
            </div>
          </div>
          <div class="row" style="flex-wrap:nowrap">
            <button class="btn btn-primary" style="flex:1" type="button" id="add-cart">Thêm vào giỏ hàng</button>
            <button class="icon-btn" style="border:1px solid var(--color-gray-300);border-radius:4px;width:48px;height:48px" type="button" id="wish-btn" aria-pressed="false" aria-label="Thêm vào yêu thích"></button>
          </div>
          <dl class="spec-list">
            <dt>Danh mục</dt><dd>${p.category}</dd>
            <dt>Dành cho</dt><dd>${GENDER_LABEL[p.gender]}</dd>
            ${p.isDemo ? html`<dt>Ghi chú</dt><dd>Sản phẩm demo (dữ liệu mẫu).</dd>` : ''}
          </dl>
        </div>
      </div>
      ${data.related.length ? html`<section class="section" style="padding-top:0" aria-labelledby="rel-title"><div class="section-head"><h2 class="section-title" id="rel-title">Có thể bạn cũng thích</h2></div>
        <div class="product-grid">${data.related.map((r) => productCard(r))}</div></section>` : ''}
    </div>`.toString();

  bindCards(main);

  function renderGallery() {
    const g = $('#gallery', main);
    const imgs = p.images;
    if (!imgs.length) { g.innerHTML = '<div class="main skeleton" style="aspect-ratio:1" role="img" aria-label="Chưa có ảnh sản phẩm"></div>'; return; }
    g.innerHTML = html`
      ${imgs.length > 1 ? html`<div class="thumbs">${imgs.map((src, i) => html`<button type="button" data-img="${i}" aria-label="Xem ảnh ${i + 1}" aria-current="${i === sel.image}"><img src="${src}" alt="" width="84" height="84"></button>`)}</div>` : ''}
      <div class="main"><img src="${imgs[sel.image]}" alt="${p.name}, ảnh ${sel.image + 1}" width="800" height="800" fetchpriority="high"></div>`.toString();
  }
  renderGallery();
  $('#gallery', main).addEventListener('click', (e) => { const b = e.target.closest('[data-img]'); if (b) { sel.image = Number(b.dataset.img); renderGallery(); } });

  function variantsForColor() { return p.variants.filter((v) => !sel.color || v.color === sel.color); }

  function renderSizes() {
    const vs = variantsForColor();
    $('#size-grid', main).innerHTML = vs.map((v) => html`<button type="button" role="radio" data-vid="${v.variantId}" aria-checked="${sel.variant === v.variantId}" ${v.stock <= 0 ? raw('disabled aria-label="Size ' + v.size + ', hết hàng"') : raw(`aria-label="Size ${v.size}"`)}>${v.size}</button>`.toString()).join('')
      || '<p class="muted">Chọn màu để xem size.</p>';
    if (!sel.color && p.colors.length > 1) $('#size-grid', main).innerHTML = '<p class="muted" style="grid-column:1/-1">Vui lòng chọn màu để xem các size.</p>';
  }

  function currentVariant() { return p.variants.find((v) => v.variantId === sel.variant); }

  function updateStock() {
    const v = currentVariant();
    const note = $('#stock-note', main);
    note.className = 'stock-note';
    if (!p.inStock) { note.textContent = 'Sản phẩm tạm hết hàng.'; note.classList.add('out'); }
    else if (!v) note.textContent = '';
    else if (v.stock <= 0) { note.textContent = 'Size này đã hết hàng.'; note.classList.add('out'); }
    else if (v.stock <= 5) { note.textContent = `Chỉ còn ${v.stock} đôi ở size ${v.size}.`; note.classList.add('low'); }
    else note.textContent = `Còn hàng (size ${v.size}).`;
    const limit = v ? Math.min(v.stock, max) : max;
    if (sel.qty > limit) sel.qty = Math.max(1, limit);
    $('#qty-val', main).textContent = sel.qty;
    $('#qty-minus', main).disabled = sel.qty <= 1;
    $('#qty-plus', main).disabled = !!v && sel.qty >= limit;
    $('#add-cart', main).disabled = !p.inStock;
  }

  renderSizes(); updateStock();

  $('.swatches', main)?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]'); if (!b) return;
    sel.color = b.dataset.color; sel.variant = null;
    $$('.swatches button', main).forEach((x) => x.setAttribute('aria-checked', x.dataset.color === sel.color));
    $('#color-val', main).textContent = sel.color;
    renderSizes(); updateStock();
  });
  $('#size-grid', main).addEventListener('click', (e) => {
    const b = e.target.closest('[data-vid]'); if (!b || b.disabled) return;
    sel.variant = Number(b.dataset.vid);
    $$('#size-grid button', main).forEach((x) => x.setAttribute('aria-checked', x.dataset.vid === String(sel.variant)));
    $('#size-error', main).hidden = true;
    $('#size-grid', main).classList.remove('invalid');
    updateStock();
  });
  $('#qty-minus', main).addEventListener('click', () => { sel.qty = Math.max(1, sel.qty - 1); updateStock(); });
  $('#qty-plus', main).addEventListener('click', () => { sel.qty += 1; updateStock(); });

  $('#add-cart', main).addEventListener('click', () => {
    const v = currentVariant();
    if (!v) {
      if (p.colors.length > 1 && !sel.color) toast('Vui lòng chọn màu và size.', 'error');
      $('#size-error', main).hidden = false;
      $('#size-grid', main).classList.add('invalid');
      $('#size-grid button:not(:disabled)', main)?.focus();
      return;
    }
    if (v.stock <= 0) return;
    addToCart(v.variantId, sel.qty, Math.min(v.stock, max));
    toast(`Đã thêm ${p.name} (size ${v.size}) vào giỏ hàng.`);
  });

  const wish = $('#wish-btn', main);
  function paintWish() {
    const on = state.wishlist.has(p.id);
    wish.setAttribute('aria-pressed', on);
    wish.setAttribute('aria-label', on ? 'Bỏ khỏi yêu thích' : 'Thêm vào yêu thích');
    wish.innerHTML = icon('heart', on ? 'icon icon-fill' : 'icon').toString();
  }
  paintWish();
  wish.addEventListener('click', async () => {
    if (!state.user) { toast('Vui lòng đăng nhập để lưu sản phẩm yêu thích.'); navigate(`/login?next=${encodeURIComponent(location.hash.slice(1))}`); return; }
    try { await toggleWishlist(p.id); paintWish(); } catch (err) { toast(err.message, 'error'); }
  });
  return { cleanup() {} };
}

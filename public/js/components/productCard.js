// Thẻ sản phẩm dùng lại ở trang chủ, danh sách, yêu thích, sản phẩm liên quan
import { html, raw, vnd, GENDER_LABEL, $$ } from '../util.js';
import { icon } from '../icons.js';
import { state, toggleWishlist } from '../store.js';
import { toast } from './ui.js';
import { navigate } from '../router.js';

export function productCard(p, { lazy = true } = {}) {
  const wished = state.wishlist.has(p.id);
  const img = p.images[0];
  const alt = p.images[1];
  const lazyAttr = lazy ? raw('loading="lazy"') : '';
  return html`
    <article class="product-card" data-id="${p.id}">
      <div class="media">
        ${img ? html`<img src="${img}" alt="${p.name} – ${p.colors.join(', ')}" ${lazyAttr} width="800" height="800">` : ''}
        ${alt ? html`<img class="alt" src="${alt}" alt="" loading="lazy" width="800" height="800">` : ''}
        <div class="badges">
          ${p.isNew ? html`<span class="badge badge-solid">Mới</span>` : ''}
          ${p.salePrice ? html`<span class="badge badge-sale">-${p.discountPercent}%</span>` : ''}
        </div>
        <button class="icon-btn wish" type="button" data-wish="${p.id}" aria-pressed="${wished}" aria-label="${wished ? 'Bỏ' : 'Thêm'} ${p.name} ${wished ? 'khỏi' : 'vào'} yêu thích">
          ${icon('heart', wished ? 'icon icon-fill' : 'icon')}
        </button>
      </div>
      <div class="info">
        <a class="name overlay-link" href="#/product/${p.slug}">${p.name}</a>
        <span class="meta">${p.category} · ${GENDER_LABEL[p.gender]}</span>
        <span class="meta">${p.colors.join(', ')}</span>
        <span class="price">
          ${p.salePrice
            ? html`<span class="now sale">${vnd(p.salePrice)}</span><span class="old">${vnd(p.price)}</span>`
            : html`<span class="now">${vnd(p.price)}</span>`}
        </span>
        ${p.inStock ? '' : html`<span class="sold-out">Tạm hết hàng</span>`}
      </div>
    </article>`;
}

/** Gắn sự kiện nút yêu thích cho mọi thẻ trong container. */
export function bindCards(root, { onWishChange } = {}) {
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-wish]');
    if (!btn) return;
    e.preventDefault();
    if (!state.user) {
      toast('Vui lòng đăng nhập để lưu sản phẩm yêu thích.');
      navigate(`/login?next=${encodeURIComponent(location.hash.slice(1))}`);
      return;
    }
    try {
      await toggleWishlist(Number(btn.dataset.wish));
      const on = state.wishlist.has(Number(btn.dataset.wish));
      btn.setAttribute('aria-pressed', on);
      btn.innerHTML = icon('heart', on ? 'icon icon-fill' : 'icon').toString();
      if (onWishChange) onWishChange(Number(btn.dataset.wish), on);
    } catch (err) { toast(err.message, 'error'); }
  });
}

export function skeletonGrid(n = 8) {
  return html`<div class="product-grid" aria-hidden="true">${Array.from({ length: n }, () =>
    html`<div><div class="skeleton" style="aspect-ratio:1"></div><div class="skeleton" style="height:16px;margin-top:12px;width:70%"></div><div class="skeleton" style="height:14px;margin-top:8px;width:40%"></div></div>`)}</div>`;
}

export function stateBox({ title, text, actionLabel, actionHref, actionId }) {
  return html`<div class="state-box"><h2>${title}</h2>${text ? html`<p>${text}</p>` : ''}
    ${actionLabel ? (actionHref ? html`<a class="btn btn-primary" href="${actionHref}">${actionLabel}</a>` : html`<button class="btn btn-primary" type="button" id="${actionId || 'state-action'}">${actionLabel}</button>`) : ''}</div>`;
}

export { $$ };

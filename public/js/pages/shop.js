// Danh sách sản phẩm: tìm kiếm, lọc, sắp xếp (kết nối API /api/products)
import { html, raw, $, $$, debounce, vnd, GENDER_LABEL, trapFocus } from '../util.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { setTitle, replaceQuery, parseHash } from '../router.js';
import { productCard, bindCards, skeletonGrid, stateBox } from '../components/productCard.js';

let facetCache = null;
const FILTER_KEYS = ['q', 'gender', 'category', 'color', 'size', 'min', 'max', 'inStock', 'sale', 'isNew', 'sport', 'sort'];

function pageTitle(q) {
  if (q.q) return `Kết quả cho “${q.q}”`;
  if (q.isNew === '1') return 'Hàng mới';
  if (q.sale === '1') return 'Giảm giá';
  if (q.sport === '1') return 'Giày thể thao';
  if (q.gender === 'nam') return 'Giày nam';
  if (q.gender === 'nu') return 'Giày nữ';
  if (q.category) return q.category;
  return 'Tất cả sản phẩm';
}

export async function shopPage(main, ctx) {
  let q = { ...ctx.query };
  let ctl = null;
  let releaseFilters = null;

  main.innerHTML = html`
    <div class="container">
      <div class="page-head"><h1 id="shop-title"></h1><p class="muted" id="shop-count" aria-live="polite"></p></div>
      <div class="shop-layout">
        <aside class="filters" id="filters" aria-label="Bộ lọc sản phẩm"></aside>
        <section aria-labelledby="shop-title">
          <div class="toolbar">
            <button class="btn btn-secondary btn-sm filter-toggle" type="button" id="filter-toggle" aria-expanded="false" aria-controls="filters">${icon('filter', 'icon icon-sm')} Bộ lọc</button>
            <div class="field" style="flex-direction:row;align-items:center;margin-left:auto">
              <label for="sort">Sắp xếp</label>
              <select class="select" id="sort">
                <option value="">Mới nhất</option>
                <option value="price_asc">Giá tăng dần</option>
                <option value="price_desc">Giá giảm dần</option>
                <option value="name">Tên A–Z</option>
              </select>
            </div>
          </div>
          <div class="active-filters" id="active-filters"></div>
          <div id="results">${skeletonGrid(8)}</div>
        </section>
      </div>
    </div>`.toString();

  const filtersEl = $('#filters', main);

  async function ensureFacets() {
    if (!facetCache) { try { facetCache = await api('/products/facets'); } catch { facetCache = { categories: [], colors: [], sizes: [], minPrice: 0, maxPrice: 0 }; } }
    return facetCache;
  }

  function renderFilters(f) {
    const radio = (name, value, label) => html`<label class="check"><input type="radio" name="${name}" value="${value}" ${q[name] === value || (!q[name] && value === '') ? raw('checked') : ''}> ${label}</label>`;
    filtersEl.innerHTML = html`
      <div class="row" style="justify-content:space-between" id="filter-head-mobile"><strong>Bộ lọc</strong><button class="icon-btn filter-close" type="button" aria-label="Đóng bộ lọc" id="filter-close" hidden>${icon('close')}</button></div>
      <form id="filter-form" class="stack" autocomplete="off">
        <div class="filter-group"><h2>Giới tính</h2>
          ${radio('gender', '', 'Tất cả')}${['nam', 'nu'].map((g) => radio('gender', g, GENDER_LABEL[g]))}</div>
        ${f.categories.length ? html`<div class="filter-group"><h2>Danh mục</h2>
          ${radio('category', '', 'Tất cả')}${f.categories.map((c) => radio('category', c, c))}</div>` : ''}
        ${f.colors.length ? html`<div class="filter-group"><h2>Màu sắc</h2>
          ${radio('color', '', 'Tất cả')}${f.colors.map((c) => radio('color', c, c))}</div>` : ''}
        ${f.sizes.length ? html`<div class="filter-group"><h2>Size (còn hàng)</h2>
          <div class="size-picks" role="group" aria-label="Chọn size">${f.sizes.map((s) => html`<button type="button" data-size="${s}" aria-pressed="${q.size === String(s)}">${s}</button>`)}</div></div>` : ''}
        <div class="filter-group"><h2>Khoảng giá (đ)</h2>
          <div class="row" style="flex-wrap:nowrap">
            <div class="field"><label class="sr-only" for="min">Giá từ</label><input class="input" id="min" name="min" inputmode="numeric" placeholder="Từ" value="${q.min || ''}"></div>
            <div class="field"><label class="sr-only" for="max">Giá đến</label><input class="input" id="max" name="max" inputmode="numeric" placeholder="Đến" value="${q.max || ''}"></div>
          </div>
          ${f.maxPrice ? html`<p class="field-hint" style="margin-top:.5rem">Hiện có từ ${vnd(f.minPrice)} đến ${vnd(f.maxPrice)}</p>` : ''}
        </div>
        <div class="filter-group">
          <label class="check"><input type="checkbox" name="inStock" ${q.inStock === '1' ? raw('checked') : ''}> Chỉ hiện sản phẩm còn hàng</label>
          <label class="check"><input type="checkbox" name="sale" ${q.sale === '1' ? raw('checked') : ''}> Đang giảm giá</label>
          <label class="check"><input type="checkbox" name="isNew" ${q.isNew === '1' ? raw('checked') : ''}> Hàng mới</label>
        </div>
        <button class="btn btn-secondary btn-block" type="button" id="clear-filters">Xóa bộ lọc</button>
      </form>`.toString();
    $('#sort', main).value = q.sort || '';
  }

  function readForm() {
    const form = $('#filter-form', main);
    const fd = new FormData(form);
    const next = { q: q.q || '', sport: q.sport || '', sort: $('#sort', main).value };
    ['gender', 'category', 'color'].forEach((k) => { next[k] = fd.get(k) || ''; });
    next.size = q.size || '';
    next.min = (fd.get('min') || '').replace(/\D/g, '');
    next.max = (fd.get('max') || '').replace(/\D/g, '');
    ['inStock', 'sale', 'isNew'].forEach((k) => { next[k] = fd.get(k) ? '1' : ''; });
    return next;
  }

  async function load() {
    if (ctl) ctl.abort();
    ctl = new AbortController();
    const params = new URLSearchParams();
    FILTER_KEYS.forEach((k) => { if (q[k]) params.set(k, q[k]); });
    $('#shop-title', main).textContent = pageTitle(q);
    setTitle(pageTitle(q));
    const results = $('#results', main);
    results.innerHTML = skeletonGrid(8).toString();
    renderActive();
    try {
      const data = await api(`/products?${params}`, { signal: ctl.signal });
      if (!ctx.isCurrent()) return;
      $('#shop-count', main).textContent = `${data.products.length} sản phẩm`;
      results.innerHTML = data.products.length
        ? html`<div class="product-grid">${data.products.map((p, i) => productCard(p, { lazy: i > 3 }))}</div>`.toString()
        : stateBox({ title: q.q ? `Không có kết quả cho “${q.q}”` : 'Không có sản phẩm phù hợp', text: 'Hãy thử bỏ bớt bộ lọc hoặc tìm với từ khóa khác.', actionLabel: 'Xóa bộ lọc', actionId: 'empty-clear' }).toString();
      $('#empty-clear', main)?.addEventListener('click', clearAll);
    } catch (err) {
      if (err.name === 'AbortError' || !ctx.isCurrent()) return;
      results.innerHTML = stateBox({ title: 'Không tải được danh sách sản phẩm', text: err.message, actionLabel: 'Thử lại', actionId: 'retry-shop' }).toString();
      $('#retry-shop', main)?.addEventListener('click', load);
      $('#shop-count', main).textContent = '';
    }
  }

  function renderActive() {
    const chips = [];
    const label = { q: (v) => `Từ khóa: ${v}`, gender: (v) => GENDER_LABEL[v], category: (v) => v, color: (v) => `Màu ${v}`, size: (v) => `Size ${v}`, min: (v) => `Từ ${vnd(v)}`, max: (v) => `Đến ${vnd(v)}`, inStock: () => 'Còn hàng', sale: () => 'Giảm giá', isNew: () => 'Hàng mới' };
    Object.keys(label).forEach((k) => { if (q[k]) chips.push([k, label[k](q[k])]); });
    $('#active-filters', main).innerHTML = chips.map(([k, t]) => html`<button class="chip" type="button" data-remove="${k}" aria-label="Bỏ lọc ${t}">${t} ✕</button>`.toString()).join('');
  }

  function apply(next) {
    q = {};
    FILTER_KEYS.forEach((k) => { if (next[k]) q[k] = next[k]; });
    replaceQuery('/shop', q);
    load();
  }
  function clearAll() { apply({ sort: q.sort }); ensureFacets().then((f) => renderFilters(f)); }

  const f = await ensureFacets();
  if (!ctx.isCurrent()) return;
  renderFilters(f);
  bindCards(main);
  load();

  // Tương tác bộ lọc
  const onChange = debounce(() => apply(readForm()), 350);
  filtersEl.addEventListener('change', (e) => { if (e.target.closest('#filter-form') && e.target.name) apply(readForm()); });
  filtersEl.addEventListener('input', (e) => { if (e.target.name === 'min' || e.target.name === 'max') onChange(); });
  filtersEl.addEventListener('click', (e) => {
    const sz = e.target.closest('[data-size]');
    if (sz) { q.size = q.size === sz.dataset.size ? '' : sz.dataset.size; apply({ ...readForm(), size: q.size }); ensureFacets().then(renderFilters); }
    if (e.target.closest('#clear-filters')) clearAll();
    if (e.target.closest('#filter-close')) closeFilters();
  });
  $('#sort', main).addEventListener('change', () => apply(readForm()));
  $('#active-filters', main).addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove]'); if (!b) return;
    const next = { ...q }; delete next[b.dataset.remove];
    if (b.dataset.remove === 'sport') delete next.sport;
    apply(next); ensureFacets().then(renderFilters);
  });

  // Bộ lọc dạng drawer trên mobile
  const toggle = $('#filter-toggle', main);
  function openFilters() {
    filtersEl.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    $('#filter-close', main).hidden = false;
    document.body.classList.add('no-scroll');
    releaseFilters = trapFocus(filtersEl, closeFilters);
    $('input, button', filtersEl).focus();
  }
  function closeFilters() {
    if (!releaseFilters) return;
    releaseFilters(); releaseFilters = null;
    filtersEl.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    $('#filter-close', main) && ($('#filter-close', main).hidden = true);
    document.body.classList.remove('no-scroll');
  }
  toggle.addEventListener('click', openFilters);

  return { cleanup() { if (ctl) ctl.abort(); closeFilters(); document.body.classList.remove('no-scroll'); } };
}

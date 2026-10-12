// Trang quản trị (chỉ vai trò admin; backend vẫn kiểm tra quyền ở mọi endpoint /api/admin/*)
import { html, raw, $, $$, vnd, fmtDate, STATUS_LABEL, PAYMENT_LABEL, GENDER_LABEL } from '../util.js';
import { api } from '../api.js';
import { setTitle, navigate } from '../router.js';
import { state } from '../store.js';
import { stateBox } from '../components/productCard.js';
import { toast, openModal } from '../components/ui.js';

const TABS = [['', 'Tổng quan'], ['products', 'Sản phẩm'], ['orders', 'Đơn hàng'], ['users', 'Người dùng'], ['coupons', 'Mã giảm giá']];

function shell(main, active, inner) {
  main.innerHTML = html`<div class="container" style="padding-bottom:3rem">
    <div class="page-head"><h1>Quản trị</h1></div>
    <nav class="tabs" aria-label="Mục quản trị">${TABS.map(([k, l]) => html`<a href="#/admin${k ? '/' + k : ''}" ${k === active ? raw('aria-current="page"') : ''}>${l}</a>`)}</nav>
    <div id="admin-body">${inner}</div></div>`.toString();
}

const loading = () => html`<div class="skeleton" style="height:200px"></div>`;
const failBox = (err, id) => stateBox({ title: 'Không tải được dữ liệu', text: err.message, actionLabel: 'Thử lại', actionId: id });

export async function adminPage(main, ctx) {
  setTitle('Quản trị');
  if (!state.user) { navigate(`/login?next=${encodeURIComponent('/admin')}`, { replace: true }); return; }
  if (state.user.role !== 'admin') {
    main.innerHTML = html`<div class="container">${stateBox({ title: 'Bạn không có quyền truy cập', text: 'Trang này chỉ dành cho quản trị viên.', actionLabel: 'Về trang chủ', actionHref: '#/' })}</div>`.toString();
    return;
  }
  const tab = ctx.params.tab || '';
  shell(main, tab, loading());
  const body = () => $('#admin-body', main);
  const run = (fn) => fn().catch((err) => {
    if (!ctx.isCurrent()) return;
    body().innerHTML = failBox(err, 'retry-admin').toString();
    $('#retry-admin', main)?.addEventListener('click', () => adminPage(main, ctx));
  });
  if (tab === '') return run(() => overview(body, ctx));
  if (tab === 'products') return run(() => products(body, ctx));
  if (tab === 'orders') return run(() => orders(body, ctx));
  if (tab === 'users') return run(() => users(body, ctx));
  if (tab === 'coupons') return run(() => coupons(body, ctx));
  body().innerHTML = failBox(new Error('Mục quản trị không tồn tại.'), 'x').toString();
}

async function overview(body, ctx) {
  const s = await api('/admin/stats');
  if (!ctx.isCurrent()) return;
  const maxRev = Math.max(1, ...s.daily.map((d) => d.revenue));
  body().innerHTML = html`
    ${s.demoProducts ? html`<p class="alert alert-warning" style="margin-bottom:1rem">Cơ sở dữ liệu đang chứa ${s.demoProducts} sản phẩm demo (dữ liệu mẫu để phát triển). Mọi số liệu bên dưới được tính từ đơn hàng thực tế trong hệ thống.</p>` : ''}
    <div class="admin-stats">
      <div class="stat"><div class="v">${vnd(s.revenue)}</div><div class="l">Doanh thu (đơn chưa hủy)</div></div>
      <div class="stat"><div class="v">${s.orderCount}</div><div class="l">Tổng số đơn</div></div>
      <div class="stat"><div class="v">${s.productCount}</div><div class="l">Sản phẩm</div></div>
      <div class="stat"><div class="v">${s.userCount}</div><div class="l">Khách hàng</div></div>
    </div>
    <div class="account-grid" style="padding-bottom:0">
      <section class="card"><h2>Doanh thu 7 ngày gần nhất</h2>
        ${s.daily.length ? html`<div class="bars" role="img" aria-label="Biểu đồ doanh thu theo ngày">${s.daily.map((d) => html`<div class="bar" style="height:${Math.max(3, Math.round((d.revenue / maxRev) * 100))}%"><span>${vnd(d.revenue)}</span></div>`)}</div>
          <div class="bars-x">${s.daily.map((d) => html`<span>${d.d.slice(5)}</span>`)}</div>` : html`<p class="muted">Chưa có đơn hàng trong 7 ngày gần nhất.</p>`}
        <h2 style="margin-top:1rem">Đơn theo trạng thái</h2>
        ${s.byStatus.length ? html`<ul>${s.byStatus.map((b) => html`<li class="row"><span class="status status-${b.status}">${STATUS_LABEL[b.status]}</span> ${b.n}</li>`)}</ul>` : html`<p class="muted">Chưa có đơn hàng.</p>`}
      </section>
      <section class="card"><h2>Tồn kho thấp (≤ 2 đôi)</h2>
        ${s.lowStock.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Sản phẩm</th><th>Màu</th><th>Size</th><th>Còn</th></tr></thead><tbody>
          ${s.lowStock.map((r) => html`<tr><td>${r.name}</td><td>${r.color}</td><td>${r.size}</td><td>${r.stock}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">Không có biến thể sắp hết hàng.</p>`}
      </section>
    </div>`.toString();
}

async function products(body, ctx) {
  const { products: list } = await api('/admin/products');
  if (!ctx.isCurrent()) return;
  const paint = () => {
    body().innerHTML = html`<div class="row" style="justify-content:space-between;margin-bottom:1rem"><span class="muted">${list.length} sản phẩm</span><button class="btn btn-primary btn-sm" type="button" id="new-product">Thêm sản phẩm</button></div>
      <div class="table-wrap"><table class="table"><caption class="sr-only">Danh sách sản phẩm</caption><thead><tr><th>Ảnh</th><th>Tên</th><th>Danh mục</th><th>Giá</th><th>Tồn kho</th><th>Trạng thái</th><th></th></tr></thead><tbody>
      ${list.map((p) => html`<tr><td><img src="${p.images[0] || ''}" alt="" width="48" height="48" style="object-fit:cover"></td>
        <td><strong>${p.name}</strong>${p.isDemo ? html` <span class="badge">Demo</span>` : ''}<br><span class="muted">${GENDER_LABEL[p.gender]}</span></td><td>${p.category}</td>
        <td>${p.salePrice ? html`<span class="text-sale">${vnd(p.salePrice)}</span> <s class="muted">${vnd(p.price)}</s>` : vnd(p.price)}</td>
        <td>${p.totalStock}</td><td>${p.active ? 'Đang bán' : 'Ẩn'}</td>
        <td><button class="btn btn-secondary btn-sm" type="button" data-edit="${p.id}">Sửa</button></td></tr>`)}
      </tbody></table></div>`.toString();
    $('#new-product', body()).addEventListener('click', () => editor(null));
    $$('[data-edit]', body()).forEach((b) => b.addEventListener('click', () => editor(list.find((p) => p.id === Number(b.dataset.edit)))));
  };
  const reload = async () => { const r = await api('/admin/products'); list.splice(0, list.length, ...r.products); paint(); };

  function editor(p) {
    const vrow = (v = { color: '', size: '', stock: 0 }) => html`<div class="variant-row"><input class="input" name="v-color" aria-label="Màu" placeholder="Màu" value="${v.color}"><input class="input" name="v-size" aria-label="Size" type="number" min="20" max="55" placeholder="Size" value="${v.size}"><input class="input" name="v-stock" aria-label="Tồn kho" type="number" min="0" placeholder="Tồn" value="${v.stock}"><button class="btn btn-ghost btn-sm" type="button" data-rm aria-label="Xóa biến thể">✕</button></div>`;
    openModal({
      title: p ? `Sửa: ${p.name}` : 'Thêm sản phẩm', wide: true,
      body: html`<form id="prod-form" class="stack" novalidate>
        <div class="form-grid">
          <div class="field span-2"><label for="f-name">Tên sản phẩm</label><input class="input" id="f-name" name="name" required value="${p ? p.name : ''}"></div>
          <div class="field"><label for="f-cat">Danh mục</label><input class="input" id="f-cat" name="category" required value="${p ? p.category : ''}" list="cat-list"><datalist id="cat-list">${[...new Set(list.map((x) => x.category))].map((c) => html`<option value="${c}">`)}</datalist></div>
          <div class="field"><label for="f-gender">Giới tính</label><select class="select" id="f-gender" name="gender">${['nam', 'nu', 'unisex'].map((g) => html`<option value="${g}" ${p && p.gender === g ? raw('selected') : ''}>${GENDER_LABEL[g]}</option>`)}</select></div>
          <div class="field"><label for="f-price">Giá gốc (đ)</label><input class="input" id="f-price" name="price" type="number" min="0" required value="${p ? p.price : ''}"></div>
          <div class="field"><label for="f-sale">Giá khuyến mãi (đ, để trống nếu không)</label><input class="input" id="f-sale" name="salePrice" type="number" min="0" value="${p && p.salePrice ? p.salePrice : ''}"></div>
          <div class="field span-2"><label for="f-desc">Mô tả</label><textarea class="textarea" id="f-desc" name="description">${p ? p.description : ''}</textarea></div>
          <div class="field span-2"><label for="f-img">Đường dẫn ảnh (mỗi dòng một ảnh; dạng /assets/... hoặc https://...)</label><textarea class="textarea" id="f-img" name="images">${p ? p.images.join('\n') : ''}</textarea></div>
          <label class="check"><input type="checkbox" name="isNew" ${p && p.isNew ? raw('checked') : ''}> Đánh dấu hàng mới</label>
          <label class="check"><input type="checkbox" name="active" ${!p || p.active ? raw('checked') : ''}> Đang bán</label>
        </div>
        <fieldset style="border:0;padding:0;margin:0"><legend class="field-label" style="margin-bottom:.5rem">Biến thể (màu, size, tồn kho)</legend>
          <div id="variants">${(p && p.variants.length ? p.variants : [undefined]).map((v) => vrow(v))}</div>
          <button class="btn btn-secondary btn-sm" type="button" id="add-variant">Thêm biến thể</button></fieldset>
        <p class="alert alert-error" id="prod-error" role="alert" hidden></p>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-primary" type="submit">Lưu sản phẩm</button></div>
      </form>`,
      onMount: (el, close) => {
        $('#add-variant', el).addEventListener('click', () => { $('#variants', el).insertAdjacentHTML('beforeend', vrow().toString()); });
        el.addEventListener('click', (e) => { const rm = e.target.closest('[data-rm]'); if (rm) rm.closest('.variant-row').remove(); });
        $('#prod-form', el).addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = e.target; const fd = new FormData(f);
          const variants = $$('.variant-row', el).map((r) => ({ color: $('[name=v-color]', r).value.trim(), size: $('[name=v-size]', r).value, stock: $('[name=v-stock]', r).value }))
            .filter((v) => v.color || v.size);
          const payload = {
            name: fd.get('name'), category: fd.get('category'), gender: fd.get('gender'), price: fd.get('price'),
            salePrice: fd.get('salePrice'), description: fd.get('description'),
            images: String(fd.get('images') || '').split('\n').map((s) => s.trim()).filter(Boolean),
            isNew: !!fd.get('isNew'), active: !!fd.get('active'), variants,
          };
          const err = $('#prod-error', el); err.hidden = true;
          try {
            if (p) await api(`/admin/products/${p.id}`, { method: 'PUT', body: payload });
            else await api('/admin/products', { method: 'POST', body: payload });
            toast('Đã lưu sản phẩm.'); close(); await reload();
          } catch (ex) { err.textContent = ex.message; err.hidden = false; }
        });
      },
    });
  }
  paint();
}

async function orders(body, ctx) {
  const { orders: list } = await api('/admin/orders');
  if (!ctx.isCurrent()) return;
  const paint = () => {
    body().innerHTML = list.length ? html`<div class="table-wrap"><table class="table"><caption class="sr-only">Danh sách đơn hàng</caption><thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Ngày</th><th>Tổng</th><th>Thanh toán</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
      ${list.map((o) => html`<tr><td><strong>${o.code}</strong><br><span class="muted">${o.items.reduce((s, i) => s + i.qty, 0)} sp</span></td>
        <td>${o.customer ? o.customer.name : '—'}<br><span class="muted">${o.shipPhone}</span></td><td>${fmtDate(o.createdAt)}</td><td>${vnd(o.total)}</td>
        <td>${PAYMENT_LABEL[o.paymentMethod]}<br>${o.paymentStatus === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}
          ${o.paymentStatus === 'unpaid' && o.status !== 'cancelled' ? html`<br><button class="btn btn-ghost btn-sm" type="button" data-paid="${o.code}">Đánh dấu đã thanh toán</button>` : ''}</td>
        <td><span class="status status-${o.status}">${STATUS_LABEL[o.status]}</span></td>
        <td>${o.allowedNext.length ? html`<select class="select" style="min-height:36px;min-width:150px" data-code="${o.code}" aria-label="Chuyển trạng thái đơn ${o.code}"><option value="">Chuyển trạng thái…</option>${o.allowedNext.map((s) => html`<option value="${s}">${STATUS_LABEL[s]}</option>`)}</select>` : html`<span class="muted">—</span>`}
          <br><button class="btn btn-ghost btn-sm" type="button" data-view="${o.code}">Xem chi tiết</button></td></tr>`)}
      </tbody></table></div>`.toString() : stateBox({ title: 'Chưa có đơn hàng', text: 'Đơn hàng của khách sẽ hiển thị tại đây.' }).toString();
    $$('[data-code]', body()).forEach((s) => s.addEventListener('change', async () => {
      if (!s.value) return;
      try { await api(`/admin/orders/${s.dataset.code}/status`, { method: 'PUT', body: { status: s.value } }); toast('Đã cập nhật trạng thái.'); await orders(body, ctx); }
      catch (e) { toast(e.message, 'error'); s.value = ''; }
    }));
    $$('[data-paid]', body()).forEach((b) => b.addEventListener('click', async () => {
      try { await api(`/admin/orders/${b.dataset.paid}/paid`, { method: 'PUT' }); toast('Đã đánh dấu đã thanh toán.'); await orders(body, ctx); }
      catch (e) { toast(e.message, 'error'); }
    }));
    $$('[data-view]', body()).forEach((b) => b.addEventListener('click', () => {
      const o = list.find((x) => x.code === b.dataset.view);
      openModal({ title: `Đơn ${o.code}`, wide: true, body: html`<p><strong>Giao đến:</strong> ${o.shipName} · ${o.shipPhone}<br>${o.shipAddress}</p>${o.note ? html`<p><strong>Ghi chú:</strong> ${o.note}</p>` : ''}
        <div class="table-wrap" style="margin-top:1rem"><table class="table"><thead><tr><th>Sản phẩm</th><th>Màu / Size</th><th>SL</th><th>Thành tiền</th></tr></thead><tbody>${o.items.map((i) => html`<tr><td>${i.name}</td><td>${i.color} / ${i.size}</td><td>${i.qty}</td><td>${vnd(i.lineTotal)}</td></tr>`)}</tbody></table></div>
        <p style="margin-top:1rem">Tạm tính ${vnd(o.subtotal)} · Giảm ${vnd(o.discount)} · Phí giao ${vnd(o.shipping)} · <strong>Tổng ${vnd(o.total)}</strong></p>` });
    }));
  };
  paint();
}

async function users(body, ctx) {
  const { users: list } = await api('/admin/users');
  if (!ctx.isCurrent()) return;
  body().innerHTML = html`<div class="table-wrap"><table class="table"><caption class="sr-only">Danh sách người dùng</caption><thead><tr><th>Họ tên</th><th>Email</th><th>Điện thoại</th><th>Vai trò</th><th>Số đơn</th><th>Ngày tạo</th></tr></thead><tbody>
    ${list.map((u) => html`<tr><td>${u.name}</td><td>${u.email}</td><td>${u.phone || '—'}</td><td>${u.role === 'admin' ? 'Quản trị' : 'Khách hàng'}</td><td>${u.orderCount}</td><td>${fmtDate(u.created_at)}</td></tr>`)}</tbody></table></div>`.toString();
}

async function coupons(body, ctx) {
  const { coupons: list } = await api('/admin/coupons');
  if (!ctx.isCurrent()) return;
  body().innerHTML = html`
    <div class="table-wrap"><table class="table"><caption class="sr-only">Mã giảm giá</caption><thead><tr><th>Mã</th><th>Giảm</th><th>Đơn tối thiểu</th><th>Hết hạn</th><th>Hiển thị công khai</th><th>Kích hoạt</th></tr></thead><tbody>
      ${list.map((c) => html`<tr><td><strong>${c.code}</strong>${c.isDemo ? html` <span class="badge">Demo</span>` : ''}</td><td>${c.percent}%</td><td>${vnd(c.minOrder)}</td><td>${c.expiresAt || '—'}</td>
        <td><label class="check"><input type="checkbox" data-public="${c.code}" ${c.isPublic ? raw('checked') : ''} aria-label="Công khai mã ${c.code}"></label></td>
        <td><label class="check"><input type="checkbox" data-active="${c.code}" ${c.active ? raw('checked') : ''} aria-label="Kích hoạt mã ${c.code}"></label></td></tr>`)}</tbody></table></div>
    <form id="coupon-new" class="card" style="margin-top:1.5rem;max-width:560px" novalidate>
      <h2>Tạo mã mới</h2>
      <div class="form-grid">
        <div class="field"><label for="c-code">Mã</label><input class="input" id="c-code" name="code" required placeholder="VD: SUMMER15"></div>
        <div class="field"><label for="c-pct">Giảm (%)</label><input class="input" id="c-pct" name="percent" type="number" min="1" max="90" required></div>
        <div class="field"><label for="c-min">Đơn tối thiểu (đ)</label><input class="input" id="c-min" name="minOrder" type="number" min="0" value="0"></div>
        <div class="field"><label for="c-exp">Hết hạn (không bắt buộc)</label><input class="input" id="c-exp" name="expiresAt" type="date"></div>
        <label class="check span-2"><input type="checkbox" name="isPublic"> Hiển thị trên thanh thông báo (chỉ một mã công khai có % cao nhất được hiển thị)</label>
      </div>
      <p class="alert alert-error" id="c-err" hidden role="alert"></p>
      <button class="btn btn-primary" type="submit">Tạo mã</button>
    </form>`.toString();
  const toggle = async (code, row) => {
    const pub = $(`[data-public="${code}"]`, body()).checked; const act = $(`[data-active="${code}"]`, body()).checked;
    try { await api(`/admin/coupons/${code}`, { method: 'PUT', body: { active: act, isPublic: pub } }); toast('Đã cập nhật mã.'); }
    catch (e) { toast(e.message, 'error'); }
  };
  $$('[data-public]', body()).forEach((i) => i.addEventListener('change', () => toggle(i.dataset.public)));
  $$('[data-active]', body()).forEach((i) => i.addEventListener('change', () => toggle(i.dataset.active)));
  $('#coupon-new', body()).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const err = $('#c-err', body()); err.hidden = true;
    try { await api('/admin/coupons', { method: 'POST', body: { ...fd, isPublic: !!fd.isPublic } }); toast('Đã tạo mã.'); await coupons(body, ctx); }
    catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

// Hồ sơ, địa chỉ giao hàng, đổi mật khẩu
import { html, $, $$ } from '../util.js';
import { api } from '../api.js';
import { setTitle, navigate } from '../router.js';
import { state, setSession } from '../store.js';
import { toast, confirmDialog } from '../components/ui.js';

export async function accountPage(main, ctx) {
  setTitle('Tài khoản');
  if (!state.user) { navigate(`/login?next=${encodeURIComponent('/account')}`, { replace: true }); return; }

  async function render() {
    let addresses = [];
    let loadError = '';
    try { addresses = (await api('/addresses')).addresses; } catch (e) { loadError = e.message; }
    if (!ctx.isCurrent()) return;
    const u = state.user;
    main.innerHTML = html`
      <div class="container">
        <div class="page-head"><h1>Tài khoản của tôi</h1>
          <p class="muted"><a href="#/orders"><u>Xem đơn hàng</u></a> · <a href="#/wishlist"><u>Danh sách yêu thích</u></a></p></div>
        <div class="account-grid">
          <section class="card" aria-labelledby="prof-h">
            <h2 id="prof-h">Thông tin cá nhân</h2>
            <form id="profile-form" class="stack" novalidate>
              <div class="field"><label for="p-email">Email</label><input class="input" id="p-email" value="${u.email}" disabled></div>
              <div class="field"><label for="p-name">Họ và tên</label><input class="input" id="p-name" name="name" value="${u.name}" required></div>
              <div class="field"><label for="p-phone">Số điện thoại</label><input class="input" id="p-phone" name="phone" inputmode="tel" value="${u.phone || ''}"></div>
              <p class="alert alert-error" data-error hidden role="alert"></p>
              <button class="btn btn-primary" type="submit">Lưu thay đổi</button>
            </form>
            <hr style="border:0;border-top:1px solid var(--color-border);width:100%">
            <h2 id="pw-h">Đổi mật khẩu</h2>
            <form id="pw-form" class="stack" novalidate>
              <div class="field"><label for="cur-pw">Mật khẩu hiện tại</label><input class="input" id="cur-pw" name="currentPassword" type="password" autocomplete="current-password" required></div>
              <div class="field"><label for="new-pw">Mật khẩu mới</label><input class="input" id="new-pw" name="newPassword" type="password" autocomplete="new-password" minlength="8" required></div>
              <p class="alert alert-error" data-error hidden role="alert"></p>
              <button class="btn btn-secondary" type="submit">Đổi mật khẩu</button>
            </form>
          </section>
          <section class="card" aria-labelledby="addr-h">
            <h2 id="addr-h">Địa chỉ giao hàng</h2>
            ${loadError ? html`<p class="alert alert-error" role="alert">${loadError}</p>` : ''}
            ${addresses.length ? html`<div>${addresses.map((a) => html`
              <div class="address-item"><div><strong>${a.fullName}</strong> · ${a.phone}${a.isDefault ? html` <span class="badge">Mặc định</span>` : ''}<br>${a.line}, ${a.district}, ${a.city}</div>
              <button class="btn btn-ghost btn-sm" type="button" data-del="${a.id}" aria-label="Xóa địa chỉ ${a.line}">Xóa</button></div>`)}</div>`
              : html`<p class="muted">Bạn chưa lưu địa chỉ nào.</p>`}
            <form id="addr-form" class="form-grid" novalidate>
              <div class="field"><label for="a-name">Họ tên người nhận</label><input class="input" id="a-name" name="fullName" required></div>
              <div class="field"><label for="a-phone">Số điện thoại</label><input class="input" id="a-phone" name="phone" inputmode="tel" required></div>
              <div class="field span-2"><label for="a-line">Địa chỉ (số nhà, đường)</label><input class="input" id="a-line" name="line" required></div>
              <div class="field"><label for="a-district">Quận / Huyện</label><input class="input" id="a-district" name="district" required></div>
              <div class="field"><label for="a-city">Tỉnh / Thành phố</label><input class="input" id="a-city" name="city" required></div>
              <label class="check span-2"><input type="checkbox" name="isDefault"> Đặt làm địa chỉ mặc định</label>
              <p class="alert alert-error span-2" data-error hidden role="alert"></p>
              <button class="btn btn-primary span-2" type="submit">Thêm địa chỉ</button>
            </form>
          </section>
        </div>
      </div>`.toString();
    bind();
  }

  function bind() {
    const wire = (id, fn) => {
      const f = $(id, main);
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = $('[data-error]', f); err.hidden = true;
        const btn = $('button[type=submit]', f); btn.disabled = true;
        try { await fn(Object.fromEntries(new FormData(f)), f); }
        catch (ex) { err.textContent = ex.message; err.hidden = false; }
        finally { btn.disabled = false; }
      });
    };
    wire('#profile-form', async (v) => {
      const r = await api('/auth/me', { method: 'PUT', body: v });
      state.user = r.user; setSession(localStorage.getItem('stridex.token'), r.user);
      toast('Đã cập nhật thông tin.');
    });
    wire('#pw-form', async (v, f) => {
      if ((v.newPassword || '').length < 8) throw new Error('Mật khẩu mới cần tối thiểu 8 ký tự.');
      await api('/auth/change-password', { method: 'POST', body: v });
      f.reset(); toast('Đã đổi mật khẩu.');
    });
    wire('#addr-form', async (v) => {
      await api('/addresses', { method: 'POST', body: { ...v, isDefault: !!v.isDefault } });
      toast('Đã thêm địa chỉ.'); await render();
    });
    $$('[data-del]', main).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmDialog('Xóa địa chỉ này?', 'Xóa'))) return;
      try { await api(`/addresses/${b.dataset.del}`, { method: 'DELETE' }); toast('Đã xóa địa chỉ.'); await render(); }
      catch (e) { toast(e.message, 'error'); }
    }));
  }

  await render();
}

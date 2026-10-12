// Đăng nhập / Đăng ký
import { html, $, $$ } from '../util.js';
import { api } from '../api.js';
import { setTitle, navigate } from '../router.js';
import { setSession, state } from '../store.js';
import { toast } from '../components/ui.js';

function safeNext(next) { return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'; }

function bindForm(main, { submit, buttonLabel }) {
  const form = $('form', main);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#form-error', main);
    const btn = $('button[type=submit]', form);
    err.hidden = true;
    $$('[aria-invalid]', form).forEach((i) => i.removeAttribute('aria-invalid'));
    btn.disabled = true; btn.textContent = 'Đang xử lý…';
    try {
      await submit(Object.fromEntries(new FormData(form)));
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
      $('input', form)?.focus();
    } finally {
      btn.disabled = false; btn.textContent = buttonLabel;
    }
  });
}

export async function loginPage(main, ctx) {
  setTitle('Đăng nhập');
  if (state.user) { navigate('/account', { replace: true }); return; }
  const next = safeNext(ctx.query.next);
  main.innerHTML = html`
    <div class="container"><div class="auth-wrap">
      <h1>Đăng nhập</h1>
      <form class="stack" novalidate>
        <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="password">Mật khẩu</label><input class="input" id="password" name="password" type="password" autocomplete="current-password" required></div>
        <p class="alert alert-error" id="form-error" role="alert" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">Đăng nhập</button>
      </form>
      <p>Chưa có tài khoản? <a href="#/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}"><u>Đăng ký</u></a></p>
    </div></div>`.toString();
  $('#email', main).focus();
  bindForm(main, {
    buttonLabel: 'Đăng nhập',
    submit: async (v) => {
      if (!v.email || !v.password) throw new Error('Vui lòng nhập email và mật khẩu.');
      const r = await api('/auth/login', { method: 'POST', body: v });
      setSession(r.token, r.user);
      toast(`Xin chào, ${r.user.name}!`);
      navigate(next);
    },
  });
}

export async function registerPage(main, ctx) {
  setTitle('Đăng ký');
  if (state.user) { navigate('/account', { replace: true }); return; }
  const next = safeNext(ctx.query.next);
  main.innerHTML = html`
    <div class="container"><div class="auth-wrap">
      <h1>Tạo tài khoản</h1>
      <form class="stack" novalidate>
        <div class="field"><label for="name">Họ và tên</label><input class="input" id="name" name="name" autocomplete="name" required></div>
        <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="phone">Số điện thoại (không bắt buộc)</label><input class="input" id="phone" name="phone" inputmode="tel" autocomplete="tel"></div>
        <div class="field"><label for="password">Mật khẩu</label><input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="8" required><span class="field-hint">Tối thiểu 8 ký tự.</span></div>
        <p class="alert alert-error" id="form-error" role="alert" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">Đăng ký</button>
      </form>
      <p>Đã có tài khoản? <a href="#/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}"><u>Đăng nhập</u></a></p>
    </div></div>`.toString();
  $('#name', main).focus();
  bindForm(main, {
    buttonLabel: 'Đăng ký',
    submit: async (v) => {
      if (!v.name.trim()) throw new Error('Vui lòng nhập họ tên.');
      if (v.password.length < 8) throw new Error('Mật khẩu cần tối thiểu 8 ký tự.');
      const r = await api('/auth/register', { method: 'POST', body: v });
      setSession(r.token, r.user);
      toast('Tạo tài khoản thành công.');
      navigate(next);
    },
  });
}

// Chân trang: chỉ hiển thị thông tin cửa hàng thật (từ cấu hình); mục trống sẽ được ẩn.
import { html, vnd } from '../util.js';
import { state, subscribe } from '../store.js';

export function renderFooter() {
  const el = document.getElementById('site-footer');
  const s = (state.config && state.config.store) || {};
  const shipFee = state.config && state.config.shippingFee;
  const free = state.config && state.config.freeShippingThreshold;
  const socials = [['Facebook', s.facebook], ['Instagram', s.instagram], ['YouTube', s.youtube]].filter(([, u]) => u);
  el.innerHTML = html`
    <div class="container">
      <div class="footer-grid">
        <div>
          <h3>${s.name || 'STRIDEX'}</h3>
          <p>Giày thể thao tuyển chọn, kèm trợ lý AI giúp bạn chọn đúng đôi theo mục đích, ngân sách và size.</p>
          <ul style="margin-top:1rem">
            ${s.address ? html`<li>${s.address}</li>` : ''}
            ${s.phone ? html`<li>Điện thoại: <a href="tel:${s.phone}">${s.phone}</a></li>` : ''}
            ${s.email ? html`<li>Email: <a href="mailto:${s.email}">${s.email}</a></li>` : ''}
            ${!s.address && !s.phone && !s.email ? html`<li>Thông tin liên hệ cửa hàng đang được cập nhật.</li>` : ''}
          </ul>
        </div>
        <div>
          <h3>Mua sắm</h3>
          <ul>
            <li><a href="#/shop?isNew=1">Hàng mới</a></li>
            <li><a href="#/shop?gender=nam">Giày nam</a></li>
            <li><a href="#/shop?gender=nu">Giày nữ</a></li>
            <li><a href="#/shop?sport=1">Thể thao</a></li>
            <li><a href="#/shop?sale=1">Giảm giá</a></li>
          </ul>
        </div>
        <div>
          <h3>Hỗ trợ khách hàng</h3>
          <ul>
            <li><a href="#/account">Tài khoản của tôi</a></li>
            <li><a href="#/orders">Theo dõi đơn hàng</a></li>
            <li><a href="#/wishlist">Danh sách yêu thích</a></li>
            <li><a href="#/policy">Giao hàng & thanh toán</a></li>
          </ul>
        </div>
        <div>
          <h3>Kết nối</h3>
          ${socials.length
            ? html`<ul>${socials.map(([n, u]) => html`<li><a href="${u}" target="_blank" rel="noopener noreferrer">${n}</a></li>`)}</ul>`
            : html`<p>Kênh mạng xã hội đang được cập nhật.</p>`}
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} ${s.name || 'STRIDEX'}. Đồ án môn học.</span>
        ${shipFee != null ? html`<span>Phí giao hàng ${vnd(shipFee)}, miễn phí từ ${vnd(free)}.</span>` : ''}
        ${state.config && state.config.demoData ? html`<span>Dữ liệu sản phẩm hiện là dữ liệu demo.</span>` : ''}
      </div>
    </div>`.toString();
}

export function initFooter() {
  renderFooter();
  subscribe((w) => { if (w === 'config') renderFooter(); });
}

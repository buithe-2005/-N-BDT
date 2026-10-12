// Điểm vào ứng dụng
import { loadConfig, loadUser, subscribe } from './store.js';
import { addRoute, setNotFound, startRouter } from './router.js';
import { initHeader } from './components/header.js';
import { initFooter } from './components/footer.js';
import { initAI } from './components/aiWidget.js';
import { homePage } from './pages/home.js';
import { shopPage } from './pages/shop.js';
import { productPage } from './pages/product.js';
import { cartPage } from './pages/cart.js';
import { checkoutPage } from './pages/checkout.js';
import { loginPage, registerPage } from './pages/auth.js';
import { accountPage } from './pages/account.js';
import { ordersPage, orderDetailPage, wishlistPage, policyPage, notFoundPage } from './pages/orders.js';
import { adminPage } from './pages/admin.js';

addRoute('/', homePage);
addRoute('/shop', shopPage);
addRoute('/product/:slug', productPage);
addRoute('/cart', cartPage);
addRoute('/checkout', checkoutPage);
addRoute('/login', loginPage);
addRoute('/register', registerPage);
addRoute('/account', accountPage);
addRoute('/orders', ordersPage);
addRoute('/orders/:code', orderDetailPage);
addRoute('/wishlist', wishlistPage);
addRoute('/policy', policyPage);
addRoute('/admin', adminPage);
addRoute('/admin/:tab', adminPage);
setNotFound(notFoundPage);

async function boot() {
  try { await loadConfig(); } catch {
    // Vẫn chạy được với cấu hình mặc định nếu API chưa sẵn sàng
    const { state } = await import('./store.js');
    state.config = { store: { name: 'STRIDEX' }, shippingFee: 0, freeShippingThreshold: 0, maxQtyPerLine: 5, publicCoupon: null };
  }
  await loadUser();
  initHeader();
  initFooter();
  initAI();
  startRouter();
}
boot();

// Trạng thái toàn cục: người dùng, cấu hình, giỏ hàng (localStorage), yêu thích.
import { api, getToken, setToken } from './api.js';

const CART_KEY = 'stridex.cart';
const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (what) => listeners.forEach((fn) => fn(what));

export const state = {
  user: null,
  config: null,
  wishlist: new Set(),
  cart: readCart(),
};

function readCart() {
  try {
    const v = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(v) ? v.filter((i) => Number.isInteger(i.variantId) && i.qty > 0) : [];
  } catch { return []; }
}
function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); emit('cart'); }

export const cartCount = () => state.cart.reduce((s, i) => s + i.qty, 0);

export function addToCart(variantId, qty, max) {
  const cur = state.cart.find((i) => i.variantId === variantId);
  const limit = max || 5;
  if (cur) cur.qty = Math.min(cur.qty + qty, limit);
  else state.cart.push({ variantId, qty: Math.min(qty, limit) });
  saveCart();
}
export function setCartQty(variantId, qty) {
  const cur = state.cart.find((i) => i.variantId === variantId);
  if (!cur) return;
  if (qty <= 0) state.cart = state.cart.filter((i) => i.variantId !== variantId);
  else cur.qty = qty;
  saveCart();
}
export function removeFromCart(variantId) { state.cart = state.cart.filter((i) => i.variantId !== variantId); saveCart(); }
export function clearCart() { state.cart = []; saveCart(); }
/** Đồng bộ giỏ với kết quả báo giá của backend (loại dòng không còn hợp lệ, hạ số lượng). */
export function syncCartWithQuote(quote) {
  const valid = new Map(quote.lines.map((l) => [l.variantId, l.qty]));
  const next = state.cart.filter((i) => valid.has(i.variantId)).map((i) => ({ variantId: i.variantId, qty: valid.get(i.variantId) }));
  if (JSON.stringify(next) !== JSON.stringify(state.cart)) { state.cart = next; saveCart(); }
}

export async function loadConfig() { state.config = await api('/config'); emit('config'); }

export async function loadUser() {
  if (!getToken()) { state.user = null; state.wishlist = new Set(); emit('user'); return; }
  try {
    state.user = (await api('/auth/me')).user;
    await loadWishlistIds();
  } catch (err) {
    if (err.status === 401) { setToken(null); state.user = null; }
  }
  emit('user');
}

async function loadWishlistIds() {
  try { state.wishlist = new Set((await api('/wishlist')).productIds); } catch { state.wishlist = new Set(); }
}

export function setSession(token, user) {
  setToken(token);
  state.user = user;
  emit('user');
  loadWishlistIds().then(() => emit('wishlist'));
}
export function logout() { setToken(null); state.user = null; state.wishlist = new Set(); emit('user'); emit('wishlist'); }

export async function toggleWishlist(productId) {
  if (!state.user) return false;
  if (state.wishlist.has(productId)) { await api(`/wishlist/${productId}`, { method: 'DELETE' }); state.wishlist.delete(productId); }
  else { await api(`/wishlist/${productId}`, { method: 'POST' }); state.wishlist.add(productId); }
  emit('wishlist');
  return true;
}

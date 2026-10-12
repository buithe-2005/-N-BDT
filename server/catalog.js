'use strict';
/**
 * Nghiệp vụ danh mục sản phẩm, báo giá giỏ hàng và đơn hàng.
 * Đây là nguồn dữ liệu có thẩm quyền cho giá, tồn kho, giảm giá và phí vận chuyển.
 */
const config = require('./config');
const { db, tx } = require('./db');

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const GENDERS = ['nam', 'nu', 'unisex'];
// Danh mục được xếp vào mục "Thể thao" ở menu chính.
const SPORT_CATEGORIES = ['Chạy bộ', 'Bóng rổ', 'Dã ngoại'];

function shapeProduct(p, variants) {
  const vs = variants
    .filter((v) => v.product_id === p.id)
    .map((v) => ({ variantId: v.id, color: v.color, size: v.size, stock: v.stock }))
    .sort((a, b) => a.size - b.size);
  const effective = p.sale_price != null && p.sale_price < p.price ? p.sale_price : p.price;
  const totalStock = vs.reduce((s, v) => s + v.stock, 0);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    category: p.category,
    gender: p.gender,
    price: p.price,
    salePrice: effective < p.price ? effective : null,
    effectivePrice: effective,
    discountPercent: effective < p.price ? Math.round((1 - effective / p.price) * 100) : 0,
    isNew: !!p.is_new,
    images: JSON.parse(p.images || '[]'),
    colors: [...new Set(vs.map((v) => v.color))],
    variants: vs,
    totalStock,
    inStock: totalStock > 0,
    active: !!p.active,
    isDemo: !!p.is_demo,
  };
}

function loadAll(includeInactive = false) {
  const products = db.prepare(
    `SELECT * FROM products ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY created_at DESC, id DESC`,
  ).all();
  const variants = db.prepare('SELECT * FROM variants').all();
  return products.map((p) => shapeProduct(p, variants));
}

function listProducts(q = {}) {
  let items = loadAll();
  const text = norm(q.q || '');
  if (text) {
    const tokens = text.split(/\s+/).filter(Boolean);
    items = items.filter((p) => {
      const hay = norm(`${p.name} ${p.category} ${p.colors.join(' ')} ${genderLabel(p.gender)}`);
      return tokens.every((t) => hay.includes(t));
    });
  }
  if (q.gender && GENDERS.includes(q.gender)) {
    // Giày unisex hiển thị trong cả mục Nam và Nữ.
    items = items.filter((p) => p.gender === q.gender || p.gender === 'unisex');
  }
  if (q.category) items = items.filter((p) => p.category === q.category);
  if (q.sport === '1') items = items.filter((p) => SPORT_CATEGORIES.includes(p.category));
  if (q.color) items = items.filter((p) => p.colors.includes(q.color));
  if (q.size) items = items.filter((p) => p.variants.some((v) => v.size === Number(q.size) && v.stock > 0));
  if (q.min) items = items.filter((p) => p.effectivePrice >= Number(q.min));
  if (q.max) items = items.filter((p) => p.effectivePrice <= Number(q.max));
  if (q.inStock === '1') items = items.filter((p) => p.inStock);
  if (q.sale === '1') items = items.filter((p) => p.salePrice != null);
  if (q.isNew === '1') items = items.filter((p) => p.isNew);
  switch (q.sort) {
    case 'price_asc': items.sort((a, b) => a.effectivePrice - b.effectivePrice); break;
    case 'price_desc': items.sort((a, b) => b.effectivePrice - a.effectivePrice); break;
    case 'name': items.sort((a, b) => a.name.localeCompare(b.name, 'vi')); break;
    default: break; // mới nhất (đã sắp xếp từ truy vấn)
  }
  return items;
}

function facets() {
  const items = loadAll();
  const prices = items.map((p) => p.effectivePrice);
  return {
    categories: [...new Set(items.map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'vi')),
    colors: [...new Set(items.flatMap((p) => p.colors))].sort((a, b) => a.localeCompare(b, 'vi')),
    sizes: [...new Set(items.flatMap((p) => p.variants.map((v) => v.size)))].sort((a, b) => a - b),
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
  };
}

function getProductBySlug(slug) {
  const p = db.prepare('SELECT * FROM products WHERE slug = ? AND active = 1').get(slug);
  if (!p) return null;
  const variants = db.prepare('SELECT * FROM variants WHERE product_id = ?').all(p.id);
  return shapeProduct(p, variants);
}

function relatedProducts(product, limit = 4) {
  const others = loadAll().filter((p) => p.id !== product.id);
  const score = (p) => (p.category === product.category ? 2 : 0) + (p.gender === product.gender ? 1 : 0);
  return others.sort((a, b) => score(b) - score(a)).slice(0, limit);
}

function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
}
function genderLabel(g) {
  return { nam: 'nam', nu: 'nữ', unisex: 'unisex' }[g] || g;
}

// ---------------------------------------------------------------------------
// Báo giá giỏ hàng (có thẩm quyền)
// ---------------------------------------------------------------------------
function findCoupon(code) {
  if (!code) return null;
  const c = db.prepare('SELECT * FROM coupons WHERE code = ?').get(String(code).trim().toUpperCase());
  return c || null;
}

function quote(rawItems, couponCode) {
  if (!Array.isArray(rawItems)) throw new HttpError(400, 'Dữ liệu giỏ hàng không hợp lệ.');
  const lines = [];
  const issues = [];
  const merged = new Map();
  for (const it of rawItems.slice(0, 50)) {
    const id = Number(it && it.variantId);
    const qty = Math.floor(Number(it && it.qty));
    if (!Number.isInteger(id) || !(qty > 0)) continue;
    merged.set(id, (merged.get(id) || 0) + qty);
  }
  for (const [variantId, wanted] of merged) {
    const row = db.prepare(`
      SELECT v.id AS vid, v.color, v.size, v.stock, p.id AS pid, p.slug, p.name, p.price, p.sale_price, p.images, p.active
      FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`).get(variantId);
    if (!row || !row.active) {
      issues.push({ variantId, type: 'unavailable', message: 'Sản phẩm không còn được bán.' });
      continue;
    }
    const unit = row.sale_price != null && row.sale_price < row.price ? row.sale_price : row.price;
    const image = JSON.parse(row.images || '[]')[0] || null;
    let qty = Math.min(wanted, config.MAX_QTY_PER_LINE);
    let issue = null;
    if (row.stock <= 0) {
      qty = 0;
      issue = { variantId, type: 'out_of_stock', message: `${row.name} (size ${row.size}) đã hết hàng.` };
    } else if (qty > row.stock) {
      qty = row.stock;
      issue = { variantId, type: 'stock_limited', message: `${row.name} (size ${row.size}) chỉ còn ${row.stock} đôi.` };
    } else if (wanted > config.MAX_QTY_PER_LINE) {
      issue = { variantId, type: 'max_qty', message: `Tối đa ${config.MAX_QTY_PER_LINE} đôi cho mỗi sản phẩm.` };
    }
    if (issue) issues.push(issue);
    lines.push({
      variantId, productId: row.pid, slug: row.slug, name: row.name, color: row.color, size: row.size,
      image, unitPrice: unit, listPrice: row.price, qty, stock: row.stock, lineTotal: unit * qty,
    });
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  let discount = 0;
  let coupon = null;
  let couponError = null;
  if (couponCode) {
    const c = findCoupon(couponCode);
    if (!c || !c.active) couponError = 'Mã giảm giá không hợp lệ.';
    else if (c.expires_at && c.expires_at < new Date().toISOString().slice(0, 10)) couponError = 'Mã giảm giá đã hết hạn.';
    else if (subtotal < c.min_order) couponError = `Mã áp dụng cho đơn từ ${c.min_order.toLocaleString('vi-VN')}đ.`;
    else {
      discount = Math.floor((subtotal * c.percent) / 100);
      coupon = { code: c.code, percent: c.percent };
    }
  }
  const afterDiscount = subtotal - discount;
  const shipping = subtotal === 0 ? 0 : afterDiscount >= config.FREE_SHIPPING_THRESHOLD ? 0 : config.SHIPPING_FEE;
  return {
    lines: lines.filter((l) => l.qty > 0),
    issues,
    coupon,
    couponError,
    subtotal,
    discount,
    shipping,
    total: afterDiscount + shipping,
    freeShippingThreshold: config.FREE_SHIPPING_THRESHOLD,
  };
}

// ---------------------------------------------------------------------------
// Đơn hàng
// ---------------------------------------------------------------------------
const STATUS_FLOW = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipping', 'cancelled'],
  shipping: ['delivered'],
  delivered: [],
  cancelled: [],
};

function newOrderCode() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `SX${ymd}-${rnd}`;
}

function createOrder(user, body) {
  const method = body.paymentMethod;
  if (!['cod', 'bank_transfer'].includes(method)) throw new HttpError(400, 'Phương thức thanh toán không hợp lệ.');
  const ship = body.shipping || {};
  const name = String(ship.fullName || '').trim();
  const phone = String(ship.phone || '').trim();
  const line = String(ship.line || '').trim();
  const district = String(ship.district || '').trim();
  const city = String(ship.city || '').trim();
  if (!name || !line || !district || !city) throw new HttpError(400, 'Vui lòng nhập đầy đủ thông tin giao hàng.');
  if (!/^(0|\+84)\d{9,10}$/.test(phone.replace(/[\s.-]/g, ''))) throw new HttpError(400, 'Số điện thoại không hợp lệ.');
  const note = String(body.note || '').slice(0, 300);

  return tx(() => {
    const q = quote(body.items, body.coupon);
    if (!q.lines.length) throw new HttpError(400, 'Giỏ hàng trống.');
    if (q.issues.length) throw new HttpError(409, 'Giỏ hàng có thay đổi về tồn kho hoặc giá. Vui lòng kiểm tra lại.', { quote: q });
    if (body.coupon && q.couponError) throw new HttpError(400, q.couponError);

    let code = newOrderCode();
    while (db.prepare('SELECT 1 FROM orders WHERE code = ?').get(code)) code = newOrderCode();

    const address = `${line}, ${district}, ${city}`;
    const r = db.prepare(`INSERT INTO orders
      (code,user_id,payment_method,subtotal,discount,shipping,total,coupon_code,ship_name,ship_phone,ship_address,note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(code, user.id, method, q.subtotal, q.discount, q.shipping, q.total, q.coupon ? q.coupon.code : null,
        name, phone, address, note || null);
    const orderId = r.lastInsertRowid;
    const insItem = db.prepare(`INSERT INTO order_items
      (order_id,variant_id,product_id,name,slug,color,size,unit_price,qty,image) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const dec = db.prepare('UPDATE variants SET stock = stock - ? WHERE id = ? AND stock >= ?');
    for (const l of q.lines) {
      const res = dec.run(l.qty, l.variantId, l.qty);
      if (res.changes !== 1) throw new HttpError(409, 'Tồn kho vừa thay đổi. Vui lòng thử lại.');
      insItem.run(orderId, l.variantId, l.productId, l.name, l.slug, l.color, l.size, l.unitPrice, l.qty, l.image);
    }
    return getOrder(code);
  });
}

function getOrder(code) {
  const o = db.prepare('SELECT * FROM orders WHERE code = ?').get(code);
  if (!o) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(o.id);
  return {
    code: o.code,
    userId: o.user_id,
    status: o.status,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    subtotal: o.subtotal,
    discount: o.discount,
    shipping: o.shipping,
    total: o.total,
    couponCode: o.coupon_code,
    shipName: o.ship_name,
    shipPhone: o.ship_phone,
    shipAddress: o.ship_address,
    note: o.note,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    items: items.map((i) => ({
      name: i.name, slug: i.slug, color: i.color, size: i.size, unitPrice: i.unit_price,
      qty: i.qty, image: i.image, lineTotal: i.unit_price * i.qty,
    })),
  };
}

function changeOrderStatus(code, next, { actorIsAdmin }) {
  return tx(() => {
    const o = db.prepare('SELECT * FROM orders WHERE code = ?').get(code);
    if (!o) throw new HttpError(404, 'Không tìm thấy đơn hàng.');
    if (!STATUS_FLOW[o.status] || !STATUS_FLOW[o.status].includes(next)) {
      throw new HttpError(409, 'Không thể chuyển trạng thái đơn hàng theo yêu cầu.');
    }
    if (!actorIsAdmin && !(o.status === 'pending' && next === 'cancelled')) {
      throw new HttpError(403, 'Bạn chỉ có thể hủy đơn đang chờ xác nhận.');
    }
    if (next === 'cancelled') {
      const items = db.prepare('SELECT variant_id, qty FROM order_items WHERE order_id = ?').all(o.id);
      const restore = db.prepare('UPDATE variants SET stock = stock + ? WHERE id = ?');
      for (const it of items) restore.run(it.qty, it.variant_id);
    }
    const paid = next === 'delivered' && o.payment_method === 'cod' ? 'paid' : o.payment_status;
    db.prepare("UPDATE orders SET status = ?, payment_status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(next, paid, o.id);
    return getOrder(code);
  });
}

module.exports = {
  HttpError, GENDERS, STATUS_FLOW, loadAll, listProducts, facets, getProductBySlug, relatedProducts,
  quote, findCoupon, createOrder, getOrder, changeOrderStatus, shapeProduct, norm,
};

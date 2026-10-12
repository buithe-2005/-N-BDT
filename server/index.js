'use strict';
/** Máy chủ HTTP: REST API + phục vụ giao diện tĩnh. Không phụ thuộc thư viện ngoài. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const { db, tx } = require('./db');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('./auth');
const C = require('./catalog');
const { HttpError } = C;

// ---------------------------------------------------------------------------
// Router nhỏ
// ---------------------------------------------------------------------------
const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, auth: opts.auth || false, admin: opts.admin || false, internal: opts.internal || false });
}

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) { reject(new HttpError(413, 'Dữ liệu gửi lên quá lớn.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'Dữ liệu JSON không hợp lệ.')); }
    });
    req.on('error', reject);
  });
}

function currentUser(req) {
  const h = req.headers.authorization || '';
  const payload = h.startsWith('Bearer ') ? verifyToken(h.slice(7)) : null;
  if (!payload) return null;
  const u = db.prepare('SELECT id,email,name,phone,role FROM users WHERE id = ?').get(payload.sub);
  return u || null;
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role });
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Giới hạn đăng nhập sai (bộ nhớ, đủ cho phạm vi đồ án)
const loginAttempts = new Map();
function checkLoginLimit(key) {
  const now = Date.now();
  const rec = (loginAttempts.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  loginAttempts.set(key, rec);
  if (rec.length >= 8) throw new HttpError(429, 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ít phút.');
  return () => { rec.push(Date.now()); };
}

// ---------------------------------------------------------------------------
// Cấu hình công khai
// ---------------------------------------------------------------------------
route('GET', '/api/config', () => {
  const pub = db.prepare(
    "SELECT code,percent,min_order FROM coupons WHERE active = 1 AND is_public = 1 AND (expires_at IS NULL OR expires_at >= date('now')) ORDER BY percent DESC LIMIT 1",
  ).get();
  const hasDemo = db.prepare('SELECT COUNT(*) AS n FROM products WHERE is_demo = 1').get().n > 0;
  return {
    store: config.STORE,
    shippingFee: config.SHIPPING_FEE,
    freeShippingThreshold: config.FREE_SHIPPING_THRESHOLD,
    maxQtyPerLine: config.MAX_QTY_PER_LINE,
    publicCoupon: pub ? { code: pub.code, percent: pub.percent, minOrder: pub.min_order } : null,
    demoData: hasDemo,
  };
});

// ---------------------------------------------------------------------------
// Tài khoản
// ---------------------------------------------------------------------------
route('POST', '/api/auth/register', ({ body }) => {
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  if (!name) throw new HttpError(400, 'Vui lòng nhập họ tên.');
  if (!isEmail(email)) throw new HttpError(400, 'Email không hợp lệ.');
  if (password.length < 8) throw new HttpError(400, 'Mật khẩu cần tối thiểu 8 ký tự.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Email này đã được đăng ký.');
  const phone = body.phone ? String(body.phone).trim() : null;
  const r = db.prepare('INSERT INTO users (email,name,phone,password_hash) VALUES (?,?,?,?)')
    .run(email, name, phone, hashPassword(password));
  const user = db.prepare('SELECT id,email,name,phone,role FROM users WHERE id = ?').get(r.lastInsertRowid);
  return { status: 201, data: { token: signToken({ sub: user.id }), user: publicUser(user) } };
});

route('POST', '/api/auth/login', ({ body, req }) => {
  const email = String(body.email || '').trim().toLowerCase();
  const key = `${req.socket.remoteAddress}|${email}`;
  const fail = checkLoginLimit(key);
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !verifyPassword(String(body.password || ''), u.password_hash)) {
    fail();
    throw new HttpError(401, 'Email hoặc mật khẩu không đúng.');
  }
  return { token: signToken({ sub: u.id }), user: publicUser(u) };
});

route('GET', '/api/auth/me', ({ user }) => ({ user: publicUser(user) }), { auth: true });

route('PUT', '/api/auth/me', ({ user, body }) => {
  const name = String(body.name || '').trim();
  if (!name) throw new HttpError(400, 'Họ tên không được để trống.');
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, body.phone ? String(body.phone).trim() : null, user.id);
  return { user: publicUser(db.prepare('SELECT id,email,name,phone,role FROM users WHERE id = ?').get(user.id)) };
}, { auth: true });

route('POST', '/api/auth/change-password', ({ user, body }) => {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
  if (!verifyPassword(String(body.currentPassword || ''), row.password_hash)) throw new HttpError(400, 'Mật khẩu hiện tại không đúng.');
  if (String(body.newPassword || '').length < 8) throw new HttpError(400, 'Mật khẩu mới cần tối thiểu 8 ký tự.');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.newPassword), user.id);
  return { ok: true };
}, { auth: true });

// Địa chỉ giao hàng
route('GET', '/api/addresses', ({ user }) => ({
  addresses: db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC').all(user.id)
    .map((a) => ({ id: a.id, fullName: a.full_name, phone: a.phone, line: a.line, district: a.district, city: a.city, isDefault: !!a.is_default })),
}), { auth: true });

route('POST', '/api/addresses', ({ user, body }) => {
  const f = ['fullName', 'phone', 'line', 'district', 'city'].map((k) => String(body[k] || '').trim());
  if (f.some((x) => !x)) throw new HttpError(400, 'Vui lòng nhập đầy đủ thông tin địa chỉ.');
  if (!/^(0|\+84)\d{9,10}$/.test(f[1].replace(/[\s.-]/g, ''))) throw new HttpError(400, 'Số điện thoại không hợp lệ.');
  tx(() => {
    const count = db.prepare('SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?').get(user.id).n;
    const makeDefault = body.isDefault || count === 0;
    if (makeDefault) db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(user.id);
    db.prepare('INSERT INTO addresses (user_id,full_name,phone,line,district,city,is_default) VALUES (?,?,?,?,?,?,?)')
      .run(user.id, ...f, makeDefault ? 1 : 0);
  });
  return { status: 201, data: { ok: true } };
}, { auth: true });

route('DELETE', '/api/addresses/:id', ({ user, params }) => {
  const r = db.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').run(Number(params.id), user.id);
  if (!r.changes) throw new HttpError(404, 'Không tìm thấy địa chỉ.');
  return { ok: true };
}, { auth: true });

// ---------------------------------------------------------------------------
// Sản phẩm
// ---------------------------------------------------------------------------
route('GET', '/api/products', ({ query }) => ({ products: C.listProducts(query) }));
route('GET', '/api/products/facets', () => C.facets());
route('GET', '/api/products/:slug', ({ params }) => {
  const p = C.getProductBySlug(params.slug);
  if (!p) throw new HttpError(404, 'Không tìm thấy sản phẩm.');
  return { product: p, related: C.relatedProducts(p) };
});

// Giỏ hàng: báo giá có thẩm quyền
route('POST', '/api/cart/quote', ({ body }) => C.quote(body.items, body.coupon));

// Yêu thích
route('GET', '/api/wishlist', ({ user }) => {
  const ids = db.prepare('SELECT product_id FROM wishlist WHERE user_id = ? ORDER BY created_at DESC').all(user.id).map((r) => r.product_id);
  const all = C.loadAll();
  return { productIds: ids, products: ids.map((id) => all.find((p) => p.id === id)).filter(Boolean) };
}, { auth: true });
route('POST', '/api/wishlist/:productId', ({ user, params }) => {
  const id = Number(params.productId);
  if (!db.prepare('SELECT 1 FROM products WHERE id = ? AND active = 1').get(id)) throw new HttpError(404, 'Không tìm thấy sản phẩm.');
  db.prepare('INSERT OR IGNORE INTO wishlist (user_id,product_id) VALUES (?,?)').run(user.id, id);
  return { ok: true };
}, { auth: true });
route('DELETE', '/api/wishlist/:productId', ({ user, params }) => {
  db.prepare('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?').run(user.id, Number(params.productId));
  return { ok: true };
}, { auth: true });

// ---------------------------------------------------------------------------
// Đơn hàng
// ---------------------------------------------------------------------------
route('POST', '/api/orders', ({ user, body }) => ({ status: 201, data: { order: C.createOrder(user, body) } }), { auth: true });
route('GET', '/api/orders', ({ user }) => {
  const codes = db.prepare('SELECT code FROM orders WHERE user_id = ? ORDER BY id DESC').all(user.id);
  return { orders: codes.map((r) => C.getOrder(r.code)) };
}, { auth: true });
route('GET', '/api/orders/:code', ({ user, params }) => {
  const o = C.getOrder(params.code);
  if (!o || (o.userId !== user.id && user.role !== 'admin')) throw new HttpError(404, 'Không tìm thấy đơn hàng.');
  return { order: o };
}, { auth: true });
route('POST', '/api/orders/:code/cancel', ({ user, params }) => {
  const o = C.getOrder(params.code);
  if (!o || o.userId !== user.id) throw new HttpError(404, 'Không tìm thấy đơn hàng.');
  return { order: C.changeOrderStatus(params.code, 'cancelled', { actorIsAdmin: false }) };
}, { auth: true });

// ---------------------------------------------------------------------------
// Trợ lý mua sắm AI (Node làm cổng; Python xử lý hiểu yêu cầu & xếp hạng)
// ---------------------------------------------------------------------------
async function callAI(path_, init = {}, timeoutMs = config.AI_TIMEOUT_MS) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(config.AI_SERVICE_URL + path_, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

route('GET', '/api/ai/status', async () => {
  try {
    const r = await callAI('/health', {}, 2000);
    return { available: r.ok };
  } catch {
    return { available: false };
  }
});

route('POST', '/api/ai/chat', async ({ user, body }) => {
  const message = String(body.message || '').trim().slice(0, 500);
  if (!message) throw new HttpError(400, 'Vui lòng nhập nội dung cần tư vấn.');
  let convId = Number(body.conversationId) || null;
  if (convId) {
    const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
    const owned = c && (c.user_id == null ? !user : (user && c.user_id === user.id));
    if (!owned) convId = null;
  }
  const history = convId
    ? db.prepare('SELECT role,content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 10').all(convId).reverse()
    : [];
  let result;
  try {
    const r = await callAI('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });
    if (!r.ok) throw new Error(`AI service status ${r.status}`);
    result = await r.json();
  } catch (err) {
    throw new HttpError(503, 'Trợ lý AI hiện chưa phản hồi. Bạn vẫn có thể tiếp tục xem và mua sắm bình thường.', { code: 'ai_unavailable' });
  }
  // Kiểm chứng sản phẩm AI đề xuất với CSDL (giá/tồn kho lấy từ nguồn chính).
  const all = C.loadAll();
  const cards = (Array.isArray(result.productIds) ? result.productIds : [])
    .map((id) => all.find((p) => p.id === Number(id) && p.inStock))
    .filter(Boolean)
    .slice(0, 3)
    .map((p) => ({
      id: p.id, slug: p.slug, name: p.name, category: p.category, price: p.price, salePrice: p.salePrice,
      effectivePrice: p.effectivePrice, image: p.images[0] || null, colors: p.colors,
      sizes: p.variants.filter((v) => v.stock > 0).map((v) => v.size),
    }));
  const reply = String(result.reply || '').slice(0, 1500);
  if (!convId) convId = Number(db.prepare('INSERT INTO conversations (user_id) VALUES (?)').run(user ? user.id : null).lastInsertRowid);
  const ins = db.prepare('INSERT INTO messages (conversation_id,role,content,product_ids) VALUES (?,?,?,?)');
  ins.run(convId, 'user', message, '[]');
  ins.run(convId, 'assistant', reply, JSON.stringify(cards.map((c) => c.id)));
  return { conversationId: convId, reply, products: cards };
}, {});

// Dịch vụ Python lấy danh mục sản phẩm thật qua kênh nội bộ có khóa
route('GET', '/api/internal/catalog', () => ({
  products: C.loadAll(),
  shipping: { fee: config.SHIPPING_FEE, freeThreshold: config.FREE_SHIPPING_THRESHOLD },
  coupons: db.prepare("SELECT code,percent,min_order FROM coupons WHERE active = 1 AND is_public = 1 AND (expires_at IS NULL OR expires_at >= date('now'))").all(),
}), { internal: true });

// ---------------------------------------------------------------------------
// Quản trị
// ---------------------------------------------------------------------------
route('GET', '/api/admin/stats', () => {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const byStatus = db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all();
  const revenue = one("SELECT COALESCE(SUM(total),0) AS v FROM orders WHERE status != 'cancelled'").v;
  const daily = db.prepare(`SELECT date(created_at) AS d, COUNT(*) AS orders, SUM(total) AS revenue
    FROM orders WHERE status != 'cancelled' AND created_at >= date('now','-6 days') GROUP BY d ORDER BY d`).all();
  const lowStock = db.prepare(`SELECT p.name, v.color, v.size, v.stock FROM variants v JOIN products p ON p.id = v.product_id
    WHERE p.active = 1 AND v.stock <= 2 ORDER BY v.stock, p.name LIMIT 10`).all();
  return {
    revenue,
    orderCount: one('SELECT COUNT(*) AS n FROM orders').n,
    productCount: one('SELECT COUNT(*) AS n FROM products').n,
    userCount: one("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'").n,
    byStatus,
    daily,
    lowStock,
    demoProducts: one('SELECT COUNT(*) AS n FROM products WHERE is_demo = 1').n,
  };
}, { admin: true });

route('GET', '/api/admin/products', () => ({ products: C.loadAll(true) }), { admin: true });

function validateProductInput(b) {
  const name = String(b.name || '').trim();
  const category = String(b.category || '').trim();
  if (!name || !category) throw new HttpError(400, 'Tên và danh mục là bắt buộc.');
  if (!C.GENDERS.includes(b.gender)) throw new HttpError(400, 'Giới tính không hợp lệ.');
  const price = Math.round(Number(b.price));
  if (!(price >= 0)) throw new HttpError(400, 'Giá không hợp lệ.');
  let sale = b.salePrice === '' || b.salePrice == null ? null : Math.round(Number(b.salePrice));
  if (sale != null && (!(sale >= 0) || sale >= price)) throw new HttpError(400, 'Giá khuyến mãi phải nhỏ hơn giá gốc.');
  const images = (Array.isArray(b.images) ? b.images : []).map((s) => String(s).trim()).filter(Boolean);
  if (images.some((u) => !/^(\/assets\/|https:\/\/)/.test(u))) throw new HttpError(400, 'Ảnh phải là đường dẫn /assets/... hoặc https://...');
  const variants = (Array.isArray(b.variants) ? b.variants : []).map((v) => ({
    color: String(v.color || '').trim(), size: Math.round(Number(v.size)), stock: Math.round(Number(v.stock)),
  }));
  if (variants.some((v) => !v.color || !(v.size >= 20 && v.size <= 55) || !(v.stock >= 0))) {
    throw new HttpError(400, 'Biến thể không hợp lệ (màu, size 20–55, tồn kho ≥ 0).');
  }
  return {
    name, category, gender: b.gender, price, sale, images, variants,
    description: String(b.description || '').trim(), isNew: b.isNew ? 1 : 0, active: b.active === false ? 0 : 1,
  };
}

function slugify(s) {
  return C.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'san-pham';
}

function saveVariants(productId, variants) {
  const up = db.prepare(`INSERT INTO variants (product_id,color,size,stock) VALUES (?,?,?,?)
    ON CONFLICT(product_id,color,size) DO UPDATE SET stock = excluded.stock`);
  for (const v of variants) up.run(productId, v.color, v.size, v.stock);
  // Biến thể bị bỏ khỏi danh sách: đặt tồn kho = 0 (không xóa để giữ lịch sử đơn hàng).
  const keep = new Set(variants.map((v) => `${v.color}|${v.size}`));
  for (const row of db.prepare('SELECT id,color,size FROM variants WHERE product_id = ?').all(productId)) {
    if (!keep.has(`${row.color}|${row.size}`)) db.prepare('UPDATE variants SET stock = 0 WHERE id = ?').run(row.id);
  }
}

route('POST', '/api/admin/products', ({ body }) => {
  const p = validateProductInput(body);
  let slug = slugify(p.name);
  let n = 1;
  while (db.prepare('SELECT 1 FROM products WHERE slug = ?').get(slug)) slug = `${slugify(p.name)}-${++n}`;
  const id = tx(() => {
    const r = db.prepare(`INSERT INTO products (slug,name,description,category,gender,price,sale_price,is_new,images,active)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(slug, p.name, p.description, p.category, p.gender, p.price, p.sale, p.isNew, JSON.stringify(p.images), p.active);
    saveVariants(r.lastInsertRowid, p.variants);
    return r.lastInsertRowid;
  });
  return { status: 201, data: { id: Number(id), slug } };
}, { admin: true });

route('PUT', '/api/admin/products/:id', ({ params, body }) => {
  const id = Number(params.id);
  if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(id)) throw new HttpError(404, 'Không tìm thấy sản phẩm.');
  const p = validateProductInput(body);
  tx(() => {
    db.prepare(`UPDATE products SET name=?,description=?,category=?,gender=?,price=?,sale_price=?,is_new=?,images=?,active=? WHERE id=?`)
      .run(p.name, p.description, p.category, p.gender, p.price, p.sale, p.isNew, JSON.stringify(p.images), p.active, id);
    saveVariants(id, p.variants);
  });
  return { ok: true };
}, { admin: true });

route('GET', '/api/admin/orders', () => {
  const codes = db.prepare('SELECT code FROM orders ORDER BY id DESC').all();
  const users = new Map(db.prepare('SELECT id,name,email FROM users').all().map((u) => [u.id, u]));
  return {
    orders: codes.map((r) => {
      const o = C.getOrder(r.code);
      const u = users.get(o.userId);
      return { ...o, customer: u ? { name: u.name, email: u.email } : null, allowedNext: C.STATUS_FLOW[o.status] };
    }),
  };
}, { admin: true });

route('PUT', '/api/admin/orders/:code/status', ({ params, body }) => ({
  order: C.changeOrderStatus(params.code, String(body.status || ''), { actorIsAdmin: true }),
}), { admin: true });

route('PUT', '/api/admin/orders/:code/paid', ({ params }) => {
  const r = db.prepare("UPDATE orders SET payment_status='paid', updated_at=datetime('now') WHERE code = ? AND status != 'cancelled'").run(params.code);
  if (!r.changes) throw new HttpError(404, 'Không thể cập nhật thanh toán cho đơn này.');
  return { order: C.getOrder(params.code) };
}, { admin: true });

route('GET', '/api/admin/users', () => ({
  users: db.prepare(`SELECT u.id,u.email,u.name,u.phone,u.role,u.created_at,
    (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orderCount FROM users u ORDER BY u.id`).all(),
}), { admin: true });

route('GET', '/api/admin/coupons', () => ({
  coupons: db.prepare('SELECT code,percent,min_order AS minOrder,active,is_public AS isPublic,is_demo AS isDemo,expires_at AS expiresAt FROM coupons ORDER BY code').all(),
}), { admin: true });

route('POST', '/api/admin/coupons', ({ body }) => {
  const code = String(body.code || '').trim().toUpperCase();
  const percent = Math.round(Number(body.percent));
  const minOrder = Math.round(Number(body.minOrder || 0));
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) throw new HttpError(400, 'Mã gồm 3–20 ký tự chữ hoa, số, - hoặc _.');
  if (!(percent >= 1 && percent <= 90)) throw new HttpError(400, 'Phần trăm giảm từ 1 đến 90.');
  if (db.prepare('SELECT 1 FROM coupons WHERE code = ?').get(code)) throw new HttpError(409, 'Mã đã tồn tại.');
  db.prepare('INSERT INTO coupons (code,percent,min_order,active,is_public,expires_at) VALUES (?,?,?,1,?,?)')
    .run(code, percent, Math.max(0, minOrder), body.isPublic ? 1 : 0, body.expiresAt || null);
  return { status: 201, data: { ok: true } };
}, { admin: true });

route('PUT', '/api/admin/coupons/:code', ({ params, body }) => {
  const r = db.prepare('UPDATE coupons SET active = ?, is_public = ? WHERE code = ?')
    .run(body.active ? 1 : 0, body.isPublic ? 1 : 0, params.code);
  if (!r.changes) throw new HttpError(404, 'Không tìm thấy mã.');
  return { ok: true };
}, { admin: true });

// ---------------------------------------------------------------------------
// Tệp tĩnh
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html'; // SPA: mọi đường dẫn không có đuôi → index.html
  const file = path.normalize(path.join(config.PUBLIC_DIR, rel));
  if (!file.startsWith(config.PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Không tìm thấy tài nguyên.'); }
    const ext = path.extname(file).toLowerCase();
    const isAsset = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.ico'].includes(ext);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': isAsset ? 'public, max-age=86400' : 'no-cache',
      ...SECURITY_HEADERS,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// ---------------------------------------------------------------------------
// Vòng xử lý yêu cầu
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  try {
    const r = routes.find((x) => x.method === req.method && x.re.test(pathname));
    if (!r) {
      if (routes.some((x) => x.re.test(pathname))) throw new HttpError(405, 'Phương thức không được hỗ trợ.');
      throw new HttpError(404, 'Không tìm thấy API.');
    }
    const m = pathname.match(r.re);
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    const user = currentUser(req);
    if (r.internal && req.headers['x-internal-token'] !== config.INTERNAL_TOKEN) throw new HttpError(403, 'Không được phép.');
    if ((r.auth || r.admin) && !user) throw new HttpError(401, 'Vui lòng đăng nhập.');
    if (r.admin && user.role !== 'admin') throw new HttpError(403, 'Bạn không có quyền truy cập.');
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    const out = await r.handler({ req, res, params, query: Object.fromEntries(url.searchParams), body, user });
    if (out && out.status && out.data !== undefined) send(res, out.status, out.data);
    else send(res, 200, out);
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message, ...err.extra });
    console.error('[server error]', err);
    send(res, 500, { error: 'Đã xảy ra lỗi máy chủ.' });
  }
});

if (require.main === module) {
  server.listen(config.PORT, () => {
    console.log(`${config.STORE.name} chạy tại http://localhost:${config.PORT}`);
  });
}

module.exports = { server };

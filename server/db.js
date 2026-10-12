'use strict';
/**
 * Lớp dữ liệu: SQLite (node:sqlite) + schema + dữ liệu demo.
 * Dữ liệu demo được gắn cờ is_demo = 1 để tách khỏi dữ liệu thật.
 */
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');
const { hashPassword } = require('./auth');

const db = new DatabaseSync(config.DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  line TEXT NOT NULL,
  district TEXT NOT NULL,
  city TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('nam','nu','unisex')),
  price INTEGER NOT NULL CHECK (price >= 0),
  sale_price INTEGER CHECK (sale_price IS NULL OR sale_price >= 0),
  is_new INTEGER NOT NULL DEFAULT 0,
  images TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color TEXT NOT NULL,
  size INTEGER NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  UNIQUE (product_id, color, size)
);
CREATE TABLE IF NOT EXISTS wishlist (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, product_id)
);
CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  percent INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 90),
  min_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  is_public INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','shipping','delivered','cancelled')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cod','bank_transfer')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid')),
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  shipping INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  coupon_code TEXT,
  ship_name TEXT NOT NULL,
  ship_phone TEXT NOT NULL,
  ship_address TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT NOT NULL,
  size INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  image TEXT
);
-- Hội thoại AI (thay thế vai trò MongoDB trong môi trường hiện tại).
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  product_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
`);

/** Chạy hàm trong một transaction; rollback nếu có lỗi. */
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Dữ liệu demo (chỉ dùng cho phát triển/bảo vệ đồ án; giá & tồn kho là giả lập)
// ---------------------------------------------------------------------------
const DEMO_PRODUCTS = [
  { slug: 'velo-run-01', name: 'Velo Run 01', category: 'Chạy bộ', gender: 'unisex', price: 2290000, sale: null, isNew: 1, img: 'velo-run.jpg', color: 'Trắng',
    desc: 'Giày chạy bộ hằng ngày với thân giày lưới thoáng khí và đế giữa êm, phù hợp các buổi chạy nhẹ đến trung bình.',
    sizes: { 38: 4, 39: 6, 40: 8, 41: 8, 42: 6, 43: 3, 44: 0 } },
  { slug: 'court-classic-low', name: 'Court Classic Low', category: 'Lifestyle', gender: 'nam', price: 1890000, sale: null, isNew: 1, img: 'court-classic.jpg', color: 'Trắng',
    desc: 'Mẫu sneaker cổ thấp bằng da màu trắng, đế cao su màu mật ong, dễ phối đồ đi học, đi làm và dạo phố.',
    sizes: { 39: 3, 40: 5, 41: 7, 42: 7, 43: 4, 44: 2 } },
  { slug: 'trail-ridge', name: 'Trail Ridge', category: 'Dã ngoại', gender: 'nam', price: 2790000, sale: 2390000, isNew: 0, img: 'trail-ridge.jpg', color: 'Đen',
    desc: 'Giày địa hình đế gai sâu, mũi giày gia cố, phù hợp đường mòn, đi bộ đường dài và dã ngoại.',
    sizes: { 40: 4, 41: 5, 42: 5, 43: 3, 44: 1 } },
  { slug: 'pulse-knit-w', name: 'Pulse Knit W', category: 'Chạy bộ', gender: 'nu', price: 2090000, sale: null, isNew: 1, img: 'pulse-knit.jpg', color: 'Hồng',
    desc: 'Giày chạy nữ thân vải dệt kim nhẹ, ôm chân, đế giữa trắng êm cho các buổi tập hằng ngày.',
    sizes: { 35: 3, 36: 6, 37: 8, 38: 8, 39: 5, 40: 2 } },
  { slug: 'hardwood-pro-high', name: 'Hardwood Pro High', category: 'Bóng rổ', gender: 'nam', price: 3190000, sale: 2690000, isNew: 0, img: 'hardwood-pro.jpg', color: 'Đen',
    desc: 'Giày bóng rổ cổ cao, ôm cổ chân, đế dày đệm tốt và đế ngoài bám sân.',
    sizes: { 41: 3, 42: 4, 43: 4, 44: 3, 45: 2 } },
  { slug: 'cloud-walker', name: 'Cloud Walker', category: 'Đi bộ', gender: 'nu', price: 1990000, sale: 1590000, isNew: 0, img: 'cloud-walker.jpg', color: 'Xám',
    desc: 'Giày đi bộ thân da lộn và lưới màu xám, đế dày êm, phù hợp đi làm và đi bộ cả ngày.',
    sizes: { 36: 4, 37: 6, 38: 6, 39: 4, 40: 2 } },
  { slug: 'street-mid-black', name: 'Street Mid Black', category: 'Lifestyle', gender: 'unisex', price: 2490000, sale: null, isNew: 1, img: 'street-mid.jpg', color: 'Đen',
    desc: 'Sneaker cổ lửng toàn đen, kết hợp da và vải kỹ thuật, đế gai chắc chắn cho phong cách đường phố.',
    sizes: { 38: 2, 39: 4, 40: 6, 41: 6, 42: 5, 43: 3 } },
  { slug: 'sprint-elite', name: 'Sprint Elite', category: 'Chạy bộ', gender: 'nam', price: 3490000, sale: null, isNew: 0, img: 'sprint-elite.jpg', color: 'Xanh dương',
    desc: 'Giày chạy tốc độ nhẹ với thân lưới thoáng và đế có tấm cứng hỗ trợ đẩy, dành cho bài chạy nhanh và thi đấu.',
    sizes: { 40: 2, 41: 3, 42: 3, 43: 2 } },
];

function seedDemo() {
  const hasUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const hasProducts = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  tx(() => {
    if (!hasUsers) {
      const ins = db.prepare('INSERT INTO users (email,name,phone,password_hash,role,is_demo) VALUES (?,?,?,?,?,1)');
      ins.run('admin@stridex.local', 'Quản trị viên (demo)', null, hashPassword('Admin@123'), 'admin');
      ins.run('demo@stridex.local', 'Khách hàng demo', '0900000000', hashPassword('Demo@123'), 'customer');
    }
    if (!hasProducts) {
      const insP = db.prepare(`INSERT INTO products
        (slug,name,description,category,gender,price,sale_price,is_new,images,is_demo)
        VALUES (?,?,?,?,?,?,?,?,?,1)`);
      const insV = db.prepare('INSERT INTO variants (product_id,color,size,stock) VALUES (?,?,?,?)');
      for (const p of DEMO_PRODUCTS) {
        const r = insP.run(p.slug, p.name, p.desc, p.category, p.gender, p.price, p.sale, p.isNew,
          JSON.stringify([`/assets/products/${p.img}`]));
        for (const [size, stock] of Object.entries(p.sizes)) {
          insV.run(r.lastInsertRowid, p.color, Number(size), stock);
        }
      }
      db.prepare(`INSERT OR IGNORE INTO coupons (code,percent,min_order,active,is_public,is_demo)
        VALUES ('WELCOME10',10,1000000,1,1,1)`).run();
    }
  });
}

if (config.SEED_DEMO) seedDemo();

module.exports = { db, tx };

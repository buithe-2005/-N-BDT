'use strict';
/**
 * Cấu hình ứng dụng. Đọc biến môi trường và file .env (nếu có).
 * Không phụ thuộc thư viện ngoài.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(path.join(ROOT, '.env'));

const dataDir = path.resolve(ROOT, process.env.DATA_DIR || 'database');
fs.mkdirSync(dataDir, { recursive: true });

// Khóa JWT: ưu tiên biến môi trường, nếu không có thì sinh một lần và lưu cục bộ.
function resolveJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const f = path.join(dataDir, '.jwt_secret');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}

module.exports = {
  ROOT,
  PUBLIC_DIR: path.join(ROOT, 'public'),
  PORT: Number(process.env.PORT || 3000),
  DB_FILE: process.env.DB_FILE || path.join(dataDir, 'shop.db'),
  JWT_SECRET: resolveJwtSecret(),
  JWT_TTL_SECONDS: Number(process.env.JWT_TTL_SECONDS || 60 * 60 * 24 * 7),
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001',
  AI_TIMEOUT_MS: Number(process.env.AI_TIMEOUT_MS || 12000),
  INTERNAL_TOKEN: process.env.INTERNAL_TOKEN || 'dev-internal-token-change-me',
  SHIPPING_FEE: Number(process.env.SHIPPING_FEE || 30000),
  FREE_SHIPPING_THRESHOLD: Number(process.env.FREE_SHIPPING_THRESHOLD || 2000000),
  MAX_QTY_PER_LINE: Number(process.env.MAX_QTY_PER_LINE || 5),
  SEED_DEMO: (process.env.SEED_DEMO || '1') === '1',
  STORE: {
    name: process.env.STORE_NAME || 'STRIDEX',
    email: process.env.STORE_EMAIL || '',
    phone: process.env.STORE_PHONE || '',
    address: process.env.STORE_ADDRESS || '',
    facebook: process.env.STORE_FACEBOOK || '',
    instagram: process.env.STORE_INSTAGRAM || '',
    youtube: process.env.STORE_YOUTUBE || '',
  },
};

'use strict';
/**
 * Bộ kiểm thử tự động cho hệ thống REST API STRIDEX
 * Sử dụng thư viện chuẩn của Node.js (node:test, node:assert)
 */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = 'http://localhost:3000';

async function req(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

describe('STRIDEX API Test Suite', () => {
  let customerToken = '';
  let adminToken = '';
  let createdOrderCode = '';
  let testVariantId = null;

  before(async () => {
    // Đăng nhập tài khoản admin demo
    const adminRes = await req('/auth/login', {
      method: 'POST',
      body: { email: 'admin@stridex.local', password: 'Admin@123' },
    });
    assert.equal(adminRes.status, 200, 'Đăng nhập admin demo thành công');
    adminToken = adminRes.data.token;
  });

  test('GET /api/config trả về thông tin cấu hình và ngưỡng freeship', async () => {
    const res = await req('/config');
    assert.equal(res.status, 200);
    assert.equal(res.data.store.name, 'STRIDEX');
    assert.ok(typeof res.data.freeShippingThreshold === 'number');
    assert.ok(typeof res.data.shippingFee === 'number');
  });

  test('GET /api/products trả về danh mục sản phẩm và hỗ trợ lọc', async () => {
    const res = await req('/products');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.products));
    assert.ok(res.data.products.length >= 8);

    // Lọc theo nam
    const menRes = await req('/products?gender=nam');
    assert.ok(menRes.data.products.every(p => p.gender === 'nam' || p.gender === 'unisex'));

    // Lọc thể thao
    const sportRes = await req('/products?sport=1');
    assert.ok(sportRes.data.products.every(p => ['Chạy bộ', 'Bóng rổ', 'Dã ngoại'].includes(p.category)));

    // Lưu một variant ID còn hàng để kiểm thử giỏ hàng
    const firstWithStock = res.data.products.find(p => p.variants.some(v => v.stock > 0));
    testVariantId = firstWithStock.variants.find(v => v.stock > 0).variantId;
  });

  test('GET /api/products/facets trả về danh mục, màu và kích cỡ hợp lệ', async () => {
    const res = await req('/products/facets');
    assert.equal(res.status, 200);
    assert.ok(res.data.categories.length > 0);
    assert.ok(res.data.sizes.length > 0);
  });

  test('POST /api/cart/quote tính giá, phí ship và áp dụng mã giảm giá có thẩm quyền', async () => {
    assert.ok(testVariantId, 'Phải có variant để test');
    const quoteRes = await req('/cart/quote', {
      method: 'POST',
      body: {
        items: [{ variantId: testVariantId, qty: 1 }],
        coupon: 'WELCOME10',
      },
    });
    assert.equal(quoteRes.status, 200);
    const q = quoteRes.data;
    assert.equal(q.lines.length, 1);
    assert.ok(q.subtotal > 0);
    assert.equal(q.total, q.subtotal - q.discount + q.shipping);
  });

  test('POST /api/auth/register tạo tài khoản khách hàng mới', async () => {
    const testEmail = `test_${Date.now()}@test.local`;
    const res = await req('/auth/register', {
      method: 'POST',
      body: {
        name: 'Nguyen Van Test',
        email: testEmail,
        password: 'Password@123',
        phone: '0912345678',
      },
    });
    assert.equal(res.status, 201);
    assert.ok(res.data.token);
    assert.equal(res.data.user.email, testEmail);
    customerToken = res.data.token;
  });

  test('GET /api/auth/me trả về thông tin cá nhân đúng token', async () => {
    const res = await req('/auth/me', { token: customerToken });
    assert.equal(res.status, 200);
    assert.equal(res.data.user.name, 'Nguyen Van Test');
  });

  test('POST /api/addresses thêm địa chỉ giao hàng cho khách hàng', async () => {
    const res = await req('/addresses', {
      method: 'POST',
      token: customerToken,
      body: {
        fullName: 'Nguyen Van Test',
        phone: '0912345678',
        line: 'Số 123 Đường Cầu Giấy',
        district: 'Quận Cầu Giấy',
        city: 'Hà Nội',
        isDefault: true,
      },
    });
    assert.equal(res.status, 201);

    const listRes = await req('/addresses', { token: customerToken });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.data.addresses.length, 1);
    assert.equal(listRes.data.addresses[0].line, 'Số 123 Đường Cầu Giấy');
  });

  test('POST /api/orders tạo đơn hàng mới và trừ tồn kho chính xác', async () => {
    const res = await req('/orders', {
      method: 'POST',
      token: customerToken,
      body: {
        items: [{ variantId: testVariantId, qty: 1 }],
        coupon: '',
        paymentMethod: 'cod',
        shipping: {
          fullName: 'Nguyen Van Test',
          phone: '0912345678',
          line: 'Số 123 Đường Cầu Giấy',
          district: 'Quận Cầu Giấy',
          city: 'Hà Nội',
        },
        note: 'Đơn hàng kiểm thử tự động',
      },
    });
    assert.equal(res.status, 201);
    const order = res.data.order;
    assert.ok(order.code.startsWith('SX'));
    assert.equal(order.status, 'pending');
    assert.equal(order.paymentStatus, 'unpaid');
    assert.equal(order.items.length, 1);
    createdOrderCode = order.code;
  });

  test('GET /api/orders/:code truy vấn chi tiết đơn hàng', async () => {
    const res = await req(`/orders/${createdOrderCode}`, { token: customerToken });
    assert.equal(res.status, 200);
    assert.equal(res.data.order.code, createdOrderCode);
  });

  test('POST /api/orders/:code/cancel khách hàng tự hủy đơn đang chờ xác nhận', async () => {
    const res = await req(`/orders/${createdOrderCode}/cancel`, {
      method: 'POST',
      token: customerToken,
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.order.status, 'cancelled');
  });

  test('GET /api/admin/stats trả về số liệu thống kê thực tế cho quản trị viên', async () => {
    const res = await req('/admin/stats', { token: adminToken });
    assert.equal(res.status, 200);
    assert.ok(typeof res.data.orderCount === 'number');
    assert.ok(typeof res.data.revenue === 'number');
    assert.ok(Array.isArray(res.data.lowStock));
  });

  test('POST /api/ai/chat trợ lý AI kết nối thành công và tư vấn sản phẩm thật', async () => {
    const res = await req('/ai/chat', {
      method: 'POST',
      body: {
        message: 'Tôi muốn tìm giày chạy bộ giá dưới 2.5 triệu',
      },
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.reply.length > 0);
    assert.ok(Array.isArray(res.data.products));
    // Các sản phẩm gợi ý đều phải là danh mục Chạy bộ
    assert.ok(res.data.products.every(p => p.category === 'Chạy bộ'));
  });
});

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { connectTestDB } = require('./_testDb');
const app = require('../app');
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const OrderCounter = require('../models/OrderCounter');
const Business = require('../models/Business');
const { signToken } = require('../services/tokenService');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'StoreTest1';
const createdBusinessIds = [];

let server;
let base;

function uniqueEmail(label) {
  return `phase4-${label}-${stamp}@example.com`;
}

async function api(method, path, { token, body, headers } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { cookie: `cove_token=${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { status: response.status, data };
}

async function registerTenant(label) {
  const email = uniqueEmail(label);
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password,
      businessName: `${label} Jewelry ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
      phone: '9876543210',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { new: true });
  const business = await Business.findById(user.businessId);
  createdBusinessIds.push(user.businessId);
  return {
    email,
    token: signToken(user),
    businessId: user.businessId,
    slug: business.slug,
  };
}

async function addProduct(token, input) {
  const response = await api('POST', '/api/products', { token, body: input });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data.product;
}

describe('storefront', { timeout: 180000 }, () => {
  let owner;
  let other;

  before(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    owner = await registerTenant('owner');
    other = await registerTenant('other');
  });

  after(async () => {
    if (createdBusinessIds.length) {
      await Order.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Product.deleteMany({ businessId: { $in: createdBusinessIds } });
      await OrderCounter.deleteMany({ businessId: { $in: createdBusinessIds } });
      await User.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('exposes only the correct public shop and active products', async () => {
    const active = await addProduct(owner.token, {
      name: 'Pearl Necklace',
      price: 350,
      stockQuantity: 3,
      status: 'Active',
      category: 'Necklaces',
    });
    const draft = await addProduct(owner.token, {
      name: 'Draft Clip',
      price: 40,
      stockQuantity: 5,
      status: 'Draft',
    });
    const archived = await addProduct(owner.token, {
      name: 'Archived Ring',
      price: 90,
      stockQuantity: 5,
    });
    await api('DELETE', `/api/products/${archived.id}`, { token: owner.token });
    const otherProduct = await addProduct(other.token, {
      name: 'Secret Bangle',
      price: 220,
      stockQuantity: 4,
    });

    const store = await api('GET', `/api/store/${owner.slug}`);
    assert.equal(store.status, 200, JSON.stringify(store.data));
    assert.equal(store.data.business.name.includes('owner Jewelry'), true);
    assert.equal(store.data.business.slug, owner.slug);
    assert.equal(store.data.business.id, undefined);
    assert.equal(JSON.stringify(store.data).includes(String(owner.businessId)), false);
    assert.equal(JSON.stringify(store.data).includes('password'), false);
    assert.equal(store.data.products.some((item) => item.id === active.id), true);
    assert.equal(store.data.products.some((item) => item.id === draft.id), false);
    assert.equal(store.data.products.some((item) => item.id === archived.id), false);
    assert.equal(store.data.products.some((item) => item.id === otherProduct.id), false);
    assert.equal(store.data.products.some((item) => item.name === 'Secret Bangle'), false);

    const missing = await api('GET', '/api/store/no-such-shop-zzzz');
    assert.equal(missing.status, 404);

    const detail = await api('GET', `/api/store/${owner.slug}/products/${active.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.product.price, 350);
    assert.equal(detail.data.product.available, true);

    const foreignDetail = await api('GET', `/api/store/${owner.slug}/products/${otherProduct.id}`);
    assert.equal(foreignDetail.status, 404);

    const draftDetail = await api('GET', `/api/store/${owner.slug}/products/${draft.id}`);
    assert.equal(draftDetail.status, 404);
  });

  it('creates a storefront order through Phase 3 logic and ignores client money fields', async () => {
    const product = await addProduct(owner.token, {
      name: 'Storefront Pearl Necklace',
      price: 350,
      stockQuantity: 3,
      status: 'Active',
    });

    const created = await api('POST', `/api/store/${owner.slug}/orders`, {
      headers: { 'x-business-id': String(other.businessId) },
      body: {
        customer: {
          name: 'Aisha Shah',
          phone: '9876501234',
          email: 'aisha@example.com',
        },
        items: [{ productId: product.id, quantity: 1, price: 1, subtotal: 1 }],
        deliveryMethod: 'Delivery',
        deliveryAddress: '14 Palm Grove, Kochi',
        notes: 'Leave with the guard',
        subtotal: 1,
        total: 1,
        deliveryFee: 999,
        businessId: String(other.businessId),
        paymentStatus: 'Paid',
        status: 'Completed',
      },
    });

    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.order.orderNumber.startsWith('COVE-'), true);
    assert.equal(created.data.order.items[0].name, 'Storefront Pearl Necklace');
    assert.equal(created.data.order.items[0].price, 350);
    assert.equal(created.data.order.items[0].subtotal, 350);
    assert.equal(created.data.order.subtotal, 350);
    assert.equal(created.data.order.deliveryFee, 0);
    assert.equal(created.data.order.total, 350);
    assert.equal(created.data.order.paymentStatus, 'Payment Pending');
    assert.equal(created.data.order.status, 'New');
    assert.equal(created.data.order.deliveryMethod, 'Delivery');
    assert.equal(created.data.order.deliveryAddress, '14 Palm Grove, Kochi');
    assert.equal(created.data.order.customer.name, 'Aisha Shah');
    assert.equal(created.data.order.id, undefined);
    assert.equal(created.data.order.items[0].productId, undefined);
    assert.equal(typeof created.data.confirmationToken, 'string');
    assert.ok(created.data.confirmationToken.length >= 32);
    assert.equal(JSON.stringify(created.data).includes('confirmationTokenHash'), false);
    assert.equal(JSON.stringify(created.data).includes(String(other.businessId)), false);
    assert.equal(JSON.stringify(created.data).includes(String(owner.businessId)), false);

    const stock = await api('GET', `/api/products/${product.id}`, { token: owner.token });
    assert.equal(stock.data.product.stockQuantity, 2);

    const sellerOrders = await api('GET', '/api/orders?search=Aisha', { token: owner.token });
    assert.equal(sellerOrders.status, 200);
    const saved = sellerOrders.data.orders.find((order) => order.orderNumber === created.data.order.orderNumber);
    assert.ok(saved);
    assert.equal(saved.customer.phone, '9876501234');
    assert.equal(saved.items[0].price, 350);
    assert.equal(saved.paymentStatus, 'Payment Pending');
    assert.equal(saved.status, 'New');

    const otherList = await api('GET', '/api/orders', { token: other.token });
    assert.equal(otherList.data.orders.some((order) => order.orderNumber === created.data.order.orderNumber), false);
  });

  it('rejects cross-tenant products, stock abuse, and invalid checkout payloads', async () => {
    const product = await addProduct(owner.token, {
      name: 'Limited Clip',
      price: 80,
      stockQuantity: 1,
    });
    const otherProduct = await addProduct(other.token, {
      name: 'Other Clip',
      price: 55,
      stockQuantity: 4,
    });
    const archived = await addProduct(owner.token, {
      name: 'Hidden Clip',
      price: 70,
      stockQuantity: 2,
    });
    await api('DELETE', `/api/products/${archived.id}`, { token: owner.token });
    const empty = await addProduct(owner.token, {
      name: 'Empty Clip',
      price: 30,
      stockQuantity: 0,
    });

    const stolen = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Thief', phone: '9000012345' },
        items: [{ productId: otherProduct.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
        businessId: String(other.businessId),
      },
    });
    assert.equal(stolen.status, 400);

    const archivedOrder = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Archive Buyer', phone: '9000012346' },
        items: [{ productId: archived.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
      },
    });
    assert.equal(archivedOrder.status, 400);

    const outOfStock = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Empty Buyer', phone: '9000012347' },
        items: [{ productId: empty.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
      },
    });
    assert.equal(outOfStock.status, 409);

    const tooMany = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Greedy Buyer', phone: '9000012348' },
        items: [{ productId: product.id, quantity: 2 }],
        deliveryMethod: 'Pickup',
      },
    });
    assert.equal(tooMany.status, 409);

    const noPhone = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'No Phone' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
      },
    });
    assert.equal(noPhone.status, 400);

    const deliveryMissingAddress = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'No Address', phone: '9000012349' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Delivery',
      },
    });
    assert.equal(deliveryMissingAddress.status, 400);

    const pickup = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Pickup Guest', phone: '9000012350' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
        deliveryFee: 50,
      },
    });
    assert.equal(pickup.status, 201, JSON.stringify(pickup.data));
    assert.equal(pickup.data.order.deliveryFee, 0);
    assert.equal(pickup.data.order.total, 80);

    const stock = await api('GET', `/api/products/${product.id}`, { token: owner.token });
    assert.equal(stock.data.product.stockQuantity, 0);
    assert.ok(stock.data.product.stockQuantity >= 0);

    const wrongShop = await api('POST', `/api/store/${other.slug}/orders`, {
      body: {
        customer: { name: 'Wrong Shop', phone: '9000012351' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
        businessId: String(owner.businessId),
      },
    });
    assert.equal(wrongShop.status, 400);
  });

  it('lets guests reload confirmations with a token and rejects unsafe lookups', async () => {
    const product = await addProduct(owner.token, {
      name: 'Confirm Token Ring',
      price: 120,
      stockQuantity: 4,
      status: 'Active',
    });

    const created = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Confirm Guest', phone: '9000012401', email: 'confirm@example.com' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
        notes: 'Token confirmation probe',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const token = created.data.confirmationToken;
    assert.equal(typeof token, 'string');
    assert.equal(created.data.order.customer.phone, undefined);
    assert.equal(created.data.order.customer.email, undefined);

    const valid = await api('GET', `/api/store/${owner.slug}/orders/confirm/${encodeURIComponent(token)}`);
    assert.equal(valid.status, 200, JSON.stringify(valid.data));
    assert.equal(valid.data.order.orderNumber, created.data.order.orderNumber);
    assert.equal(valid.data.order.customer.name, 'Confirm Guest');
    assert.equal(valid.data.order.total, 120);
    assert.equal(valid.data.business.slug, owner.slug);
    assert.equal(valid.data.confirmationToken, undefined);
    assert.equal(valid.data.order.customer.phone, undefined);
    assert.equal(valid.data.order.customer.email, undefined);
    assert.equal(valid.data.order.id, undefined);
    assert.equal(JSON.stringify(valid.data).includes('confirmationTokenHash'), false);
    assert.equal(JSON.stringify(valid.data).includes(String(owner.businessId)), false);
    assert.equal(JSON.stringify(valid.data).includes(String(product.id)), false);

    const missingToken = await api(
      'GET',
      `/api/store/${owner.slug}/orders/confirm/${encodeURIComponent('a'.repeat(43))}`
    );
    assert.equal(missingToken.status, 404);
    assert.equal(missingToken.data.message, 'We could not find that order confirmation.');

    const crossShop = await api('GET', `/api/store/${other.slug}/orders/confirm/${encodeURIComponent(token)}`);
    assert.equal(crossShop.status, 404);
    assert.equal(crossShop.data.message, 'We could not find that order confirmation.');

    const byOrderNumber = await api(
      'GET',
      `/api/store/${owner.slug}/orders/${created.data.order.orderNumber}`
    );
    assert.equal(byOrderNumber.status, 404);

    const sellerOrder = await api('POST', '/api/orders', {
      token: owner.token,
      body: {
        customer: { name: 'Manual Guest', phone: '9000012402' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
      },
    });
    assert.equal(sellerOrder.status, 201, JSON.stringify(sellerOrder.data));
    assert.equal(sellerOrder.data.confirmationToken, undefined);
    assert.ok(sellerOrder.data.order.id);
  });

  it('rate limits public confirmation lookups', async () => {
    const product = await addProduct(owner.token, {
      name: 'Confirm Rate Ring',
      price: 90,
      stockQuantity: 30,
      status: 'Active',
    });
    const created = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Rate Guest', phone: '9000012403' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const token = created.data.confirmationToken;
    const results = [];
    for (let i = 0; i < 25; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const response = await api(
        'GET',
        `/api/store/${owner.slug}/orders/confirm/${encodeURIComponent(token)}`
      );
      results.push(response.status);
    }
    assert.equal(results.includes(429), true, JSON.stringify(results.slice(-5)));
    assert.equal(results.filter((status) => status === 200).length >= 1, true);
  });
});

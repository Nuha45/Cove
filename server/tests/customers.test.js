const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { connectTestDB } = require('./_testDb');
const app = require('../app');
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const OrderCounter = require('../models/OrderCounter');
const Business = require('../models/Business');
const { signToken } = require('../services/tokenService');
const { normalizePhone } = require('../utils/phone');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'CustomerTest1';
const createdBusinessIds = [];

let server;
let base;

function uniqueEmail(label) {
  return `phase5-${label}-${stamp}@example.com`;
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
      businessName: `${label} Shop ${stamp.slice(-6)}`,
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

describe('customers', { timeout: 180000 }, () => {
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
      await Customer.deleteMany({ businessId: { $in: createdBusinessIds } });
      await OrderCounter.deleteMany({ businessId: { $in: createdBusinessIds } });
      await User.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('creates and reuses customers from storefront orders with server-owned stats', async () => {
    const product = await addProduct(owner.token, {
      name: 'Pearl Necklace',
      price: 350,
      stockQuantity: 5,
    });

    const first = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: {
          name: 'Aisha Shah',
          phone: '+91 98765 43210',
          email: 'aisha@example.com',
        },
        items: [{ productId: product.id, quantity: 1, price: 1 }],
        deliveryMethod: 'Delivery',
        deliveryAddress: '12 Palm Street, Kochi',
        totalOrders: 99,
        totalSpent: 1,
        lastOrderAt: '2000-01-01',
        customerId: String(other.businessId),
        businessId: String(other.businessId),
        total: 1,
      },
    });
    assert.equal(first.status, 201, JSON.stringify(first.data));
    assert.equal(first.data.order.total, 350);
    assert.equal(JSON.stringify(first.data).includes('notes'), true);
    assert.equal(JSON.stringify(first.data).toLowerCase().includes('prefers'), false);

    const customersAfterFirst = await api('GET', '/api/customers', { token: owner.token });
    assert.equal(customersAfterFirst.status, 200);
    assert.equal(customersAfterFirst.data.total, 1);
    const aisha = customersAfterFirst.data.customers[0];
    assert.equal(aisha.name, 'Aisha Shah');
    assert.equal(aisha.totalOrders, 1);
    assert.equal(aisha.totalSpent, 350);
    assert.ok(aisha.lastOrderAt);
    assert.equal(aisha.notes, '');

    const second = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: {
          name: 'Aisha S',
          phone: '9876543210',
          email: 'aisha.updated@example.com',
        },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
      },
    });
    assert.equal(second.status, 201, JSON.stringify(second.data));

    const customersAfterSecond = await api('GET', '/api/customers', { token: owner.token });
    assert.equal(customersAfterSecond.data.total, 1);
    const reused = customersAfterSecond.data.customers[0];
    assert.equal(reused.id, aisha.id);
    assert.equal(reused.totalOrders, 2);
    assert.equal(reused.totalSpent, 700);
    assert.equal(reused.email, 'aisha.updated@example.com');
    assert.equal(normalizePhone(reused.phone), '9876543210');

    const sellerOrder = await api('GET', `/api/orders?search=${second.data.order.orderNumber}`, {
      token: owner.token,
    });
    const linked = sellerOrder.data.orders.find((order) => order.orderNumber === second.data.order.orderNumber);
    assert.equal(linked.customerId, aisha.id);

    const history = await api('GET', `/api/customers/${aisha.id}/orders`, { token: owner.token });
    assert.equal(history.status, 200);
    assert.equal(history.data.total, 2);

    const note = await api('PATCH', `/api/customers/${aisha.id}`, {
      token: owner.token,
      body: {
        notes: 'Prefers gold finish',
        totalOrders: 50,
        totalSpent: 1,
        businessId: String(other.businessId),
      },
    });
    assert.equal(note.status, 200, JSON.stringify(note.data));
    assert.equal(note.data.customer.notes, 'Prefers gold finish');
    assert.equal(note.data.customer.totalOrders, 2);
    assert.equal(note.data.customer.totalSpent, 700);

    const store = await api('GET', `/api/store/${owner.slug}`);
    assert.equal(JSON.stringify(store.data).includes('Prefers gold finish'), false);
    assert.equal(JSON.stringify(store.data).includes(aisha.id), false);
    assert.equal(JSON.stringify(store.data).includes('totalSpent'), false);

    const publicOrder = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Aisha Shah', phone: '919876543210' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
      },
    });
    assert.equal(publicOrder.status, 201);
    assert.equal(JSON.stringify(publicOrder.data).includes('Prefers gold finish'), false);
    assert.equal(JSON.stringify(publicOrder.data).includes(aisha.id), false);

    const afterThird = await api('GET', `/api/customers/${aisha.id}`, { token: owner.token });
    assert.equal(afterThird.data.customer.totalOrders, 3);
    assert.equal(afterThird.data.customer.totalSpent, 1050);
  });

  it('isolates customers across businesses and rejects unauthenticated access', async () => {
    const product = await addProduct(owner.token, {
      name: 'Tenant Clip',
      price: 80,
      stockQuantity: 3,
    });
    const otherProduct = await addProduct(other.token, {
      name: 'Other Clip',
      price: 60,
      stockQuantity: 3,
    });

    await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Shared Phone Owner', phone: '9000011111' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
      },
    });
    await api('POST', `/api/store/${other.slug}/orders`, {
      body: {
        customer: { name: 'Shared Phone Other', phone: '9000011111' },
        items: [{ productId: otherProduct.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
      },
    });

    const ownerList = await api('GET', `/api/customers?businessId=${other.businessId}`, {
      token: owner.token,
      headers: { 'x-business-id': String(other.businessId) },
    });
    assert.equal(ownerList.status, 200);
    assert.equal(ownerList.data.customers.every((item) => item.name !== 'Shared Phone Other'), true);
    const ownerCustomer = ownerList.data.customers.find((item) => item.phone.includes('9000011111'));
    assert.ok(ownerCustomer);

    const otherList = await api('GET', '/api/customers', { token: other.token });
    const otherCustomer = otherList.data.customers.find((item) => item.phone.includes('9000011111'));
    assert.ok(otherCustomer);
    assert.notEqual(ownerCustomer.id, otherCustomer.id);

    const crossGet = await api('GET', `/api/customers/${ownerCustomer.id}`, { token: other.token });
    assert.equal(crossGet.status, 404);

    const crossPatch = await api('PATCH', `/api/customers/${ownerCustomer.id}`, {
      token: other.token,
      body: { notes: 'Stolen note', businessId: String(owner.businessId) },
    });
    assert.equal(crossPatch.status, 404);

    const unauth = await Promise.all([
      api('GET', '/api/customers'),
      api('GET', `/api/customers/${ownerCustomer.id}`),
      api('PATCH', `/api/customers/${ownerCustomer.id}`, { body: { notes: 'Nope' } }),
    ]);
    unauth.forEach((response) => assert.equal(response.status, 401));

    const badId = await api('GET', '/api/customers/not-an-id', { token: owner.token });
    assert.equal(badId.status, 400);
    const missing = await api('GET', `/api/customers/${new mongoose.Types.ObjectId()}`, {
      token: owner.token,
    });
    assert.equal(missing.status, 404);
  });

  it('handles cancellation stats, failed orders, and manual orders', async () => {
    const product = await addProduct(owner.token, {
      name: 'Cancel Beads',
      price: 120,
      stockQuantity: 2,
    });
    const empty = await addProduct(owner.token, {
      name: 'Empty Tray',
      price: 40,
      stockQuantity: 0,
    });

    const beforeCustomers = await Customer.countDocuments({ businessId: owner.businessId });
    const failed = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Failed Guest', phone: '9000022222' },
        items: [
          { productId: product.id, quantity: 1 },
          { productId: empty.id, quantity: 1 },
        ],
        deliveryMethod: 'Pickup',
      },
    });
    assert.equal(failed.status, 409);
    const afterFailed = await Customer.countDocuments({ businessId: owner.businessId });
    assert.equal(afterFailed, beforeCustomers);
    const stock = await api('GET', `/api/products/${product.id}`, { token: owner.token });
    assert.equal(stock.data.product.stockQuantity, 2);

    const created = await api('POST', '/api/orders', {
      token: owner.token,
      body: {
        customer: { name: 'Manual Guest', phone: '9000033333', email: 'manual@example.com' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
        customerId: String(other.businessId),
        totalOrders: 9,
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.order.customerId !== String(other.businessId), true);

    const listed = await api('GET', '/api/customers?search=9000033333', { token: owner.token });
    assert.equal(listed.data.total, 1);
    const manualCustomer = listed.data.customers[0];
    assert.equal(manualCustomer.totalOrders, 1);
    assert.equal(manualCustomer.totalSpent, 120);

    const cancelled = await api('PATCH', `/api/orders/${created.data.order.id}`, {
      token: owner.token,
      body: { status: 'Cancelled' },
    });
    assert.equal(cancelled.status, 200);

    const afterCancel = await api('GET', `/api/customers/${manualCustomer.id}`, { token: owner.token });
    assert.equal(afterCancel.data.customer.totalOrders, 0);
    assert.equal(afterCancel.data.customer.totalSpent, 0);
    assert.equal(afterCancel.data.customer.lastOrderAt, null);

    const again = await api('PATCH', `/api/orders/${created.data.order.id}`, {
      token: owner.token,
      body: { status: 'Cancelled' },
    });
    assert.equal(again.status, 409);
    const still = await api('GET', `/api/customers/${manualCustomer.id}`, { token: owner.token });
    assert.equal(still.data.customer.totalOrders, 0);
    assert.equal(still.data.customer.totalSpent, 0);

    const longNotes = await api('PATCH', `/api/customers/${manualCustomer.id}`, {
      token: owner.token,
      body: { notes: 'x'.repeat(501) },
    });
    assert.equal(longNotes.status, 400);

    const emptyName = await api('PATCH', `/api/customers/${manualCustomer.id}`, {
      token: owner.token,
      body: { name: 'A' },
    });
    assert.equal(emptyName.status, 400);
  });

  it('filters customers into new and returning to match analytics', async () => {
    const seller = await registerTenant('types');
    const product = await addProduct(seller.token, { name: 'Type Ring', price: 50, stockQuantity: 10 });
    const order = (name, phone) => api('POST', `/api/store/${seller.slug}/orders`, {
      body: { customer: { name, phone }, items: [{ productId: product.id, quantity: 1 }], deliveryMethod: 'Pickup' },
    });
    for (const [name, phone] of [['Repeat Buyer', '9000044441'], ['Repeat Buyer', '9000044441'], ['First Buyer', '9000044442']]) {
      assert.equal((await order(name, phone)).status, 201);
    }

    const all = await api('GET', '/api/customers', { token: seller.token });
    const fresh = await api('GET', '/api/customers?type=new', { token: seller.token });
    const returning = await api('GET', '/api/customers?type=returning', { token: seller.token });
    assert.equal(all.data.total, 2);
    assert.deepEqual(fresh.data.customers.map((customer) => customer.name), ['First Buyer']);
    assert.deepEqual(returning.data.customers.map((customer) => customer.name), ['Repeat Buyer']);

    const analytics = await api('GET', '/api/analytics', { token: seller.token });
    assert.equal(analytics.data.analytics.customers.new, fresh.data.total);
    assert.equal(analytics.data.analytics.customers.returning, returning.data.total);
    assert.equal(analytics.data.analytics.customers.total, all.data.total);

    const invalid = await api('GET', '/api/customers?type=vip', { token: seller.token });
    assert.equal(invalid.status, 400);
  });
});

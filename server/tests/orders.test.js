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
const password = 'OrderTest1';
const createdBusinessIds = [];

let server;
let base;

function uniqueEmail(label) {
  return `phase3-${label}-${stamp}@example.com`;
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
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { new: true });
  createdBusinessIds.push(user.businessId);
  return {
    email,
    token: signToken(user),
    businessId: user.businessId,
    userId: user._id,
  };
}

async function addProduct(token, input) {
  const response = await api('POST', '/api/products', { token, body: input });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data.product;
}

function orderBody(productId, quantity, extra = {}) {
  return {
    customer: {
      name: extra.customerName || 'Amina Khan',
      phone: extra.phone || '9876543210',
      email: extra.email || 'amina@example.com',
    },
    items: [{ productId, quantity, price: 1 }],
    deliveryMethod: extra.deliveryMethod || 'Pickup',
    deliveryAddress: extra.deliveryAddress,
    deliveryFee: extra.deliveryFee,
    notes: extra.notes,
    total: 1,
    businessId: extra.businessId || 'forged-business',
    paymentStatus: 'Paid',
    status: 'Completed',
  };
}

describe('orders', { timeout: 180000 }, () => {
  let owner;
  let other;

  before(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    owner = await registerTenant('owner');
    other = await registerTenant('other');

    const login = await api('POST', '/api/auth/login', {
      body: { email: owner.email, password },
    });
    assert.equal(login.status, 200);
    const me = await api('GET', '/api/auth/me', { token: owner.token });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, owner.email);
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

  it('keeps a price snapshot and ignores client price and total', async () => {
    const product = await addProduct(owner.token, {
      name: 'Pearl Necklace',
      price: 350,
      stockQuantity: 3,
      status: 'Active',
    });

    const created = await api('POST', '/api/orders', {
      token: owner.token,
      headers: { 'x-business-id': String(other.businessId) },
      body: orderBody(product.id, 1, { customerName: 'Pearl Buyer', phone: '9000011111' }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.match(created.data.order.orderNumber, /^COVE-\d{6}$/);
    assert.equal(created.data.order.items[0].name, 'Pearl Necklace');
    assert.equal(created.data.order.items[0].price, 350);
    assert.equal(created.data.order.items[0].subtotal, 350);
    assert.equal(created.data.order.subtotal, 350);
    assert.equal(created.data.order.total, 350);
    assert.equal(created.data.order.paymentStatus, 'Payment Pending');
    assert.equal(created.data.order.status, 'New');
    assert.equal(created.data.order.businessId, undefined);
    assert.equal(JSON.stringify(created.data).includes('stockRestored'), false);
    assert.equal(JSON.stringify(created.data).includes(String(other.businessId)), false);

    const saved = await Order.findById(created.data.order.id);
    assert.equal(String(saved.businessId), String(owner.businessId));

    const afterCreate = await api('GET', `/api/products/${product.id}`, { token: owner.token });
    assert.equal(afterCreate.data.product.stockQuantity, 2);
    assert.equal(afterCreate.data.product.price, 350);

    const renamed = await api('PATCH', `/api/products/${product.id}`, {
      token: owner.token,
      body: { price: 500, name: 'Pearl Necklace Renamed' },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.data.product.price, 500);

    const historical = await api('GET', `/api/orders/${created.data.order.id}`, { token: owner.token });
    assert.equal(historical.status, 200);
    assert.equal(historical.data.order.items[0].name, 'Pearl Necklace');
    assert.equal(historical.data.order.items[0].price, 350);
    assert.equal(historical.data.order.subtotal, 350);
    assert.equal(historical.data.order.total, 350);

    const catalog = await api('GET', '/api/products', { token: owner.token });
    assert.equal(catalog.status, 200);
    const listed = catalog.data.products.find((item) => item.id === product.id);
    assert.equal(listed.name, 'Pearl Necklace Renamed');
    assert.equal(listed.price, 500);
    assert.equal(listed.stockQuantity, 2);
  });

  it('isolates orders between businesses', async () => {
    const product = await addProduct(owner.token, {
      name: 'Private Bracelet',
      price: 200,
      stockQuantity: 4,
    });
    const created = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(product.id, 1, {
        customerName: 'Secret Customer',
        phone: '9000022222',
        businessId: String(other.businessId),
      }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const orderId = created.data.order.id;
    const orderNumber = created.data.order.orderNumber;

    const ownList = await api('GET', '/api/orders', { token: owner.token });
    assert.equal(ownList.status, 200);
    assert.equal(ownList.data.orders.some((order) => order.id === orderId), true);

    const otherList = await api('GET', `/api/orders?businessId=${owner.businessId}`, {
      token: other.token,
      headers: { 'x-business-id': String(owner.businessId) },
    });
    assert.equal(otherList.status, 200);
    assert.equal(JSON.stringify(otherList.data).includes(orderNumber), false);
    assert.equal(JSON.stringify(otherList.data).includes('Secret Customer'), false);

    const byUrl = await api('GET', `/api/orders/${orderId}?businessId=${owner.businessId}`, {
      token: other.token,
      headers: { 'x-business-id': String(owner.businessId) },
    });
    assert.equal(byUrl.status, 404);
    assert.equal(byUrl.data.order, undefined);
    assert.equal(JSON.stringify(byUrl.data).includes('Secret Customer'), false);
    assert.equal(byUrl.data.stack, undefined);

    const unauthenticated = await Promise.all([
      api('GET', '/api/orders'),
      api('GET', `/api/orders/${orderId}`),
      api('POST', '/api/orders', { body: orderBody(product.id, 1) }),
      api('PATCH', `/api/orders/${orderId}`, { body: { status: 'Confirmed' } }),
    ]);
    unauthenticated.forEach((response) => {
      assert.equal(response.status, 401);
      assert.equal(JSON.stringify(response.data).includes('Secret Customer'), false);
    });

    const stolenProduct = await api('POST', '/api/orders', {
      token: other.token,
      headers: { 'x-business-id': String(owner.businessId) },
      body: orderBody(product.id, 1, { businessId: String(owner.businessId) }),
    });
    assert.equal(stolenProduct.status, 400);
    const stock = await api('GET', `/api/products/${product.id}`, { token: owner.token });
    assert.equal(stock.data.product.stockQuantity, 3);
  });

  it('rejects bad quantities and does not change stock', async () => {
    const product = await addProduct(owner.token, {
      name: 'Stock Guard',
      price: 80,
      stockQuantity: 3,
    });

    const tooMany = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(product.id, 4),
    });
    assert.equal(tooMany.status, 409);

    const zero = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(product.id, 0),
    });
    assert.equal(zero.status, 400);

    const negative = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(product.id, -2),
    });
    assert.equal(negative.status, 400);

    const stock = await api('GET', `/api/products/${product.id}`, { token: owner.token });
    assert.equal(stock.data.product.stockQuantity, 3);
    assert.ok(stock.data.product.stockQuantity >= 0);
  });

  it('does not leave a partial stock change when a later item fails', async () => {
    const first = await addProduct(owner.token, {
      name: 'In Stock Ring',
      price: 120,
      stockQuantity: 5,
    });
    const second = await addProduct(owner.token, {
      name: 'Empty Tray',
      price: 40,
      stockQuantity: 0,
    });
    const before = await Order.countDocuments({ businessId: owner.businessId });
    const response = await api('POST', '/api/orders', {
      token: owner.token,
      body: {
        ...orderBody(first.id, 1, { customerName: 'Partial Buyer' }),
        items: [
          { productId: first.id, quantity: 1, price: 1 },
          { productId: second.id, quantity: 1, price: 1 },
        ],
      },
    });
    assert.equal(response.status, 409);
    const stock = await api('GET', `/api/products/${first.id}`, { token: owner.token });
    assert.equal(stock.data.product.stockQuantity, 5);
    const after = await Order.countDocuments({ businessId: owner.businessId });
    assert.equal(after, before);
  });

  it('lets only one concurrent order take the last unit', async () => {
    const product = await addProduct(owner.token, {
      name: 'Last Pair',
      price: 90,
      stockQuantity: 1,
    });
    const responses = await Promise.all([
      api('POST', '/api/orders', {
        token: owner.token,
        body: orderBody(product.id, 1, { customerName: 'First Racer', phone: '9000033333' }),
      }),
      api('POST', '/api/orders', {
        token: owner.token,
        body: orderBody(product.id, 1, { customerName: 'Second Racer', phone: '9000044444' }),
      }),
    ]);
    const created = responses.filter((response) => response.status === 201);
    const rejected = responses.filter((response) => response.status === 409);
    assert.equal(created.length, 1, JSON.stringify(responses.map((response) => response.status)));
    assert.equal(rejected.length, 1);
    const stock = await api('GET', `/api/products/${product.id}`, { token: owner.token });
    assert.equal(stock.data.product.stockQuantity, 0);

    const [firstCancel, secondCancel] = await Promise.all([
      api('PATCH', `/api/orders/${created[0].data.order.id}`, {
        token: owner.token,
        body: { status: 'Cancelled' },
      }),
      api('PATCH', `/api/orders/${created[0].data.order.id}`, {
        token: owner.token,
        body: { status: 'Cancelled' },
      }),
    ]);
    const statuses = [firstCancel.status, secondCancel.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const restored = await api('GET', `/api/products/${product.id}`, { token: owner.token });
    assert.equal(restored.data.product.stockQuantity, 1);
  });

  it('restores stock once when an order is cancelled', async () => {
    const product = await addProduct(owner.token, {
      name: 'Cancel Beads',
      price: 60,
      stockQuantity: 3,
    });
    const created = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(product.id, 1, { customerName: 'Cancel Customer', phone: '9000055555' }),
    });
    assert.equal(created.status, 201);
    const afterOrder = await api('GET', `/api/products/${product.id}`, { token: owner.token });
    assert.equal(afterOrder.data.product.stockQuantity, 2);

    const cancelled = await api('PATCH', `/api/orders/${created.data.order.id}`, {
      token: owner.token,
      body: { status: 'Cancelled' },
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.data.order.status, 'Cancelled');
    const restored = await api('GET', `/api/products/${product.id}`, { token: owner.token });
    assert.equal(restored.data.product.stockQuantity, 3);

    const again = await api('PATCH', `/api/orders/${created.data.order.id}`, {
      token: owner.token,
      body: { status: 'Cancelled' },
    });
    assert.equal(again.status, 409);
    const still = await api('GET', `/api/products/${product.id}`, { token: owner.token });
    assert.equal(still.data.product.stockQuantity, 3);

    const removed = await api('DELETE', `/api/orders/${created.data.order.id}`, { token: owner.token });
    assert.equal(removed.status, 404);
    const stillThere = await api('GET', `/api/orders/${created.data.order.id}`, { token: owner.token });
    assert.equal(stillThere.status, 200);
  });

  it('blocks archived and draft products and invalid status changes', async () => {
    const archived = await addProduct(owner.token, {
      name: 'Archived Choker',
      price: 70,
      stockQuantity: 2,
    });
    const archivedResponse = await api('DELETE', `/api/products/${archived.id}`, { token: owner.token });
    assert.equal(archivedResponse.status, 200);
    const cannotOrderArchived = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(archived.id, 1),
    });
    assert.equal(cannotOrderArchived.status, 400);
    const archivedStock = await api('GET', `/api/products/${archived.id}`, { token: owner.token });
    assert.equal(archivedStock.data.product.stockQuantity, 2);

    const draft = await addProduct(owner.token, {
      name: 'Draft Bangle',
      price: 55,
      stockQuantity: 2,
      status: 'Draft',
    });
    const cannotOrderDraft = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(draft.id, 1),
    });
    assert.equal(cannotOrderDraft.status, 400);

    const active = await addProduct(owner.token, {
      name: 'Status Chain',
      price: 110,
      stockQuantity: 2,
    });
    const created = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(active.id, 1, { customerName: 'Status Buyer' }),
    });
    const completed = await api('PATCH', `/api/orders/${created.data.order.id}`, {
      token: owner.token,
      body: { status: 'Completed', paymentStatus: 'Paid' },
    });
    assert.equal(completed.status, 200);
    assert.equal(completed.data.order.status, 'Completed');
    assert.equal(completed.data.order.paymentStatus, 'Paid');

    const backwards = await api('PATCH', `/api/orders/${created.data.order.id}`, {
      token: owner.token,
      body: { status: 'Preparing' },
    });
    assert.equal(backwards.status, 400);
    const cancelCompleted = await api('PATCH', `/api/orders/${created.data.order.id}`, {
      token: owner.token,
      body: { status: 'Cancelled' },
    });
    assert.equal(cancelCompleted.status, 400);
    const stock = await api('GET', `/api/products/${active.id}`, { token: owner.token });
    assert.equal(stock.data.product.stockQuantity, 1);
  });

  it('calculates delivery totals on the server and paginates newest first', async () => {
    const product = await addProduct(owner.token, {
      name: 'Delivery Beads',
      price: 350,
      stockQuantity: 6,
    });
    const feeSettings = await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { deliveryFee: 40 },
    });
    assert.equal(feeSettings.status, 200, JSON.stringify(feeSettings.data));
    assert.equal(feeSettings.data.business.deliveryFee, 40);

    const phone = `91${String(Date.now()).slice(-8)}`;
    const first = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(product.id, 1, {
        customerName: 'Older Buyer',
        phone: '9111111111',
        deliveryMethod: 'Delivery',
        deliveryAddress: '12 Cove Lane, Kochi',
        deliveryFee: 999,
        notes: 'Leave at the gate',
      }),
    });
    assert.equal(first.status, 201, JSON.stringify(first.data));
    assert.equal(first.data.order.subtotal, 350);
    assert.equal(first.data.order.deliveryFee, 40);
    assert.equal(first.data.order.total, 390);
    assert.equal(first.data.order.deliveryAddress, '12 Cove Lane, Kochi');

    const pickupFee = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(product.id, 1, { deliveryFee: 40 }),
    });
    assert.equal(pickupFee.status, 201, JSON.stringify(pickupFee.data));
    assert.equal(pickupFee.data.order.deliveryFee, 0);
    assert.equal(pickupFee.data.order.total, 350);

    const missingAddress = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(product.id, 1, { deliveryMethod: 'Delivery', deliveryFee: 10 }),
    });
    assert.equal(missingAddress.status, 400);

    const second = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(product.id, 1, { customerName: 'Middle Buyer', phone: '9222222222' }),
    });
    const third = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(product.id, 1, { customerName: 'Newest Buyer', phone }),
    });
    assert.equal(second.status, 201);
    assert.equal(third.status, 201);
    assert.notEqual(first.data.order.orderNumber, third.data.order.orderNumber);

    const page = await api('GET', `/api/orders?limit=2&search=${phone}`, { token: owner.token });
    assert.equal(page.status, 200);
    assert.equal(page.data.orders.length, 1);
    assert.equal(page.data.orders[0].customer.phone, phone);
    assert.equal(page.data.total >= 1, true);
    assert.ok(page.data.summary.total >= 1);

    const newest = await api('GET', '/api/orders?limit=2&page=1', { token: owner.token });
    assert.equal(newest.data.orders.length, 2);
    assert.equal(newest.data.orders[0].id, third.data.order.id);
    assert.ok(newest.data.totalPages >= 2);
    assert.equal(newest.data.limit, 2);

    const paid = await api('PATCH', `/api/orders/${third.data.order.id}`, {
      token: owner.token,
      body: { paymentStatus: 'Paid' },
    });
    assert.equal(paid.status, 200);
    const paidList = await api('GET', '/api/orders?paymentStatus=Paid', { token: owner.token });
    assert.equal(paidList.data.orders.some((order) => order.id === third.data.order.id), true);
    const pendingList = await api('GET', '/api/orders?paymentStatus=Payment Pending', { token: owner.token });
    assert.equal(pendingList.data.orders.some((order) => order.id === third.data.order.id), false);
    const statusList = await api('GET', '/api/orders?status=New', { token: owner.token });
    assert.equal(statusList.data.orders.every((order) => order.status === 'New'), true);

    const badStatus = await api('PATCH', `/api/orders/${third.data.order.id}`, {
      token: owner.token,
      body: { status: 'Shipped' },
    });
    assert.equal(badStatus.status, 400);
    const badId = await api('GET', '/api/orders/not-an-id', { token: owner.token });
    assert.equal(badId.status, 400);
  });

  it('applies saved business delivery fee and ignores invalid client values', async () => {
    const product = await addProduct(owner.token, {
      name: 'Fee Guard Rings',
      price: 200,
      stockQuantity: 5,
    });

    const setForty = await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { deliveryFee: 40 },
    });
    assert.equal(setForty.status, 200);
    assert.equal(setForty.data.business.deliveryFee, 40);

    const withForgedFee = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(product.id, 1, {
        customerName: 'Fee Forger',
        phone: '9333333333',
        deliveryMethod: 'Delivery',
        deliveryAddress: '44 Fee Street, Kochi',
        deliveryFee: 999,
      }),
    });
    assert.equal(withForgedFee.status, 201, JSON.stringify(withForgedFee.data));
    assert.equal(withForgedFee.data.order.deliveryFee, 40);
    assert.equal(withForgedFee.data.order.total, 240);

    const withInvalidFee = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(product.id, 1, {
        customerName: 'Bad Fee Buyer',
        phone: '9444444444',
        deliveryMethod: 'Delivery',
        deliveryAddress: '55 Fee Street, Kochi',
        deliveryFee: -25,
      }),
    });
    assert.equal(withInvalidFee.status, 201, JSON.stringify(withInvalidFee.data));
    assert.equal(withInvalidFee.data.order.deliveryFee, 40);
    assert.equal(withInvalidFee.data.order.total, 240);

    const withNaNFee = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(product.id, 1, {
        customerName: 'NaN Fee Buyer',
        phone: '9555555555',
        deliveryMethod: 'Delivery',
        deliveryAddress: '66 Fee Street, Kochi',
        deliveryFee: 'not-a-number',
      }),
    });
    assert.equal(withNaNFee.status, 201, JSON.stringify(withNaNFee.data));
    assert.equal(withNaNFee.data.order.deliveryFee, 40);
    assert.equal(withNaNFee.data.order.total, 240);

    const setTwentyFive = await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { deliveryFee: 25 },
    });
    assert.equal(setTwentyFive.status, 200);
    assert.equal(setTwentyFive.data.business.deliveryFee, 25);

    const afterChange = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(product.id, 1, {
        customerName: 'Updated Fee Buyer',
        phone: '9666666666',
        deliveryMethod: 'Delivery',
        deliveryAddress: '77 Fee Street, Kochi',
        deliveryFee: 1,
      }),
    });
    assert.equal(afterChange.status, 201, JSON.stringify(afterChange.data));
    assert.equal(afterChange.data.order.deliveryFee, 25);
    assert.equal(afterChange.data.order.total, 225);

    const pickupAfterChange = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(product.id, 1, {
        customerName: 'Pickup Fee Buyer',
        phone: '9777777777',
        deliveryMethod: 'Pickup',
        deliveryFee: 25,
      }),
    });
    assert.equal(pickupAfterChange.status, 201, JSON.stringify(pickupAfterChange.data));
    assert.equal(pickupAfterChange.data.order.deliveryFee, 0);
    assert.equal(pickupAfterChange.data.order.total, 200);
  });
});

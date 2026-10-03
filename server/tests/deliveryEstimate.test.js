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
const emailService = require('../services/emailService');
const { deliveryEstimateFor } = require('../utils/deliveryEstimate');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'EtaTest1';
const createdBusinessIds = [];
const NOTE = 'Orders placed before 2 PM are usually delivered the same day.';

let server;
let base;

async function api(method, path, { token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { cookie: `cove_token=${token}` } : {}),
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
  const email = `eta-${label}-${stamp}@example.com`;
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password,
      businessName: `${label} ETA Shop ${stamp.slice(-6)}`,
      category: 'Handmade Gifts',
      phone: '9876543210',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { new: true });
  const business = await Business.findById(user.businessId);
  createdBusinessIds.push(user.businessId);
  return { token: signToken(user), businessId: user.businessId, slug: business.slug };
}

function settings(owner, body) {
  return api('PATCH', '/api/business/settings', { token: owner.token, body });
}

function checkout(slug, productId, extra) {
  return api('POST', `/api/store/${slug}/orders`, {
    body: {
      customer: { name: 'Eta Guest', phone: '9811113333' },
      items: [{ productId, quantity: 1 }],
      ...extra,
    },
  });
}

const delivery = { deliveryMethod: 'Delivery', deliveryAddress: '7 Garden Road' };

describe('estimated delivery', { timeout: 180000 }, () => {
  let owner;
  let other;
  let product;

  before(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    owner = await registerTenant('owner');
    other = await registerTenant('other');
    const created = await api('POST', '/api/products', {
      token: owner.token,
      body: { name: 'Gift Box', price: 500, stockQuantity: 50 },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    product = created.data.product;
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

  it('builds the shopper-facing text only when enabled and delivery is on', () => {
    assert.equal(deliveryEstimateFor({ deliveryEstimateEnabled: false, deliveryEstimate: 'same_day' }), null);
    assert.deepEqual(
      deliveryEstimateFor({ deliveryEstimateEnabled: true, deliveryEstimate: 'same_day', deliveryEstimateNote: NOTE }),
      { text: 'Same day', note: NOTE }
    );
    assert.deepEqual(
      deliveryEstimateFor({ deliveryEstimateEnabled: true, deliveryEstimate: '3_5_days' }),
      { text: '3–5 days', note: '' }
    );
    assert.deepEqual(
      deliveryEstimateFor({ deliveryEstimateEnabled: true, deliveryEstimate: 'custom', deliveryEstimateNote: 'Within 48 hours' }),
      { text: 'Within 48 hours', note: '' }
    );
    assert.equal(deliveryEstimateFor({ deliveryEstimateEnabled: true, deliveryEstimate: 'custom', deliveryEstimateNote: '' }), null);
    assert.equal(
      deliveryEstimateFor({ deliveryEstimateEnabled: true, deliveryEstimate: 'same_day', deliveryEnabled: false }),
      null
    );
  });

  it('is off by default and validates seller input', async () => {
    const current = await api('GET', '/api/business/settings', { token: owner.token });
    assert.equal(current.data.business.deliveryEstimateEnabled, false);
    assert.equal(current.data.business.deliveryEstimate, '2_3_days');
    const store = await api('GET', `/api/store/${owner.slug}`);
    assert.equal(store.data.business.deliveryEstimate, null);

    for (const body of [
      { deliveryEstimate: 'next_week' },
      { deliveryEstimate: { $ne: '' } },
      { deliveryEstimateNote: 'x'.repeat(161) },
      { deliveryEstimateNote: ['note'] },
      { deliveryEstimateEnabled: 'maybe' },
      { deliveryEstimateEnabled: true, deliveryEstimate: 'custom', deliveryEstimateNote: '   ' },
    ]) {
      const rejected = await settings(owner, body);
      assert.equal(rejected.status, 400, `accepted ${JSON.stringify(body)}`);
    }
    const unchanged = await api('GET', '/api/business/settings', { token: owner.token });
    assert.equal(unchanged.data.business.deliveryEstimateEnabled, false);
  });

  it('shows the estimate to shoppers and saves it on delivery orders only', async () => {
    const saved = await settings(owner, {
      deliveryEstimateEnabled: true,
      deliveryEstimate: '1_2_days',
      deliveryEstimateNote: `  ${NOTE}  `,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.business.deliveryEstimateNote, NOTE);

    const store = await api('GET', `/api/store/${owner.slug}`);
    assert.deepEqual(store.data.business.deliveryEstimate, { text: '1–2 days', note: NOTE });
    const otherStore = await api('GET', `/api/store/${other.slug}`);
    assert.equal(otherStore.data.business.deliveryEstimate, null);

    const placed = await checkout(owner.slug, product.id, {
      ...delivery,
      deliveryEstimate: { text: 'In 5 minutes', note: 'Guaranteed!' },
    });
    assert.equal(placed.status, 201, JSON.stringify(placed.data));
    assert.deepEqual(placed.data.order.deliveryEstimate, { text: '1–2 days', note: NOTE });

    const pickup = await checkout(owner.slug, product.id, { deliveryMethod: 'Pickup' });
    assert.equal(pickup.status, 201, JSON.stringify(pickup.data));
    assert.equal(pickup.data.order.deliveryEstimate, null);

    const list = await api('GET', `/api/orders?search=${placed.data.order.orderNumber}`, { token: owner.token });
    const row = list.data.orders.find((item) => item.orderNumber === placed.data.order.orderNumber);
    assert.deepEqual(row.deliveryEstimate, { text: '1–2 days', note: NOTE });

    const crossTenant = await api('GET', `/api/orders/${row.id}`, { token: other.token });
    assert.equal(crossTenant.status, 404);
  });

  it('keeps the estimate an order was placed with after the seller changes settings', async () => {
    await settings(owner, { deliveryEstimateEnabled: true, deliveryEstimate: 'same_day', deliveryEstimateNote: '' });
    const first = await checkout(owner.slug, product.id, delivery);
    assert.deepEqual(first.data.order.deliveryEstimate, { text: 'Same day', note: '' });

    await settings(owner, { deliveryEstimate: 'custom', deliveryEstimateNote: 'Delivered within 48 hours in the city' });
    const second = await checkout(owner.slug, product.id, delivery);
    assert.deepEqual(second.data.order.deliveryEstimate, { text: 'Delivered within 48 hours in the city', note: '' });

    await settings(owner, { deliveryEstimateEnabled: false });
    const third = await checkout(owner.slug, product.id, delivery);
    assert.equal(third.data.order.deliveryEstimate, null);
    assert.equal((await api('GET', `/api/store/${owner.slug}`)).data.business.deliveryEstimate, null);

    const firstAgain = await api('GET', `/api/store/${owner.slug}/orders/confirm/${first.data.confirmationToken}`);
    assert.equal(firstAgain.status, 200);
    assert.deepEqual(firstAgain.data.order.deliveryEstimate, { text: 'Same day', note: '' });
    const secondAgain = await api('GET', `/api/store/${owner.slug}/orders/confirm/${second.data.confirmationToken}`);
    assert.deepEqual(secondAgain.data.order.deliveryEstimate, { text: 'Delivered within 48 hours in the city', note: '' });
  });

  it('hides the estimate when delivery is off and works alongside cash on delivery', async () => {
    await settings(owner, {
      deliveryEstimateEnabled: true,
      deliveryEstimate: '3_5_days',
      deliveryEstimateNote: '',
      deliveryEnabled: false,
    });
    assert.equal((await api('GET', `/api/store/${owner.slug}`)).data.business.deliveryEstimate, null);

    await settings(owner, { deliveryEnabled: true, cashOnDeliveryEnabled: true });
    const cod = await checkout(owner.slug, product.id, { ...delivery, paymentMethod: 'cash_on_delivery' });
    assert.equal(cod.status, 201, JSON.stringify(cod.data));
    assert.equal(cod.data.order.paymentMethod, 'cash_on_delivery');
    assert.equal(cod.data.order.paymentStatus, 'Payment Pending');
    assert.equal(cod.data.order.status, 'New');
    assert.deepEqual(cod.data.order.deliveryEstimate, { text: '3–5 days', note: '' });
  });

  it('includes the estimate in customer order emails while the order is open', async () => {
    const previous = process.env.EMAIL_PROVIDER;
    process.env.EMAIL_PROVIDER = 'memory';
    try {
      emailService.clearMemoryOutbox();
      const order = {
        id: 'o1',
        orderNumber: 'COV-2001',
        customer: { name: 'Eta Guest' },
        items: [{ quantity: 1, name: 'Gift Box', subtotal: 500 }],
        total: 500,
        deliveryFee: 0,
        status: 'New',
        paymentStatus: 'Payment Pending',
        paymentMethod: '',
        deliveryMethod: 'Delivery',
        deliveryEstimate: { text: '1–2 days', note: NOTE },
      };
      await emailService.sendCustomerOrderConfirmation({ to: 'buyer@example.com', businessName: 'Eta Shop', order, currency: 'INR' });
      await emailService.sendCustomerOrderStatus({ to: 'buyer@example.com', businessName: 'Eta Shop', order: { ...order, status: 'Confirmed' } });
      await emailService.sendCustomerOrderStatus({ to: 'buyer@example.com', businessName: 'Eta Shop', order: { ...order, status: 'Completed' } });
      await emailService.sendCustomerOrderStatus({ to: 'buyer@example.com', businessName: 'Eta Shop', order: { ...order, status: 'Cancelled' } });
      await emailService.sendCustomerOrderConfirmation({
        to: 'buyer@example.com',
        businessName: 'Eta Shop',
        order: { ...order, deliveryMethod: 'Pickup' },
        currency: 'INR',
      });

      const [confirmation, confirmed, completed, cancelled, pickup] = emailService.getMemoryOutbox();
      for (const email of [confirmation, confirmed]) {
        assert.match(email.text, /Estimated delivery: 1–2 days/);
        assert.ok(email.text.includes(NOTE));
        assert.match(email.text, /estimate from the shop, not a guarantee/);
        assert.match(email.html, /Estimated delivery: <strong>1–2 days<\/strong>/);
      }
      for (const email of [completed, cancelled, pickup]) {
        assert.doesNotMatch(email.text, /Estimated delivery/);
      }

      emailService.clearMemoryOutbox();
      await emailService.sendCustomerOrderConfirmation({
        to: 'buyer@example.com',
        businessName: 'Eta Shop',
        order: { ...order, deliveryEstimate: { text: '<b>Soon</b>', note: '' } },
        currency: 'INR',
      });
      const [escaped] = emailService.getMemoryOutbox();
      assert.doesNotMatch(escaped.html, /<b>Soon<\/b>/);
      assert.match(escaped.html, /&lt;b&gt;Soon&lt;\/b&gt;/);
    } finally {
      process.env.EMAIL_PROVIDER = previous;
      emailService.clearMemoryOutbox();
    }
  });
});

process.env.EMAIL_PROVIDER = 'memory';
process.env.COVE_GRANT_TRIAL_ON_REGISTER = 'true';
process.env.COVE_ENFORCE_BILLING = 'false';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { connectTestDB } = require('./_testDb');
const app = require('../app');
const User = require('../models/User');
const Business = require('../models/Business');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const CustomerWant = require('../models/CustomerWant');
const OrderCounter = require('../models/OrderCounter');
const Notification = require('../models/Notification');
const Subscription = require('../models/Subscription');
const { signToken } = require('../services/tokenService');
const emailService = require('../services/emailService');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'NotifyTest1';
const createdBusinessIds = [];

let server;
let base;

function uniqueEmail(label) {
  return `notify-${label}-${stamp}@example.com`;
}

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
  const email = uniqueEmail(label);
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password,
      businessName: `${label} Notify Shop ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
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
    userId: user._id,
    slug: business.slug,
  };
}

async function addProduct(token, input) {
  const response = await api('POST', '/api/products', { token, body: input });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data.product;
}

async function waitFor(predicate, { tries = 40, delayMs = 50 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

describe('notifications', { timeout: 180000 }, () => {
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

  beforeEach(() => {
    emailService.clearMemoryOutbox();
  });

  after(async () => {
    if (createdBusinessIds.length) {
      await Notification.deleteMany({ businessId: { $in: createdBusinessIds } });
      await CustomerWant.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Order.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Product.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Customer.deleteMany({ businessId: { $in: createdBusinessIds } });
      await OrderCounter.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Subscription.deleteMany({ businessId: { $in: createdBusinessIds } });
      await User.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('creates seller notifications for orders, payments, and wants with tenant isolation', async () => {
    const product = await addProduct(owner.token, {
      name: 'Notify Beads',
      price: 120,
      stockQuantity: 5,
    });

    const created = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Notify Guest', phone: '9812345678', email: 'guest-notify@example.com' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
        paymentMethod: 'pay_on_pickup',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));

    const sawOrder = await waitFor(async () => {
      const count = await Notification.countDocuments({
        businessId: owner.businessId,
        type: 'NEW_ORDER',
      });
      return count >= 1;
    });
    assert.equal(sawOrder, true);

    const token = created.data.confirmationToken;
    const submitted = await api('POST', `/api/store/${owner.slug}/orders/confirm/${token}/payment`, {
      body: { paymentReference: 'UTR-NOTIFY-1' },
    });
    assert.equal(submitted.status, 200);

    const sawPayment = await waitFor(async () => {
      const count = await Notification.countDocuments({
        businessId: owner.businessId,
        type: 'PAYMENT_SUBMITTED',
      });
      return count >= 1;
    });
    assert.equal(sawPayment, true);

    const want = await api('POST', `/api/store/${owner.slug}/wants`, {
      body: {
        name: 'Want Guest',
        phone: '9898989898',
        request: 'Looking for gold hoops',
      },
    });
    assert.equal(want.status, 201);

    const sawWant = await waitFor(async () => {
      const count = await Notification.countDocuments({
        businessId: owner.businessId,
        type: 'CUSTOMER_WANT',
      });
      return count >= 1;
    });
    assert.equal(sawWant, true);

    const list = await api('GET', '/api/notifications', { token: owner.token });
    assert.equal(list.status, 200);
    assert.ok(list.data.notifications.length >= 3);

    const unread = await api('GET', '/api/notifications/unread-count', { token: owner.token });
    assert.equal(unread.status, 200);
    assert.ok(unread.data.count >= 3);

    const first = list.data.notifications[0];
    const marked = await api('PATCH', `/api/notifications/${first.id}/read`, { token: owner.token });
    assert.equal(marked.status, 200);
    assert.equal(marked.data.notification.isRead, true);

    const cross = await api('GET', '/api/notifications', { token: other.token });
    assert.equal(cross.status, 200);
    assert.equal(
      cross.data.notifications.some((item) => item.id === first.id),
      false
    );

    const crossRead = await api('PATCH', `/api/notifications/${first.id}/read`, { token: other.token });
    assert.equal(crossRead.status, 404);

    const unauth = await api('GET', '/api/notifications');
    assert.equal(unauth.status, 401);

    const markAll = await api('PATCH', '/api/notifications/read-all', { token: owner.token });
    assert.equal(markAll.status, 200);
    const unreadAfter = await api('GET', '/api/notifications/unread-count', { token: owner.token });
    assert.equal(unreadAfter.data.count, 0);

    const orderRow = await Order.findOne({
      businessId: owner.businessId,
      orderNumber: created.data.order.orderNumber,
    });
    const paid = await api('PATCH', `/api/orders/${orderRow._id}`, {
      token: owner.token,
      body: { paymentStatus: 'Paid' },
    });
    assert.equal(paid.status, 200);

    const sawCustomerMail = await waitFor(() => (
      emailService.getMemoryOutbox().some((item) => (
        item.to === 'guest-notify@example.com' && /payment confirmed/i.test(item.subject)
      ))
    ));
    assert.equal(sawCustomerMail, true);
  });

  it('does not crash when email provider is unconfigured', async () => {
    const previous = process.env.EMAIL_PROVIDER;
    process.env.EMAIL_PROVIDER = '';
    const result = await emailService.sendEmail({
      to: 'dev@example.com',
      subject: 'Test',
      text: 'Hello',
      html: '<p>Hello</p>',
    });
    assert.equal(result.ok, true);
    process.env.EMAIL_PROVIDER = previous || 'memory';
  });
});

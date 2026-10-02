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
const OrderCounter = require('../models/OrderCounter');
const Notification = require('../models/Notification');
const Subscription = require('../models/Subscription');
const EmailDelivery = require('../models/EmailDelivery');
const { signToken } = require('../services/tokenService');
const emailService = require('../services/emailService');
const notifyEvents = require('../services/notifyEvents');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'BuyerMail1';
const createdBusinessIds = [];

let server;
let base;

function uniqueEmail(label) {
  return `buyer-mail-${label}-${stamp}@example.com`;
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
      businessName: `${label} Buyer Mail Shop ${stamp.slice(-6)}`,
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
    name: business.name,
  };
}

async function waitFor(predicate, { tries = 40, delayMs = 50 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

function settle(ms = 300) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mailsTo(email, subjectPattern) {
  return emailService.getMemoryOutbox().filter((item) => (
    item.to === email && (!subjectPattern || subjectPattern.test(item.subject))
  ));
}

describe('buyer transactional emails', { timeout: 180000 }, () => {
  let shop;
  let product;

  async function placeOrder(email) {
    const created = await api('POST', `/api/store/${shop.slug}/orders`, {
      body: {
        customer: { name: 'Mail Guest', phone: '9812345678', ...(email ? { email } : {}) },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
        paymentMethod: 'pay_on_pickup',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const row = await Order.findOne({ businessId: shop.businessId, orderNumber: created.data.order.orderNumber });
    return { ...created.data, id: row._id.toString() };
  }

  function patchOrder(id, body) {
    return api('PATCH', `/api/orders/${id}`, { token: shop.token, body });
  }

  before(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    shop = await registerTenant('shop');
    const added = await api('POST', '/api/products', {
      token: shop.token,
      body: { name: 'Mail Bangle', price: 250, stockQuantity: 100 },
    });
    assert.equal(added.status, 201, JSON.stringify(added.data));
    product = added.data.product;
  });

  beforeEach(() => {
    emailService.clearMemoryOutbox();
  });

  after(async () => {
    if (createdBusinessIds.length) {
      await EmailDelivery.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Notification.deleteMany({ businessId: { $in: createdBusinessIds } });
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

  it('sends the buyer an order-received email with a tracking link and still emails the seller', async () => {
    const buyer = uniqueEmail('received');
    const order = await placeOrder(buyer);

    const received = await waitFor(() => mailsTo(buyer, /order received/i)[0]);
    assert.ok(received, 'buyer order-received email should be sent');
    assert.match(received.subject, new RegExp(order.order.orderNumber));
    assert.match(received.text, new RegExp(shop.name));
    assert.match(received.text, /Payment status: Pending/);
    assert.ok(received.text.includes(`/store/${shop.slug}/order/${order.order.orderNumber}?c=${order.confirmationToken}`));

    const sellerView = await api('GET', `/api/orders/${order.id}`, { token: shop.token });
    assert.equal(sellerView.status, 200);
    const serialized = JSON.stringify(sellerView.data);
    assert.equal(serialized.includes('confirmationTokenSealed'), false);
    assert.equal(serialized.includes(order.confirmationToken), false);

    const seller = await waitFor(() => mailsTo(shop.email, /new order received/i)[0]);
    assert.ok(seller, 'seller new-order email should still be sent');
    assert.equal(seller.text.includes(buyer), false);
  });

  it('skips buyer emails without failing when the buyer gave no email', async () => {
    const order = await placeOrder('');
    assert.ok(await waitFor(() => mailsTo(shop.email, /new order received/i)[0]));

    const confirmed = await patchOrder(order.id, { status: 'Confirmed' });
    assert.equal(confirmed.status, 200);
    const paid = await patchOrder(order.id, { paymentStatus: 'Paid' });
    assert.equal(paid.status, 200);
    await settle();

    const buyerMails = emailService.getMemoryOutbox().filter((item) => item.to !== shop.email);
    assert.equal(buyerMails.length, 0);
  });

  it('sends payment confirmed only when payment actually moves to Paid', async () => {
    const buyer = uniqueEmail('paid');
    const order = await placeOrder(buyer);
    await waitFor(() => mailsTo(buyer, /order received/i)[0]);

    assert.equal((await patchOrder(order.id, { paymentStatus: 'Paid' })).status, 200);
    const paidMail = await waitFor(() => mailsTo(buyer, /payment confirmed/i)[0]);
    assert.ok(paidMail);
    assert.match(paidMail.text, /Payment status: Paid/);
    assert.match(paidMail.text, /250/);
    assert.ok(paidMail.text.includes(`?c=${order.confirmationToken}`), 'later emails repeat the tracking link');

    assert.equal((await patchOrder(order.id, { status: 'Confirmed' })).status, 200);
    assert.equal((await patchOrder(order.id, { paymentStatus: 'Paid' })).status, 200);
    await settle();
    assert.equal(mailsTo(buyer, /payment confirmed/i).length, 1);
  });

  it('sends payment rejected only on a real transition to Rejected, with the seller note', async () => {
    const buyer = uniqueEmail('rejected');
    const order = await placeOrder(buyer);
    await waitFor(() => mailsTo(buyer, /order received/i)[0]);

    const rejected = await patchOrder(order.id, {
      paymentStatus: 'Payment Rejected',
      paymentRejectionNote: 'Amount did not reach our account',
    });
    assert.equal(rejected.status, 200);
    const mail = await waitFor(() => mailsTo(buyer, /payment not confirmed/i)[0]);
    assert.ok(mail, 'buyer payment-rejected email should be sent');
    assert.match(mail.text, /could not confirm your payment/);
    assert.match(mail.text, /Amount did not reach our account/);
    assert.match(mail.text, /Payment status: Rejected/);
    assert.match(mail.text, /contact/i);

    assert.equal((await patchOrder(order.id, { paymentStatus: 'Payment Rejected' })).status, 200);
    await settle();
    assert.equal(mailsTo(buyer, /payment not confirmed/i).length, 1);

    assert.equal((await patchOrder(order.id, { paymentStatus: 'Payment Pending' })).status, 200);
    assert.equal((await patchOrder(order.id, { paymentStatus: 'Payment Rejected' })).status, 200);
    assert.ok(await waitFor(() => mailsTo(buyer, /payment not confirmed/i).length === 2));
    assert.equal(mailsTo(buyer, /payment confirmed/i).length, 0);
  });

  it('emails each forward status once: Confirmed, Preparing, Ready, Completed', async () => {
    const buyer = uniqueEmail('lifecycle');
    const order = await placeOrder(buyer);
    await waitFor(() => mailsTo(buyer, /order received/i)[0]);

    const steps = [
      ['Confirmed', /order confirmed/i, /has confirmed your order/],
      ['Preparing', /order being prepared/i, /started preparing your order/],
      ['Ready', /order ready/i, /marked your order as ready/],
      ['Completed', /order completed/i, /marked your order as completed/],
    ];
    for (const [status, subject, body] of steps) {
      const res = await patchOrder(order.id, { status });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const mail = await waitFor(() => mailsTo(buyer, subject)[0]);
      assert.ok(mail, `${status} email should be sent`);
      assert.match(mail.subject, new RegExp(order.order.orderNumber));
      assert.match(mail.text, body);
      assert.match(mail.text, new RegExp(shop.name));
    }

    assert.equal((await patchOrder(order.id, { status: 'Completed' })).status, 200);
    await settle();
    for (const [, subject] of steps) {
      assert.equal(mailsTo(buyer, subject).length, 1);
    }
  });

  it('emails the buyer when an order is cancelled', async () => {
    const buyer = uniqueEmail('cancelled');
    const order = await placeOrder(buyer);
    await waitFor(() => mailsTo(buyer, /order received/i)[0]);

    assert.equal((await patchOrder(order.id, { status: 'Cancelled' })).status, 200);
    const mail = await waitFor(() => mailsTo(buyer, /order cancelled/i)[0]);
    assert.ok(mail, 'cancelled email should be sent');
    assert.match(mail.text, /has cancelled your order/);
    assert.match(mail.text, /If you already paid, contact/);
  });

  it('does not duplicate emails when the same event is processed again', async () => {
    const buyer = uniqueEmail('replay');
    const order = await placeOrder(buyer);
    await waitFor(() => mailsTo(buyer, /order received/i)[0]);
    await patchOrder(order.id, { status: 'Confirmed' });
    await patchOrder(order.id, { paymentStatus: 'Paid' });
    await waitFor(() => mailsTo(buyer, /payment confirmed/i)[0]);
    await waitFor(() => mailsTo(buyer, /order confirmed/i)[0]);

    const row = await Order.findById(order.id);
    await notifyEvents.notifyOrderStatusChanged({ businessId: shop.businessId, order: row, previousStatus: 'New' });
    await notifyEvents.notifyPaymentChanged({ businessId: shop.businessId, order: row, previousPayment: 'Payment Pending' });
    await notifyEvents.notifyCustomerOrderConfirmation({ businessId: shop.businessId, order: row });

    assert.equal(mailsTo(buyer, /order confirmed/i).length, 1);
    assert.equal(mailsTo(buyer, /payment confirmed/i).length, 1);
    assert.equal(mailsTo(buyer, /order received/i).length, 1);
  });

  it('keeps the status update when the email fails and allows a later retry', async () => {
    const buyer = uniqueEmail('failure');
    const order = await placeOrder(buyer);
    await waitFor(() => mailsTo(buyer, /order received/i)[0]);

    const previousProvider = process.env.EMAIL_PROVIDER;
    const originalError = console.error;
    console.error = () => {};
    process.env.EMAIL_PROVIDER = 'broken-provider';
    try {
      const res = await patchOrder(order.id, { status: 'Confirmed' });
      assert.equal(res.status, 200);
      assert.equal(res.data.order.status, 'Confirmed');
      await settle();
    } finally {
      process.env.EMAIL_PROVIDER = previousProvider;
      console.error = originalError;
    }

    assert.equal((await Order.findById(order.id)).status, 'Confirmed');
    assert.equal(mailsTo(buyer, /order confirmed/i).length, 0);
    const claim = await EmailDelivery.findOne({ businessId: shop.businessId, dedupeKey: `BUYER_STATUS:${order.id}:Confirmed` });
    assert.equal(claim, null, 'failed send releases its dedupe key');

    const row = await Order.findById(order.id);
    await notifyEvents.notifyOrderStatusChanged({ businessId: shop.businessId, order: row, previousStatus: 'New' });
    assert.equal(mailsTo(buyer, /order confirmed/i).length, 1);
  });

  it('still sends password reset emails', async () => {
    const res = await api('POST', '/api/auth/forgot-password', { body: { email: shop.email } });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const mail = await waitFor(() => mailsTo(shop.email, /reset your cove password/i)[0]);
    assert.ok(mail, 'password reset email should be sent');
    assert.match(mail.text, /reset-password\?token=/);
  });
});

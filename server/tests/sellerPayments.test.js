const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const app = require('../app');
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const OrderCounter = require('../models/OrderCounter');
const Business = require('../models/Business');
const { signToken } = require('../services/tokenService');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'PayTest1';
const createdBusinessIds = [];

let server;
let base;

function uniqueEmail(label) {
  return `pay-${label}-${stamp}@example.com`;
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
      businessName: `${label} Pay Shop ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOne({ email });
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

describe('sellerPayments', { timeout: 180000 }, () => {
  let owner;
  let other;

  before(async () => {
    await connectDB();
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

  it('lets sellers configure payment methods and only exposes enabled public details', async () => {
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const saved = await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: {
        paymentQrEnabled: true,
        paymentQrImage: tinyPng,
        paymentLinkEnabled: true,
        paymentLink: 'https://pay.example.com/cove-test',
        paymentInstructionsEnabled: true,
        paymentInstructions: 'UPI: shop@upi',
        payOnPickupEnabled: true,
      },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.business.paymentQrEnabled, true);
    assert.equal(saved.data.business.paymentLink, 'https://pay.example.com/cove-test');
    assert.match(saved.data.business.paymentQrImage, /^\/uploads\/payment-qr\//);

    const badLink = await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { paymentLink: 'not-a-url' },
    });
    assert.equal(badLink.status, 400);

    const store = await api('GET', `/api/store/${owner.slug}`);
    assert.equal(store.status, 200);
    assert.equal(store.data.business.payments.qrEnabled, true);
    assert.equal(store.data.business.payments.linkEnabled, true);
    assert.equal(store.data.business.payments.instructionsEnabled, true);
    assert.equal(store.data.business.payments.payOnPickupEnabled, true);
    assert.equal(store.data.business.payments.paymentLink, 'https://pay.example.com/cove-test');
    assert.equal(store.data.business.payments.paymentInstructions, 'UPI: shop@upi');
    assert.match(store.data.business.payments.paymentQrImage, /^\/uploads\/payment-qr\//);
    assert.equal(store.data.business.paymentLink, undefined);
    assert.equal(store.data.business.ownerId, undefined);
    assert.equal(store.data.business.id, undefined);

    await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: {
        paymentQrEnabled: false,
        paymentLinkEnabled: false,
        paymentInstructionsEnabled: false,
      },
    });
    const hidden = await api('GET', `/api/store/${owner.slug}`);
    assert.equal(hidden.data.business.payments.qrEnabled, false);
    assert.equal(hidden.data.business.payments.linkEnabled, false);
    assert.equal(hidden.data.business.payments.instructionsEnabled, false);
    assert.equal(hidden.data.business.payments.paymentLink, '');
    assert.equal(hidden.data.business.payments.paymentQrImage, '');
    assert.equal(hidden.data.business.payments.paymentInstructions, '');
  });

  it('supports checkout payment methods, references, and seller verification with tenant isolation', async () => {
    const product = await addProduct(owner.token, {
      name: 'Pay Guard Ring',
      price: 250,
      stockQuantity: 8,
    });

    await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: {
        paymentLinkEnabled: true,
        paymentLink: 'https://pay.example.com/cove-test',
        paymentInstructionsEnabled: false,
        paymentQrEnabled: false,
        payOnPickupEnabled: true,
      },
    });

    const created = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Pay Guest', phone: '9811111111' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
        paymentMethod: 'payment_link',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.order.paymentStatus, 'Payment Pending');
    assert.equal(created.data.order.paymentMethod, 'payment_link');
    assert.equal(created.data.order.total, 250);
    assert.equal(created.data.business.payments.linkEnabled, true);
    assert.ok(created.data.confirmationToken);

    const token = created.data.confirmationToken;
    const orderNumber = created.data.order.orderNumber;

    const longRef = await api('POST', `/api/store/${owner.slug}/orders/confirm/${token}/payment`, {
      body: { paymentReference: 'x'.repeat(121) },
    });
    assert.equal(longRef.status, 400);

    const submitted = await api('POST', `/api/store/${owner.slug}/orders/confirm/${token}/payment`, {
      body: { paymentReference: 'UTR123456789' },
    });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.data));
    assert.equal(submitted.data.order.paymentStatus, 'Payment Submitted');
    assert.equal(submitted.data.order.paymentReference, 'UTR123456789');
    assert.ok(submitted.data.order.paymentReferenceSubmittedAt);
    assert.match(submitted.data.message || '', /confirm/i);

    const guestPaid = await api('POST', `/api/store/${owner.slug}/orders/confirm/${token}/payment`, {
      body: { paymentReference: 'UTR123456789', paymentStatus: 'Paid' },
    });
    assert.equal(guestPaid.status, 200);
    assert.equal(guestPaid.data.order.paymentStatus, 'Payment Submitted');

    const sellerList = await api('GET', `/api/orders?search=${orderNumber}`, { token: owner.token });
    const order = sellerList.data.orders.find((row) => row.orderNumber === orderNumber);
    assert.ok(order);

    const crossTenant = await api('PATCH', `/api/orders/${order.id}`, {
      token: other.token,
      body: { paymentStatus: 'Paid' },
    });
    assert.equal(crossTenant.status, 404);

    const unauth = await api('PATCH', `/api/orders/${order.id}`, {
      body: { paymentStatus: 'Paid' },
    });
    assert.equal(unauth.status, 401);

    const invalidStatus = await api('PATCH', `/api/orders/${order.id}`, {
      token: owner.token,
      body: { paymentStatus: 'TotallyPaid' },
    });
    assert.equal(invalidStatus.status, 400);

    const markedPaid = await api('PATCH', `/api/orders/${order.id}`, {
      token: owner.token,
      body: { paymentStatus: 'Paid' },
    });
    assert.equal(markedPaid.status, 200, JSON.stringify(markedPaid.data));
    assert.equal(markedPaid.data.order.paymentStatus, 'Paid');
    assert.ok(markedPaid.data.order.paymentVerifiedAt);
    assert.equal(markedPaid.data.order.paymentVerifiedBy, String(owner.userId));
    assert.ok(markedPaid.data.order.paymentEvents.some((event) => event.toStatus === 'Paid'));

    const duplicatePaid = await api('PATCH', `/api/orders/${order.id}`, {
      token: owner.token,
      body: { paymentStatus: 'Paid' },
    });
    assert.equal(duplicatePaid.status, 200);
    assert.equal(duplicatePaid.data.order.paymentStatus, 'Paid');

    const reopen = await api('PATCH', `/api/orders/${order.id}`, {
      token: owner.token,
      body: { paymentStatus: 'Payment Pending' },
    });
    assert.equal(reopen.status, 200);
    assert.equal(reopen.data.order.paymentStatus, 'Payment Pending');

    const rejected = await api('PATCH', `/api/orders/${order.id}`, {
      token: owner.token,
      body: { paymentStatus: 'Payment Rejected', paymentRejectionNote: 'Wrong amount' },
    });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.data.order.paymentStatus, 'Payment Rejected');
    assert.equal(rejected.data.order.paymentRejectionNote, 'Wrong amount');

    const pickup = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Pickup Guest', phone: '9822222222' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
        paymentMethod: 'pay_on_pickup',
      },
    });
    assert.equal(pickup.status, 201, JSON.stringify(pickup.data));
    assert.equal(pickup.data.order.paymentMethod, 'pay_on_pickup');
    assert.equal(pickup.data.order.paymentStatus, 'Payment Pending');

    const stock = await api('GET', `/api/products/${product.id}`, { token: owner.token });
    assert.equal(stock.data.product.stockQuantity, 6);
  });

  it('allows orders when no payment methods are configured and keeps billing endpoints intact', async () => {
    await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: {
        paymentQrEnabled: false,
        paymentLinkEnabled: false,
        paymentInstructionsEnabled: false,
        payOnPickupEnabled: false,
      },
    });

    const store = await api('GET', `/api/store/${owner.slug}`);
    assert.equal(store.data.business.payments.hasConfiguredMethod, false);

    const product = await addProduct(owner.token, {
      name: 'No Pay Method Pin',
      price: 90,
      stockQuantity: 2,
    });

    const created = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Pending Guest', phone: '9833333333' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Delivery',
        deliveryAddress: '22 Quiet Lane',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.order.paymentMethod, '');
    assert.equal(created.data.order.paymentStatus, 'Payment Pending');
    assert.equal(created.data.business.payments.hasConfiguredMethod, false);

    const billing = await api('GET', '/api/billing', { token: owner.token });
    assert.equal(billing.status, 200);
    assert.ok(billing.data);
  });
});

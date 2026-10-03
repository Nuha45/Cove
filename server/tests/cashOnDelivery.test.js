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
const { PAYMENT_METHOD_LABELS } = require('../services/invoiceService');
const { PAYMENT_METHODS, PAYMENT_STATUSES, methodLabel } = require('../utils/paymentMethods');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'CodTest1';
const createdBusinessIds = [];

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
  const email = `cod-${label}-${stamp}@example.com`;
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password,
      businessName: `${label} COD Shop ${stamp.slice(-6)}`,
      category: 'Homemade Food',
      phone: '9876543210',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { new: true });
  const business = await Business.findById(user.businessId);
  createdBusinessIds.push(user.businessId);
  return { token: signToken(user), businessId: user.businessId, slug: business.slug };
}

async function addProduct(token, input) {
  const response = await api('POST', '/api/products', { token, body: input });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data.product;
}

function checkout(slug, productId, extra) {
  return api('POST', `/api/store/${slug}/orders`, {
    body: {
      customer: { name: 'Cash Guest', phone: '9811112222' },
      items: [{ productId, quantity: 1 }],
      ...extra,
    },
  });
}

describe('cash on delivery', { timeout: 180000 }, () => {
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
    product = await addProduct(owner.token, { name: 'Cash Cake', price: 300, stockQuantity: 20 });
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

  it('is a known method using the existing payment statuses', () => {
    assert.ok(PAYMENT_METHODS.includes('cash_on_delivery'));
    assert.equal(methodLabel('cash_on_delivery', 'INR'), 'Cash on delivery');
    assert.equal(methodLabel('cash_on_delivery', 'AED'), 'Cash on delivery');
    assert.deepEqual(PAYMENT_STATUSES, ['Pending', 'Payment Pending', 'Payment Submitted', 'Paid', 'Payment Rejected']);
    for (const method of PAYMENT_METHODS) {
      assert.ok(PAYMENT_METHOD_LABELS[method], `invoice label missing for ${method}`);
    }
    assert.equal(PAYMENT_METHOD_LABELS.cash_on_delivery, 'Cash on delivery');
  });

  it('is off by default and is only offered once the seller turns it on', async () => {
    const before = await api('GET', `/api/store/${owner.slug}`);
    assert.equal(before.data.business.payments.cashOnDeliveryEnabled, false);
    const settings = await api('GET', '/api/business/settings', { token: owner.token });
    assert.equal(settings.data.business.cashOnDeliveryEnabled, false);

    const linkOn = await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { paymentLinkEnabled: true, paymentLink: 'https://pay.example.com/cod-test' },
    });
    assert.equal(linkOn.status, 200, JSON.stringify(linkOn.data));

    const blocked = await checkout(owner.slug, product.id, {
      deliveryMethod: 'Delivery',
      deliveryAddress: '12 Baker Street',
      paymentMethod: 'cash_on_delivery',
    });
    assert.equal(blocked.status, 400);
    assert.equal(blocked.data.errors?.[0]?.field, 'paymentMethod');

    const invalid = await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { cashOnDeliveryEnabled: 'sometimes' },
    });
    assert.equal(invalid.status, 400);

    const saved = await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { cashOnDeliveryEnabled: true, deliveryEnabled: true },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.business.cashOnDeliveryEnabled, true);

    const after = await api('GET', `/api/store/${owner.slug}`);
    assert.equal(after.data.business.payments.cashOnDeliveryEnabled, true);
    assert.equal(after.data.business.payments.hasConfiguredMethod, true);

    const otherStore = await api('GET', `/api/store/${other.slug}`);
    assert.equal(otherStore.data.business.payments.cashOnDeliveryEnabled, false);
  });

  it('only accepts cash on delivery for delivery orders', async () => {
    const pickup = await checkout(owner.slug, product.id, {
      deliveryMethod: 'Pickup',
      paymentMethod: 'cash_on_delivery',
    });
    assert.equal(pickup.status, 400);
    assert.match(pickup.data.message, /only available for delivery orders/);
    assert.equal(await Order.countDocuments({ businessId: owner.businessId, paymentMethod: 'cash_on_delivery', deliveryMethod: 'Pickup' }), 0);
  });

  it('places a COD order as Payment Pending, blocks customer references, and lets only the seller mark it Paid', async () => {
    emailService.clearMemoryOutbox();
    const created = await checkout(owner.slug, product.id, {
      deliveryMethod: 'Delivery',
      deliveryAddress: '12 Baker Street',
      paymentMethod: 'cash_on_delivery',
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.order.paymentMethod, 'cash_on_delivery');
    assert.equal(created.data.order.paymentStatus, 'Payment Pending');
    const token = created.data.confirmationToken;

    const confirmation = await api('GET', `/api/store/${owner.slug}/orders/confirm/${token}`);
    assert.equal(confirmation.status, 200);
    assert.equal(confirmation.data.order.paymentMethod, 'cash_on_delivery');
    assert.equal(confirmation.data.order.paymentStatus, 'Payment Pending');

    const reference = await api('POST', `/api/store/${owner.slug}/orders/confirm/${token}/payment`, {
      body: { paymentReference: 'CASH-PAID' },
    });
    assert.equal(reference.status, 400);
    assert.match(reference.data.message, /paid when your order arrives/);
    const unchanged = await Order.findOne({ businessId: owner.businessId, orderNumber: created.data.order.orderNumber });
    assert.equal(unchanged.paymentStatus, 'Payment Pending');
    assert.equal(unchanged.paymentReference || '', '');

    const list = await api('GET', `/api/orders?search=${created.data.order.orderNumber}`, { token: owner.token });
    const row = list.data.orders.find((item) => item.orderNumber === created.data.order.orderNumber);
    assert.equal(row.paymentMethod, 'cash_on_delivery');

    const crossTenant = await api('PATCH', `/api/orders/${row.id}`, { token: other.token, body: { paymentStatus: 'Paid' } });
    assert.equal(crossTenant.status, 404);

    const paid = await api('PATCH', `/api/orders/${row.id}`, { token: owner.token, body: { paymentStatus: 'Paid' } });
    assert.equal(paid.status, 200, JSON.stringify(paid.data));
    assert.equal(paid.data.order.paymentStatus, 'Paid');
    assert.equal(paid.data.order.paymentMethod, 'cash_on_delivery');
    assert.ok(paid.data.order.paymentEvents.some((event) => event.fromStatus === 'Payment Pending' && event.toStatus === 'Paid'));
  });

  it('does not let a customer switch an existing order to cash on delivery', async () => {
    await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { paymentLinkEnabled: true, paymentLink: 'https://pay.example.com/cod-test' },
    });
    const created = await checkout(owner.slug, product.id, {
      deliveryMethod: 'Delivery',
      deliveryAddress: '12 Baker Street',
      paymentMethod: 'payment_link',
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const switched = await api('POST', `/api/store/${owner.slug}/orders/confirm/${created.data.confirmationToken}/payment`, {
      body: { paymentReference: 'REF1', paymentMethod: 'cash_on_delivery' },
    });
    assert.equal(switched.status, 400);
    const confirmation = await api('GET', `/api/store/${owner.slug}/orders/confirm/${created.data.confirmationToken}`);
    assert.equal(confirmation.data.order.paymentMethod, 'payment_link');
    assert.equal(confirmation.data.order.paymentStatus, 'Payment Pending');
  });

  it('shows cash on delivery in the seller and customer order emails', async () => {
    const previous = process.env.EMAIL_PROVIDER;
    process.env.EMAIL_PROVIDER = 'memory';
    try {
      emailService.clearMemoryOutbox();
      const order = {
        id: 'o1',
        orderNumber: 'COV-1001',
        customer: { name: 'Cash Guest' },
        items: [{ quantity: 1, name: 'Cash Cake', subtotal: 300 }],
        total: 300,
        deliveryFee: 0,
        status: 'New',
        paymentStatus: 'Payment Pending',
        paymentMethod: 'cash_on_delivery',
      };
      await emailService.sendSellerNewOrder({ to: 'seller@example.com', businessName: 'Cash Shop', order, currency: 'INR' });
      await emailService.sendCustomerOrderConfirmation({ to: 'buyer@example.com', businessName: 'Cash Shop', order, currency: 'INR' });
      const [seller, buyer] = emailService.getMemoryOutbox();
      assert.match(seller.text, /Payment method: Cash on delivery/);
      assert.match(seller.text, /Collect ₹300 in cash on delivery, then mark the order as paid/);
      assert.match(seller.html, /Payment method: Cash on delivery/);
      assert.match(buyer.text, /Payment method: Cash on delivery/);
      assert.match(buyer.text, /keep ₹300 in cash ready when your order is delivered/);
      assert.match(buyer.html, /Payment method: Cash on delivery/);
      assert.match(buyer.text, /Payment status: Pending/);

      emailService.clearMemoryOutbox();
      await emailService.sendSellerNewOrder({
        to: 'seller@example.com',
        businessName: 'Cash Shop',
        order: { ...order, paymentMethod: 'payment_link' },
        currency: 'INR',
      });
      const [linkEmail] = emailService.getMemoryOutbox();
      assert.match(linkEmail.text, /Payment method: UPI \/ payment link/);
      assert.doesNotMatch(linkEmail.text, /in cash/i);
    } finally {
      process.env.EMAIL_PROVIDER = previous;
      emailService.clearMemoryOutbox();
    }
  });
});

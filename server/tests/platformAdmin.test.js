const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');

process.env.COVE_GRANT_TRIAL_ON_REGISTER = 'true';
process.env.COVE_ENFORCE_BILLING = 'true';

const { connectTestDB } = require('./_testDb');
const env = require('../config/env');
const app = require('../app');
const User = require('../models/User');
const Business = require('../models/Business');
const Subscription = require('../models/Subscription');
const Product = require('../models/Product');
const Order = require('../models/Order');
const OrderCounter = require('../models/OrderCounter');
const Customer = require('../models/Customer');
const Notification = require('../models/Notification');
const EmailDelivery = require('../models/EmailDelivery');
const StoreEvent = require('../models/StoreEvent');
const billingService = require('../services/billingService');
const { signToken } = require('../services/tokenService');
const { COVE_PRO, COVE_ADVANCED, TRIAL_DAYS } = require('../utils/covePlan');

const DAY_MS = 24 * 60 * 60 * 1000;
const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'PlatformAdmin123';
const createdBusinessIds = [];

let server;
let base;

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
  const email = `platform-${label}-${stamp}@example.com`;
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password,
      businessName: `${label} Platform ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { new: true });
  const business = await Business.findById(user.businessId);
  createdBusinessIds.push(user.businessId);
  const product = await Product.create({
    businessId: user.businessId,
    name: `${label} Ring`,
    price: 250,
    stockQuantity: 50,
    status: 'Active',
  });
  return {
    email,
    userId: user._id,
    token: signToken(user),
    businessId: String(user.businessId),
    slug: business.slug,
    productId: String(product._id),
  };
}

async function expireTrial(tenant) {
  await Subscription.updateOne(
    { businessId: tenant.businessId },
    { $set: { status: 'incomplete', trialEndAt: new Date(Date.now() - 2 * DAY_MS) } }
  );
}

async function setAdmin(tenant, value) {
  await User.updateOne({ _id: tenant.userId }, { $set: { isPlatformAdmin: value } });
}

function publicOrder(tenant, phone) {
  return {
    customer: { name: 'Asha', phone },
    items: [{ productId: tenant.productId, quantity: 1 }],
    deliveryMethod: 'Pickup',
    paymentMethod: 'pay_on_pickup',
  };
}

function sellerOrder(tenant, phone) {
  return {
    customer: { name: 'Walk-in', phone, email: '' },
    items: [{ productId: tenant.productId, quantity: 1 }],
    deliveryMethod: 'Pickup',
    deliveryAddress: '',
    notes: '',
  };
}

// Everything billing gates: public store, customer orders, seller orders and Cove Plus routes.
async function access(tenant, phoneSuffix) {
  const [storefront, billing, inventory] = await Promise.all([
    api('GET', `/api/store/${tenant.slug}`),
    api('GET', '/api/billing', { token: tenant.token }),
    api('GET', '/api/products/inventory', { token: tenant.token }),
  ]);
  const placed = await api('POST', `/api/store/${tenant.slug}/orders`, { body: publicOrder(tenant, `98765${phoneSuffix}01`) });
  const manual = await api('POST', '/api/orders', { token: tenant.token, body: sellerOrder(tenant, `98765${phoneSuffix}02`) });
  return {
    storeOpen: storefront.status === 200 && storefront.data.business.paused !== true && storefront.data.products.length > 0,
    billing: billing.data,
    publicOrder: placed.status,
    sellerOrder: manual.status,
    plusFeature: inventory.status,
  };
}

describe('platform admin access and billing exemption', { timeout: 240000 }, () => {
  let owner;
  let friend;
  let seller;

  before(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    owner = await registerTenant('owner');
    friend = await registerTenant('friend');
    seller = await registerTenant('seller');
    await setAdmin(owner, true);
  });

  after(async () => {
    if (createdBusinessIds.length) {
      const scope = { businessId: { $in: createdBusinessIds } };
      await Promise.all([
        StoreEvent.deleteMany(scope),
        EmailDelivery.deleteMany(scope),
        Notification.deleteMany(scope),
        Order.deleteMany(scope),
        Customer.deleteMany(scope),
        Product.deleteMany(scope),
        OrderCounter.deleteMany(scope),
        Subscription.deleteMany(scope),
        User.deleteMany(scope),
      ]);
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('runs with billing enforcement on and unchanged Cove pricing', () => {
    assert.equal(env.enforceBilling, true);
    assert.equal(TRIAL_DAYS, 7);
    assert.equal(COVE_PRO.amountDisplay, 599);
    assert.equal(COVE_ADVANCED.amountDisplay, 899);
    assert.equal(COVE_PRO.currency, 'INR');
  });

  it('still blocks a normal seller whose trial has expired', async () => {
    await expireTrial(seller);
    const result = await access(seller, '001');
    assert.equal(result.storeOpen, false);
    assert.equal(result.publicOrder, 403);
    assert.equal(result.sellerOrder, 403);
    assert.equal(result.plusFeature, 403);
    assert.equal(result.billing.billingExempt, false);
    assert.equal(result.billing.store.paused, true);
    assert.equal(result.billing.access, 'trial_ended');
    assert.equal(result.billing.entitlements.advanced, false);
  });

  it('still lets a normal seller with an active subscription work as before', async () => {
    await Subscription.updateOne(
      { businessId: seller.businessId },
      {
        $set: {
          status: 'active',
          plan: 'pro',
          currentPeriodStartAt: new Date(Date.now() - DAY_MS),
          currentPeriodEndAt: new Date(Date.now() + 29 * DAY_MS),
        },
      }
    );
    const basic = await access(seller, '002');
    assert.equal(basic.storeOpen, true);
    assert.equal(basic.publicOrder, 201);
    assert.equal(basic.sellerOrder, 201);
    assert.equal(basic.plusFeature, 403, 'Cove Basic does not include Cove Plus features');
    assert.equal(basic.billing.billingExempt, false);
    assert.equal(basic.billing.access, 'ok');

    await Subscription.updateOne({ businessId: seller.businessId }, { $set: { plan: 'advanced' } });
    const plus = await access(seller, '003');
    assert.equal(plus.plusFeature, 200);
  });

  it('never pauses or plan-gates a platform admin who has no trial or subscription', async () => {
    await expireTrial(owner);
    let result = await access(owner, '004');
    assert.equal(result.storeOpen, true);
    assert.equal(result.publicOrder, 201);
    assert.equal(result.sellerOrder, 201);
    assert.equal(result.plusFeature, 200);
    assert.equal(result.billing.billingExempt, true);
    assert.equal(result.billing.store.paused, false);
    assert.equal(result.billing.access, 'ok');
    assert.equal(result.billing.entitlements.advanced, true);
    assert.equal(result.billing.entitlements.trialEnded, false);
    assert.equal((await api('GET', '/api/admin/overview', { token: owner.token })).status, 200);

    await Subscription.deleteOne({ businessId: owner.businessId });
    result = await access(owner, '005');
    assert.equal(result.storeOpen, true);
    assert.equal(result.publicOrder, 201);
    assert.equal(result.sellerOrder, 201);
    assert.equal(result.plusFeature, 200);

    const paused = await billingService.pausedBusinessIds([owner.businessId, seller.businessId]);
    assert.equal(paused.has(owner.businessId), false);
    // Billing rows are never rewritten as "paid" for admins.
    const stored = await Subscription.findOne({ businessId: owner.businessId }).lean();
    assert.notEqual(stored?.status, 'active');
  });

  it('a revoked admin immediately loses admin access and goes back to normal billing', async () => {
    const temp = await registerTenant('revoked');
    await expireTrial(temp);
    await setAdmin(temp, true);
    assert.equal((await api('GET', '/api/admin/overview', { token: temp.token })).status, 200);
    assert.equal((await access(temp, '006')).storeOpen, true);

    await setAdmin(temp, false);
    assert.equal((await api('GET', '/api/admin/overview', { token: temp.token })).status, 403);
    const result = await access(temp, '007');
    assert.equal(result.storeOpen, false);
    assert.equal(result.sellerOrder, 403);
    assert.equal(result.plusFeature, 403);
    assert.equal(result.billing.billingExempt, false);
  });

  it('keeps normal sellers out of admin routes whatever the request claims', async () => {
    const forged = {
      headers: { 'x-admin': 'true', 'x-platform-admin': 'true' },
      body: { isPlatformAdmin: true, role: 'admin', grant: true, confirmEmail: seller.email },
    };
    for (const [method, path] of [
      ['GET', '/api/admin/overview'],
      ['GET', '/api/admin/businesses'],
      ['GET', `/api/admin/businesses/${seller.businessId}`],
      ['POST', `/api/admin/businesses/${seller.businessId}/platform-admin`],
      ['POST', `/api/admin/businesses/${friend.businessId}/platform-admin`],
    ]) {
      const response = await api(method, `${path}?isPlatformAdmin=true`, {
        token: seller.token,
        headers: forged.headers,
        body: method === 'POST' ? forged.body : undefined,
      });
      assert.equal(response.status, 403, `${method} ${path}`);
    }
    assert.equal((await api('POST', `/api/admin/businesses/${seller.businessId}/platform-admin`, { body: forged.body })).status, 401);

    // Seller-facing writes ignore an admin flag in the body.
    await api('PATCH', '/api/business/settings', { token: seller.token, body: { isPlatformAdmin: true, city: 'Kochi' } });
    const me = await api('GET', '/api/auth/me', { token: seller.token });
    assert.equal(me.data.user.isPlatformAdmin, false);
    assert.equal((await User.findById(seller.userId).lean()).isPlatformAdmin, false);
  });

  it('only an existing admin can grant and revoke admin access, with the owner email retyped', async () => {
    const path = `/api/admin/businesses/${friend.businessId}/platform-admin`;
    await expireTrial(friend);

    const wrongEmail = await api('POST', path, { token: owner.token, body: { grant: true, confirmEmail: 'someone@example.com' } });
    assert.equal(wrongEmail.status, 400);
    const missingEmail = await api('POST', path, { token: owner.token, body: { grant: true } });
    assert.equal(missingEmail.status, 400);
    const notBoolean = await api('POST', path, { token: owner.token, body: { grant: 'true', confirmEmail: friend.email } });
    assert.equal(notBoolean.status, 400);
    assert.equal((await User.findById(friend.userId).lean()).isPlatformAdmin, false);
    assert.equal((await api('GET', '/api/admin/overview', { token: friend.token })).status, 403);

    const granted = await api('POST', path, {
      token: owner.token,
      body: { grant: true, confirmEmail: `  ${friend.email.toUpperCase()} ` },
    });
    assert.equal(granted.status, 200, JSON.stringify(granted.data));
    assert.equal(granted.data.business.owner.isPlatformAdmin, true);
    assert.equal(granted.data.business.owner.isYou, false);
    assert.equal((await User.findById(friend.userId).lean()).isPlatformAdmin, true);

    // The friend gets the Admin panel and an exempt shop without buying a plan.
    assert.equal((await api('GET', '/api/admin/overview', { token: friend.token })).status, 200);
    const friendAccess = await access(friend, '008');
    assert.equal(friendAccess.storeOpen, true);
    assert.equal(friendAccess.sellerOrder, 201);
    assert.equal(friendAccess.billing.billingExempt, true);

    // Admin-owned shops stay protected from archive and delete.
    assert.equal((await api('POST', `/api/admin/businesses/${friend.businessId}/archive`, { token: owner.token })).status, 400);
    assert.equal((await api('DELETE', `/api/admin/businesses/${friend.businessId}`, {
      token: owner.token,
      body: { confirmSlug: friend.slug },
    })).status, 400);

    // Nobody can change their own flag, so an admin cannot lock out the last admin by accident.
    const self = await api('POST', `/api/admin/businesses/${owner.businessId}/platform-admin`, {
      token: owner.token,
      body: { grant: false, confirmEmail: owner.email },
    });
    assert.equal(self.status, 400);
    assert.equal((await User.findById(owner.userId).lean()).isPlatformAdmin, true);
    const detail = await api('GET', `/api/admin/businesses/${owner.businessId}`, { token: owner.token });
    assert.equal(detail.data.business.owner.isYou, true);

    const revoked = await api('POST', path, { token: owner.token, body: { grant: false, confirmEmail: friend.email } });
    assert.equal(revoked.status, 200, JSON.stringify(revoked.data));
    assert.equal(revoked.data.business.owner.isPlatformAdmin, false);
    assert.equal((await api('GET', '/api/admin/overview', { token: friend.token })).status, 403);
    const after = await access(friend, '009');
    assert.equal(after.storeOpen, false);
    assert.equal(after.billing.billingExempt, false);
  });

  it('refuses to grant admin to an unverified or archived account', async () => {
    const unverified = await registerTenant('unverified');
    await User.updateOne({ _id: unverified.userId }, { $set: { emailVerified: false } });
    const path = `/api/admin/businesses/${unverified.businessId}/platform-admin`;
    const denied = await api('POST', path, { token: owner.token, body: { grant: true, confirmEmail: unverified.email } });
    assert.equal(denied.status, 400);

    await User.updateOne({ _id: unverified.userId }, { $set: { emailVerified: true } });
    await Business.updateOne({ _id: unverified.businessId }, { $set: { archivedAt: new Date() } });
    const archived = await api('POST', path, { token: owner.token, body: { grant: true, confirmEmail: unverified.email } });
    assert.equal(archived.status, 400);
    assert.equal((await User.findById(unverified.userId).lean()).isPlatformAdmin, false);
  });
});

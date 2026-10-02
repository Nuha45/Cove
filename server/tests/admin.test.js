const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { connectTestDB } = require('./_testDb');
const app = require('../app');
const User = require('../models/User');
const Business = require('../models/Business');
const Subscription = require('../models/Subscription');
const Product = require('../models/Product');
const Order = require('../models/Order');
const OrderCounter = require('../models/OrderCounter');
const Customer = require('../models/Customer');
const CustomerWant = require('../models/CustomerWant');
const Notification = require('../models/Notification');
const CustomerWantVote = require('../models/CustomerWantVote');
const Invoice = require('../models/Invoice');
const StoreEvent = require('../models/StoreEvent');
const EmailDelivery = require('../models/EmailDelivery');
const imageStorage = require('../services/imageStorage');
const { signToken } = require('../services/tokenService');
const { accountStatus } = require('../utils/adminStatus');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'AdminTest123';
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

async function registerTenant(label, extraBody = {}) {
  const email = `admin-${label}-${stamp}@example.com`;
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password,
      businessName: `${label} Shop ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
      phone: '9876543210',
      ...extraBody,
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { new: true });
  const business = await Business.findById(user.businessId);
  createdBusinessIds.push(user.businessId);
  return {
    email,
    user,
    registered,
    token: signToken(user),
    businessId: String(user.businessId),
    slug: business.slug,
    name: business.name,
  };
}

async function addProduct(token, name) {
  const response = await api('POST', '/api/products', {
    token,
    body: { name, price: 100, stockQuantity: 20, category: 'Jewelry & Accessories', status: 'Active' },
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data.product;
}

async function addOrder(token, productId, phone) {
  const response = await api('POST', '/api/orders', {
    token,
    body: {
      customer: { name: `Buyer ${phone}`, phone, email: '' },
      items: [{ productId, quantity: 1 }],
      deliveryMethod: 'Pickup',
      deliveryAddress: '',
      notes: '',
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data.order;
}

describe('admin', { timeout: 180000 }, () => {
  let admin;
  let seller;
  let other;

  before(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;

    admin = await registerTenant('operator');
    await User.updateOne({ _id: admin.user._id }, { $set: { isPlatformAdmin: true } });

    seller = await registerTenant('seller');
    other = await registerTenant('other');

    const sellerProductA = await addProduct(seller.token, 'Seller Ring');
    await addProduct(seller.token, 'Seller Chain');
    await addOrder(seller.token, sellerProductA.id, '9876600001');
    const wanted = await api('POST', `/api/store/${seller.slug}/wants`, {
      body: { name: 'Seller Want', phone: '9876600002', request: 'Looking for a silver bangle.', quantity: 1 },
    });
    assert.equal(wanted.status, 201, JSON.stringify(wanted.data));

    const otherProducts = await Promise.all([
      addProduct(other.token, 'Other Ring'),
      addProduct(other.token, 'Other Chain'),
      addProduct(other.token, 'Other Anklet'),
    ]);
    await addOrder(other.token, otherProducts[0].id, '9876600011');
    await addOrder(other.token, otherProducts[1].id, '9876600012');
    await addOrder(other.token, otherProducts[2].id, '9876600013');
    for (const phone of ['9876600014', '9876600015']) {
      const response = await api('POST', `/api/store/${other.slug}/wants`, {
        body: { name: 'Other Want', phone, request: 'Need a custom pendant please.', quantity: 1 },
      });
      assert.equal(response.status, 201, JSON.stringify(response.data));
    }
  });

  after(async () => {
    if (createdBusinessIds.length) {
      const filter = { businessId: { $in: createdBusinessIds } };
      await CustomerWant.deleteMany(filter);
      await Order.deleteMany(filter);
      await Product.deleteMany(filter);
      await Customer.deleteMany(filter);
      await OrderCounter.deleteMany(filter);
      await Notification.deleteMany(filter);
      await CustomerWantVote.deleteMany(filter);
      await Invoice.deleteMany(filter);
      await StoreEvent.deleteMany(filter);
      await EmailDelivery.deleteMany(filter);
      await Subscription.deleteMany(filter);
      await User.deleteMany(filter);
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('denies unauthenticated access to every admin endpoint', async () => {
    for (const path of ['/api/admin/overview', '/api/admin/businesses', `/api/admin/businesses/${seller.businessId}`]) {
      const response = await api('GET', path);
      assert.equal(response.status, 401, path);
      assert.equal(response.data.overview, undefined);
      assert.equal(response.data.businesses, undefined);
    }
  });

  it('forbids a normal seller from admin endpoints', async () => {
    for (const path of ['/api/admin/overview', '/api/admin/businesses', `/api/admin/businesses/${seller.businessId}`]) {
      const response = await api('GET', path, { token: seller.token });
      assert.equal(response.status, 403, path);
      assert.equal(response.data.overview, undefined);
      assert.equal(response.data.businesses, undefined);
      assert.equal(response.data.business, undefined);
    }
  });

  it('revoking the flag in the database blocks an existing admin session', async () => {
    const temp = await registerTenant('revoked');
    await User.updateOne({ _id: temp.user._id }, { $set: { isPlatformAdmin: true } });
    const allowed = await api('GET', '/api/admin/overview', { token: temp.token });
    assert.equal(allowed.status, 200);
    await User.updateOne({ _id: temp.user._id }, { $set: { isPlatformAdmin: false } });
    const blocked = await api('GET', '/api/admin/overview', { token: temp.token });
    assert.equal(blocked.status, 403);
  });

  it('lets an admin read the overview', async () => {
    const response = await api('GET', '/api/admin/overview', { token: admin.token });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    const { overview } = response.data;
    const { totals } = overview;
    assert.ok(totals.businesses >= 3);
    assert.equal(
      totals.active + totals.trial + totals.paymentRequired + totals.restricted,
      totals.businesses
    );
    assert.equal(typeof overview.trialsEndingSoon.count, 'number');
    const { plans } = overview.revenue;
    assert.deepEqual(plans.map((plan) => [plan.name, plan.pricePerMonth]), [['Cove Basic', 599], ['Cove Plus', 899]]);
    assert.equal(plans.reduce((sum, plan) => sum + plan.activeSubscriptions, 0), overview.revenue.activeSubscriptions);
    assert.equal(
      overview.revenue.estimatedMrr,
      plans.reduce((sum, plan) => sum + plan.activeSubscriptions * plan.pricePerMonth, 0)
    );
    assert.ok(Array.isArray(overview.recentSignups));
    assert.ok(overview.recentSignups.length > 0);
    const serialized = JSON.stringify(overview);
    assert.equal(serialized.includes('providerSubscriptionId'), false);
    assert.equal(serialized.includes('passwordHash'), false);
  });

  it('lets an admin list and search businesses with bounded pages', async () => {
    const listed = await api('GET', '/api/admin/businesses?limit=500', { token: admin.token });
    assert.equal(listed.status, 200, JSON.stringify(listed.data));
    assert.equal(listed.data.limit, 50);
    assert.ok(listed.data.businesses.length <= 50);

    const byEmail = await api('GET', `/api/admin/businesses?search=${encodeURIComponent(seller.email)}`, {
      token: admin.token,
    });
    assert.equal(byEmail.status, 200);
    assert.equal(byEmail.data.total, 1);
    assert.equal(byEmail.data.businesses[0].id, seller.businessId);
    assert.equal(byEmail.data.businesses[0].owner.email, seller.email);

    const byName = await api('GET', `/api/admin/businesses?search=${encodeURIComponent(other.name)}`, {
      token: admin.token,
    });
    assert.equal(byName.data.businesses.some((item) => item.id === other.businessId), true);

    const regexy = await api('GET', `/api/admin/businesses?search=${encodeURIComponent('.*(')}`, {
      token: admin.token,
    });
    assert.equal(regexy.status, 200);
    assert.equal(regexy.data.total, 0);

    const row = byEmail.data.businesses[0];
    assert.equal(row.passwordHash, undefined);
    assert.equal(row.paymentUpiId, undefined);
    assert.equal(JSON.stringify(row).includes('providerSubscriptionId'), false);
  });

  it('returns business detail counts scoped to the requested business', async () => {
    const response = await api('GET', `/api/admin/businesses/${seller.businessId}`, { token: admin.token });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    const { business } = response.data;
    assert.equal(business.id, seller.businessId);
    assert.equal(business.owner.email, seller.email);
    assert.equal(business.counts.products, 2);
    assert.equal(business.counts.activeProducts, 2);
    assert.equal(business.counts.orders, 1);
    assert.equal(business.counts.customers, 1);
    assert.equal(business.counts.customerRequests, 1);
    assert.ok(business.lastActivity?.at);
    assert.equal(business.subscription.accountStatus, 'trial');

    const serialized = JSON.stringify(business);
    assert.equal(serialized.includes(other.businessId), false);
    assert.equal(serialized.includes(other.email), false);
    assert.equal(serialized.includes('Other Ring'), false);
    assert.equal(serialized.includes('providerSubscriptionId'), false);
    assert.equal(serialized.includes('paymentUpiId'), false);

    const otherDetail = await api('GET', `/api/admin/businesses/${other.businessId}`, { token: admin.token });
    assert.equal(otherDetail.data.business.counts.products, 3);
    assert.equal(otherDetail.data.business.counts.orders, 3);
    assert.equal(otherDetail.data.business.counts.customerRequests, 2);
  });

  it('handles invalid and missing business ids safely', async () => {
    const invalid = await api('GET', '/api/admin/businesses/not-an-id', { token: admin.token });
    assert.equal(invalid.status, 404);
    const missing = await api('GET', `/api/admin/businesses/${new mongoose.Types.ObjectId()}`, { token: admin.token });
    assert.equal(missing.status, 404);
  });

  it('archives, restores and permanently deletes a shop', async () => {
    const target = await registerTenant('archive');
    const product = await addProduct(target.token, 'Archive Ring');
    await addOrder(target.token, product.id, '9876600021');

    const forbidden = await api('POST', `/api/admin/businesses/${target.businessId}/archive`, { token: seller.token });
    assert.equal(forbidden.status, 403);

    const ownShop = await api('POST', `/api/admin/businesses/${admin.businessId}/archive`, { token: admin.token });
    assert.equal(ownShop.status, 400);

    const notArchived = await api('DELETE', `/api/admin/businesses/${target.businessId}`, {
      token: admin.token,
      body: { confirmSlug: target.slug },
    });
    assert.equal(notArchived.status, 400);

    const archived = await api('POST', `/api/admin/businesses/${target.businessId}/archive`, { token: admin.token });
    assert.equal(archived.status, 200, JSON.stringify(archived.data));
    assert.ok(archived.data.business.archivedAt);

    const oldSession = await api('GET', '/api/auth/me', { token: target.token });
    assert.equal(oldSession.status, 401);
    const login = await api('POST', '/api/auth/login', { body: { email: target.email, password } });
    assert.equal(login.status, 403);
    const storefront = await api('GET', `/api/store/${target.slug}`);
    assert.equal(storefront.status, 404);

    const overview = await api('GET', '/api/admin/overview', { token: admin.token });
    assert.equal(overview.data.overview.recentSignups.some((item) => item.id === target.businessId), false);

    const restored = await api('POST', `/api/admin/businesses/${target.businessId}/restore`, { token: admin.token });
    assert.equal(restored.status, 200);
    assert.equal(restored.data.business.archivedAt, null);
    const loginAgain = await api('POST', '/api/auth/login', { body: { email: target.email, password } });
    assert.equal(loginAgain.status, 200, JSON.stringify(loginAgain.data));
    assert.equal((await api('GET', `/api/store/${target.slug}`)).status, 200);

    await api('POST', `/api/admin/businesses/${target.businessId}/archive`, { token: admin.token });
    const wrongConfirm = await api('DELETE', `/api/admin/businesses/${target.businessId}`, {
      token: admin.token,
      body: { confirmSlug: 'not-the-slug' },
    });
    assert.equal(wrongConfirm.status, 400);
    assert.ok(await Business.exists({ _id: target.businessId }));

    await Subscription.updateOne(
      { businessId: target.businessId },
      { $set: { providerSubscriptionId: `sub_test_${stamp}`, status: 'active' } }
    );
    const liveSub = await api('DELETE', `/api/admin/businesses/${target.businessId}`, {
      token: admin.token,
      body: { confirmSlug: target.slug },
    });
    assert.equal(liveSub.status, 409);
    await Subscription.updateOne({ businessId: target.businessId }, { $set: { status: 'cancelled' } });

    const deleted = await api('DELETE', `/api/admin/businesses/${target.businessId}`, {
      token: admin.token,
      body: { confirmSlug: target.slug },
    });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
    assert.equal(deleted.data.deleted.products, 1);
    assert.equal(deleted.data.deleted.orders, 1);
    assert.equal(await Business.exists({ _id: target.businessId }), null);
    assert.equal(await User.exists({ businessId: target.businessId }), null);
    assert.equal(await Product.exists({ businessId: target.businessId }), null);
    assert.equal(await Order.exists({ businessId: target.businessId }), null);
    assert.equal(await Subscription.exists({ businessId: target.businessId }), null);

    const sellerStill = await api('GET', `/api/admin/businesses/${seller.businessId}`, { token: admin.token });
    assert.equal(sellerStill.data.business.counts.products, 2);
  });

  describe('delete seller account', () => {
    const SCOPED_MODELS = {
      User, Subscription, Product, Order, Customer, CustomerWant, CustomerWantVote,
      Invoice, Notification, StoreEvent, EmailDelivery, OrderCounter,
    };

    async function scopedCounts(businessId) {
      const entries = await Promise.all(Object.entries(SCOPED_MODELS).map(async ([name, Model]) => (
        [name, await Model.countDocuments({ businessId: new mongoose.Types.ObjectId(businessId) })]
      )));
      return Object.fromEntries(entries);
    }

    async function archivedSeller(label) {
      const target = await registerTenant(label);
      const product = await addProduct(target.token, `${label} Ring`);
      await addOrder(target.token, product.id, '9876600031');
      const wanted = await api('POST', `/api/store/${target.slug}/wants`, {
        body: { name: 'Want Buyer', phone: '9876600032', request: 'Looking for gold hoops.', quantity: 1 },
      });
      assert.equal(wanted.status, 201, JSON.stringify(wanted.data));
      // Records without a public creation path in this flow; raw inserts only need the tenant scope.
      const businessId = new mongoose.Types.ObjectId(target.businessId);
      await Promise.all([CustomerWantVote, Invoice, StoreEvent, EmailDelivery, Notification].map(
        (Model) => Model.collection.insertOne({
          businessId,
          wantId: new mongoose.Types.ObjectId(),
          voterKeyHash: `${label}-${stamp}`,
          createdAt: new Date(),
        })
      ));
      const archived = await api('POST', `/api/admin/businesses/${target.businessId}/archive`, { token: admin.token });
      assert.equal(archived.status, 200, JSON.stringify(archived.data));
      return target;
    }

    function remove(businessId, { token, body } = {}) {
      return api('DELETE', `/api/admin/businesses/${businessId}`, { token, body });
    }

    it('only a platform admin can delete, re-checked on every request', async () => {
      const target = await archivedSeller('delauth');
      const before = await scopedCounts(target.businessId);

      assert.equal((await remove(target.businessId, { body: { confirmSlug: target.slug } })).status, 401);
      assert.equal((await remove(target.businessId, { token: other.token, body: { confirmSlug: target.slug } })).status, 403);
      assert.equal((await remove(target.businessId, { token: target.token, body: { confirmSlug: target.slug } })).status, 401);

      const temp = await registerTenant('delrevoked');
      await User.updateOne({ _id: temp.user._id }, { $set: { isPlatformAdmin: true } });
      await User.updateOne({ _id: temp.user._id }, { $set: { isPlatformAdmin: false } });
      assert.equal((await remove(target.businessId, { token: temp.token, body: { confirmSlug: target.slug } })).status, 403);

      const ownShop = await remove(admin.businessId, { token: admin.token, body: { confirmSlug: admin.slug } });
      assert.equal(ownShop.status, 400);
      assert.ok(await Business.exists({ _id: admin.businessId }));

      assert.ok(await Business.exists({ _id: target.businessId }));
      assert.deepEqual(await scopedCounts(target.businessId), before);
    });

    it('rejects a missing, wrong, differently-cased or stale shop slug and deletes nothing', async () => {
      const target = await archivedSeller('delslug');
      const before = await scopedCounts(target.businessId);
      const deletedPrefixes = imageStorage.memory.deletedPrefixes.length;

      const attempts = [
        undefined,
        {},
        { confirmSlug: '' },
        { confirmSlug: other.slug },
        { confirmSlug: target.slug.toUpperCase() },
        { confirmSlug: `${target.slug}x` },
        { confirmSlug: [target.slug] },
        { confirmSlug: { $ne: '' } },
      ];
      for (const body of attempts) {
        const response = await remove(target.businessId, { token: admin.token, body });
        assert.equal(response.status, 400, JSON.stringify(body));
      }

      // The admin page was loaded before the seller's link changed: the old slug must not confirm.
      const renamed = `${target.slug}-renamed`;
      await Business.updateOne({ _id: target.businessId }, { $set: { slug: renamed } });
      const stale = await remove(target.businessId, { token: admin.token, body: { confirmSlug: target.slug } });
      assert.equal(stale.status, 400);
      assert.equal(stale.data.errors[0].field, 'confirmSlug');

      // A different seller's correct slug cannot delete this seller either.
      const crossed = await remove(target.businessId, { token: admin.token, body: { confirmSlug: seller.slug } });
      assert.equal(crossed.status, 400);

      assert.ok(await Business.exists({ _id: target.businessId }));
      assert.ok(await Business.exists({ _id: seller.businessId }));
      assert.deepEqual(await scopedCounts(target.businessId), before);
      assert.equal(imageStorage.memory.deletedPrefixes.length, deletedPrefixes, 'no files removed');
    });

    it('deletes the seller account, every scoped record and uploaded files, and nothing else', async () => {
      const target = await archivedSeller('delok');
      const before = await scopedCounts(target.businessId);
      assert.ok(Object.values(before).every((count) => count > 0), JSON.stringify(before));
      const sellerBefore = await scopedCounts(seller.businessId);
      const otherBefore = await scopedCounts(other.businessId);
      const prefixStart = imageStorage.memory.deletedPrefixes.length;

      const deleted = await remove(target.businessId, { token: admin.token, body: { confirmSlug: ` ${target.slug} ` } });
      assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
      assert.equal(deleted.data.id, target.businessId);

      assert.equal(await Business.exists({ _id: target.businessId }), null);
      const after = await scopedCounts(target.businessId);
      assert.ok(Object.values(after).every((count) => count === 0), JSON.stringify(after));
      assert.equal(await User.exists({ email: target.email }), null);

      const prefixes = imageStorage.memory.deletedPrefixes.slice(prefixStart).sort();
      assert.deepEqual(prefixes, imageStorage.KINDS.map((kind) => `cove/${kind}/${target.businessId}/`).sort());

      assert.deepEqual(await scopedCounts(seller.businessId), sellerBefore);
      assert.deepEqual(await scopedCounts(other.businessId), otherBefore);

      const login = await api('POST', '/api/auth/login', { body: { email: target.email, password } });
      assert.equal(login.status, 401);
      assert.equal((await api('GET', `/api/store/${target.slug}`)).status, 404);
      assert.equal((await remove(target.businessId, { token: admin.token, body: { confirmSlug: target.slug } })).status, 404);
    });
  });

  it('public registration cannot create an admin', async () => {
    const attempt = await registerTenant('sneaky', { role: 'admin', isPlatformAdmin: true });
    assert.equal(attempt.registered.data.user.isPlatformAdmin, false);
    assert.equal(attempt.registered.data.user.role, 'owner');
    const stored = await User.findOne({ email: attempt.email });
    assert.equal(stored.isPlatformAdmin, false);
    assert.equal(stored.role, 'owner');
    const blocked = await api('GET', '/api/admin/overview', { token: attempt.token });
    assert.equal(blocked.status, 403);
  });

  it('classifies subscription rows into admin account statuses', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    assert.equal(accountStatus(null, now), 'payment_required');
    assert.equal(accountStatus({ status: 'active' }, now), 'active');
    assert.equal(accountStatus({ status: 'trialing', trialEndAt: new Date('2026-01-20') }, now), 'trial');
    assert.equal(accountStatus({ status: 'trialing', trialEndAt: new Date('2026-01-01') }, now), 'payment_required');
    assert.equal(accountStatus({ status: 'past_due' }, now), 'payment_required');
    assert.equal(accountStatus({ status: 'incomplete' }, now), 'payment_required');
    assert.equal(accountStatus({ status: 'halted' }, now), 'restricted');
    assert.equal(accountStatus({ status: 'cancelled' }, now), 'restricted');
  });
});

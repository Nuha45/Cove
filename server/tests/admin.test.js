process.env.RAZORPAY_KEY_ID = 'rzp_test_admin_key';
process.env.RAZORPAY_KEY_SECRET = 'admin_test_secret_value_13579';

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
const SubscriptionReceipt = require('../models/SubscriptionReceipt');
const AdminAction = require('../models/AdminAction');
const imageStorage = require('../services/imageStorage');
const adminService = require('../services/adminService');
const razorpayService = require('../services/razorpayService');
const env = require('../config/env');
const { signToken } = require('../services/tokenService');
const {
  ACCOUNT_STATUSES,
  accountStatus,
  trialPaymentMethod,
  isLiveProviderSubscription,
  isUnfinishedCheckout,
  storeState,
  onlinePaymentReady,
  setupStatus,
} = require('../utils/adminStatus');

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

// Shop names carry a token that appears in no email or slug, so a name search returns only these shops.
const shopToken = `fx${stamp.replace(/[^a-z0-9]/gi, '')}`;

// Created straight in the database (no registration rate limit). Billing rows are set exactly as given.
async function createShop(label, { subscription = null, emailVerified = true, business = {} } = {}) {
  const businessId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const key = label.toLowerCase();
  const created = await Business.create({
    _id: businessId,
    ownerId: userId,
    name: `${label} ${shopToken}`,
    slug: `filter-${key}-${stamp}`,
    category: 'Jewelry & Accessories',
    ...business,
  });
  createdBusinessIds.push(businessId);
  const email = `filter-${key}-${stamp}@example.com`;
  await User.create({ _id: userId, name: `${label} Owner`, email, passwordHash: 'not-a-real-hash', businessId, emailVerified });
  const sub = subscription ? await Subscription.create({ businessId, ...subscription }) : null;
  return { businessId: String(businessId), name: created.name, slug: created.slug, email, subscription: sub };
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
      await SubscriptionReceipt.deleteMany(filter);
      await AdminAction.deleteMany(filter);
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
    assert.equal(typeof totals.archived, 'number');
    assert.deepEqual(Object.keys(totals.statuses).sort(), [...ACCOUNT_STATUSES].sort());
    assert.equal(Object.values(totals.statuses).reduce((sum, count) => sum + count, 0), totals.businesses);
    assert.equal(
      totals.trialPayment.autopay + totals.trialPayment.checkout_started + totals.trialPayment.none,
      totals.statuses.trial
    );
    // The admin's own shop never needs a plan, so it is not counted as a trial or as unpaid.
    assert.ok(totals.statuses.exempt >= 1);
    assert.equal(typeof overview.trialsEndingSoon.count, 'number');
    const { plans } = overview.revenue;
    assert.deepEqual(plans.map((plan) => [plan.name, plan.pricePerMonth]), [['Cove Basic', 599], ['Cove Plus', 899]]);
    assert.equal(plans.reduce((sum, plan) => sum + plan.activeSubscriptions, 0), overview.revenue.activeSubscriptions);
    assert.equal(overview.revenue.activeSubscriptions, totals.statuses.active);
    assert.equal(overview.revenue.cancellingSubscriptions, totals.statuses.cancelling);
    assert.equal(
      overview.revenue.estimatedMrr,
      plans.reduce((sum, plan) => sum + plan.activeSubscriptions * plan.pricePerMonth, 0)
    );
    assert.equal(overview.collected.windowDays, 30);
    assert.ok(Array.isArray(overview.collected.currencies));
    assert.ok(Array.isArray(overview.recentAdminActions));
    assert.ok(Array.isArray(overview.recentSignups));
    assert.ok(overview.recentSignups.length > 0);
    assert.ok(overview.recentSignups.every((item) => item.store?.state && item.subscription?.accountStatus));
    const serialized = JSON.stringify(overview);
    assert.equal(serialized.includes('providerSubscriptionId'), false);
    assert.equal(serialized.includes('providerPaymentId'), false);
    assert.equal(serialized.includes('passwordHash'), false);
  });

  it('shows contact details, store state, setup and seller activity on the business page', async () => {
    const response = await api('GET', `/api/admin/businesses/${seller.businessId}`, { token: admin.token });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    const { business } = response.data;
    assert.equal(business.phone, '9876543210');
    assert.equal(business.owner.emailVerified, true);
    assert.deepEqual(business.store, { state: 'live', label: 'Live' });
    assert.deepEqual(
      [business.setup.emailVerified, business.setup.hasActiveProduct, business.setup.paymentsReady, business.setup.complete],
      [true, true, false, false]
    );
    assert.equal(business.counts.storefrontOrders, 0);
    assert.equal(business.firstStorefrontOrderAt, null);
    // The seller recorded an order after adding products: their own latest action.
    assert.equal(business.lastSellerActivity.type, 'order');
    assert.equal(business.subscription.trialPaymentMethod, 'none');
    assert.equal(business.subscription.liveProviderSubscription, false);
    assert.deepEqual(business.receipts, { items: [], totals: [] });
    assert.deepEqual(business.adminHistory, []);
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

  describe('archive billing guard', () => {
    function archive(businessId) {
      return api('POST', `/api/admin/businesses/${businessId}/archive`, { token: admin.token });
    }

    function setSubscription(businessId, fields) {
      return Subscription.updateOne({ businessId }, { $set: fields });
    }

    // Fake Razorpay: `remote` decides what fetch reports for each subscription id; every call is recorded.
    let razorpayCalls = [];
    let remote = {};
    before(() => {
      razorpayService.setClientForTests({
        subscriptions: {
          fetch: async (id) => {
            razorpayCalls.push(['fetch', id]);
            const answer = remote[id];
            if (answer instanceof Error) throw answer;
            if (answer === undefined) throw Object.assign(new Error('not found'), { statusCode: 400 });
            return { id, status: answer };
          },
          cancel: async (id, atCycleEnd) => {
            razorpayCalls.push(['cancel', id, atCycleEnd]);
            return { id, status: 'cancelled' };
          },
        },
      });
    });
    after(() => razorpayService.resetClientForTests());

    function resetRazorpay(answers = {}) {
      razorpayCalls = [];
      remote = answers;
    }

    it('ends an unfinished checkout at Razorpay, then archives', async () => {
      const target = await registerTenant('archcheckout');
      const trialEndAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const cases = [
        { label: 'still open in Razorpay', remoteStatus: 'created', cancels: true, sub: { status: 'trialing', trialEndAt } },
        { label: 'expired in Razorpay', remoteStatus: 'expired', cancels: false, sub: { status: 'incomplete', trialEndAt: new Date(Date.now() - 86400000) } },
        { label: 'unknown to Razorpay', remoteStatus: undefined, cancels: false, sub: { status: 'incomplete' } },
      ];
      for (const [index, item] of cases.entries()) {
        const providerSubscriptionId = `sub_unfinished_${index}_${stamp}`;
        await setSubscription(target.businessId, {
          providerSubscriptionId,
          lastProviderStatus: 'created',
          cancelAtPeriodEnd: false,
          ...item.sub,
        });
        resetRazorpay({ [providerSubscriptionId]: item.remoteStatus });
        const listed = await api('GET', `/api/admin/businesses/${target.businessId}`, { token: admin.token });
        assert.equal(listed.data.business.subscription.unfinishedCheckout, true, item.label);
        assert.deepEqual(razorpayCalls, [], 'viewing never calls Razorpay');

        const archived = await archive(target.businessId);
        assert.equal(archived.status, 200, `${item.label}: ${JSON.stringify(archived.data)}`);
        assert.ok(archived.data.business.archivedAt, item.label);
        assert.equal(archived.data.business.subscription.liveProviderSubscription, false, item.label);
        assert.deepEqual(
          razorpayCalls,
          item.cancels
            ? [['fetch', providerSubscriptionId], ['cancel', providerSubscriptionId, false]]
            : [['fetch', providerSubscriptionId]],
          item.label
        );
        const sub = await Subscription.findOne({ businessId: target.businessId }).lean();
        assert.equal(sub.providerSubscriptionId, '', item.label);
        assert.equal(sub.lastProviderStatus, 'cancelled', item.label);
        assert.equal(sub.status, item.sub.status === 'trialing' ? 'trialing' : 'incomplete', `${item.label}: trial carries on`);
        assert.equal(sub.plan, 'pro', 'plan untouched');
        await api('POST', `/api/admin/businesses/${target.businessId}/restore`, { token: admin.token });
      }
    });

    it('refuses to archive when Razorpay shows the checkout was completed or cannot be checked', async () => {
      const target = await registerTenant('archprogressed');
      const providerSubscriptionId = `sub_progressed_${stamp}`;
      await setSubscription(target.businessId, {
        providerSubscriptionId,
        status: 'incomplete',
        lastProviderStatus: 'created',
        cancelAtPeriodEnd: false,
      });

      // The seller set up autopay but Cove has not received the webhook yet.
      for (const remoteStatus of ['authenticated', 'active', 'pending', 'halted']) {
        resetRazorpay({ [providerSubscriptionId]: remoteStatus });
        const blocked = await archive(target.businessId);
        assert.equal(blocked.status, 409, remoteStatus);
        assert.match(blocked.data.message, /Cancel the subscription in Razorpay first/, remoteStatus);
        assert.deepEqual(razorpayCalls, [['fetch', providerSubscriptionId]], `${remoteStatus}: never cancelled by Cove`);
      }

      // Razorpay unreachable: nothing changes and the admin is told to retry.
      resetRazorpay({ [providerSubscriptionId]: Object.assign(new Error('gateway down'), { statusCode: 503 }) });
      const unreachable = await archive(target.businessId);
      assert.equal(unreachable.status, 502);
      assert.match(unreachable.data.message, /could not reach Razorpay/i);

      assert.equal((await Business.findById(target.businessId)).archivedAt, null);
      const sub = await Subscription.findOne({ businessId: target.businessId }).lean();
      assert.equal(sub.providerSubscriptionId, providerSubscriptionId);
      assert.equal(sub.lastProviderStatus, 'created');
      assert.equal(await AdminAction.countDocuments({ businessId: target.businessId }), 0);
    });

    it('rolls back an archive when the seller starts paying at the same moment', async () => {
      const target = await registerTenant('archrace');
      resetRazorpay();
      const realUpdate = Business.findOneAndUpdate;
      Business.findOneAndUpdate = function raced(...args) {
        Business.findOneAndUpdate = realUpdate;
        return Subscription.updateOne(
          { businessId: target.businessId },
          { $set: { providerSubscriptionId: `sub_race_${stamp}`, status: 'trialing', lastProviderStatus: 'authenticated' } }
        ).then(() => realUpdate.apply(this, args));
      };
      try {
        const blocked = await archive(target.businessId);
        assert.equal(blocked.status, 409, JSON.stringify(blocked.data));
      } finally {
        Business.findOneAndUpdate = realUpdate;
      }
      assert.equal((await Business.findById(target.businessId)).archivedAt, null);
      assert.equal(await AdminAction.countDocuments({ businessId: target.businessId }), 0);
      assert.equal((await api('GET', '/api/auth/me', { token: target.token })).status, 200, 'owner still signed in');
    });

    it('lets an already-archived shop with an unfinished checkout be deleted', async () => {
      const target = await registerTenant('delcheckout');
      const providerSubscriptionId = `sub_delcheckout_${stamp}`;
      await Business.updateOne({ _id: target.businessId }, { $set: { archivedAt: new Date() } });
      await setSubscription(target.businessId, { providerSubscriptionId, status: 'incomplete', lastProviderStatus: 'created' });
      resetRazorpay({ [providerSubscriptionId]: 'created' });
      const deleted = await api('DELETE', `/api/admin/businesses/${target.businessId}`, {
        token: admin.token,
        body: { confirmSlug: target.slug },
      });
      assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
      assert.deepEqual(razorpayCalls, [['fetch', providerSubscriptionId], ['cancel', providerSubscriptionId, false]]);
      assert.equal(await Business.exists({ _id: target.businessId }), null);
    });

    it('refuses to archive while a Razorpay subscription can still charge, and leaves the seller signed in', async () => {
      const target = await registerTenant('archlive');
      resetRazorpay();
      const tokenVersion = (await User.findById(target.user._id)).tokenVersion;
      const providerSubscriptionId = `sub_archlive_${stamp}`;
      const trialEndAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const periodEnd = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

      // Every status Cove keeps while a provider subscription that can charge is attached and not yet cancelled.
      // (Unfinished checkouts are covered separately: archive ends them at Razorpay instead.)
      const liveStates = [
        { status: 'trialing', trialEndAt, lastProviderStatus: 'authenticated' },
        { status: 'incomplete', lastProviderStatus: 'authenticated' },
        { status: 'active', lastProviderStatus: 'active', currentPeriodEndAt: periodEnd },
        { status: 'past_due', lastProviderStatus: 'pending', pastDueSince: new Date() },
        { status: 'halted', lastProviderStatus: 'halted' },
      ];
      for (const state of liveStates) {
        await setSubscription(target.businessId, {
          providerSubscriptionId,
          cancelAtPeriodEnd: false,
          pastDueSince: null,
          ...state,
        });
        const blocked = await archive(target.businessId);
        const label = JSON.stringify(state);
        assert.equal(blocked.status, 409, label);
        assert.match(blocked.data.message, /Razorpay subscription/, label);
        assert.match(blocked.data.message, /Cancel the subscription in Razorpay first/, label);
        assert.equal((await Business.findById(target.businessId)).archivedAt, null, label);
      }
      assert.equal(razorpayCalls.length, 0, 'a subscription that can charge is never touched at Razorpay');

      // Set to cancel at period end: no further charge, but the seller has paid time left.
      await setSubscription(target.businessId, {
        providerSubscriptionId,
        status: 'active',
        lastProviderStatus: 'active',
        currentPeriodEndAt: periodEnd,
        cancelAtPeriodEnd: true,
      });
      const cancelling = await archive(target.businessId);
      assert.equal(cancelling.status, 409);
      assert.match(cancelling.data.message, /set to cancel then, so Razorpay will not charge again/);
      assert.match(cancelling.data.message, /lock the seller out of time they paid for/);
      assert.equal((await Business.findById(target.businessId)).archivedAt, null);
      await setSubscription(target.businessId, { status: 'halted', lastProviderStatus: 'halted', cancelAtPeriodEnd: false });

      assert.equal((await User.findById(target.user._id)).tokenVersion, tokenVersion);
      assert.equal((await api('GET', '/api/auth/me', { token: target.token })).status, 200);
      assert.equal((await api('GET', `/api/store/${target.slug}`)).status, 200);
      const login = await api('POST', '/api/auth/login', { body: { email: target.email, password } });
      assert.equal(login.status, 200, JSON.stringify(login.data));
      const subscription = await Subscription.findOne({ businessId: target.businessId }).lean();
      assert.equal(subscription.providerSubscriptionId, providerSubscriptionId);
      assert.equal(subscription.status, 'halted');

      // Once Razorpay reports the subscription cancelled, archiving goes ahead as before.
      await setSubscription(target.businessId, { status: 'cancelled', lastProviderStatus: 'cancelled', cancelledAt: new Date() });
      const archived = await archive(target.businessId);
      assert.equal(archived.status, 200, JSON.stringify(archived.data));
      assert.ok(archived.data.business.archivedAt);
      assert.equal((await api('GET', '/api/auth/me', { token: target.token })).status, 401);
    });

    it('archives shops with no Razorpay subscription attached', async () => {
      const target = await registerTenant('archnone');
      const before = await Subscription.findOne({ businessId: target.businessId }).lean();
      assert.equal(before.providerSubscriptionId || '', '');
      assert.equal(before.status, 'trialing');

      const trialOnly = await archive(target.businessId);
      assert.equal(trialOnly.status, 200, JSON.stringify(trialOnly.data));
      assert.ok(trialOnly.data.business.archivedAt);
      const restored = await api('POST', `/api/admin/businesses/${target.businessId}/restore`, { token: admin.token });
      assert.equal(restored.status, 200);

      // A checkout the seller cancelled before any charge is detached from Razorpay entirely.
      await setSubscription(target.businessId, {
        status: 'incomplete',
        providerSubscriptionId: '',
        lastProviderStatus: 'cancelled',
        cancelledAt: new Date(),
      });
      const detached = await archive(target.businessId);
      assert.equal(detached.status, 200, JSON.stringify(detached.data));
      assert.ok(detached.data.business.archivedAt);

      // No billing row at all.
      await api('POST', `/api/admin/businesses/${target.businessId}/restore`, { token: admin.token });
      await Subscription.deleteOne({ businessId: target.businessId });
      const noRow = await archive(target.businessId);
      assert.equal(noRow.status, 200, JSON.stringify(noRow.data));
      assert.ok(noRow.data.business.archivedAt);
    });
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

  describe('statuses, filters and collected payments', () => {
    const DAY = 24 * 60 * 60 * 1000;
    let shops;

    async function list(filter) {
      const params = new URLSearchParams({ search: shopToken, limit: '50' });
      if (filter) params.set('filter', filter);
      const response = await api('GET', `/api/admin/businesses?${params}`, { token: admin.token });
      assert.equal(response.status, 200, JSON.stringify(response.data));
      return response.data;
    }

    function names(result) {
      return result.businesses.map((item) => item.name.split(' ')[0]).sort();
    }

    before(async () => {
      const now = Date.now();
      const trialStartAt = new Date(now - 4 * DAY);
      const trialEndAt = new Date(now + 3 * DAY);
      const paidPeriod = { currentPeriodStartAt: new Date(now - 5 * DAY), currentPeriodEndAt: new Date(now + 25 * DAY) };
      shops = {
        Autopay: await createShop('Autopay', {
          subscription: {
            status: 'trialing', trialUsed: true, trialStartAt, trialEndAt,
            providerSubscriptionId: `sub_fauto_${stamp}`, lastProviderStatus: 'authenticated',
          },
        }),
        Nocard: await createShop('Nocard', { subscription: { status: 'trialing', trialUsed: true, trialStartAt, trialEndAt } }),
        Ended: await createShop('Ended', {
          subscription: { status: 'trialing', trialUsed: true, trialStartAt: new Date(now - 10 * DAY), trialEndAt: new Date(now - 3 * DAY) },
        }),
        Paying: await createShop('Paying', {
          subscription: {
            status: 'active', plan: 'advanced', providerSubscriptionId: `sub_fpay_${stamp}`, lastProviderStatus: 'active', ...paidPeriod,
          },
          business: { paymentInstructionsEnabled: true, paymentInstructions: 'Bank transfer to the shop account.' },
        }),
        Cancelling: await createShop('Cancelling', {
          subscription: {
            status: 'active', providerSubscriptionId: `sub_fcan_${stamp}`, lastProviderStatus: 'active', cancelAtPeriodEnd: true, ...paidPeriod,
          },
        }),
        Pastdue: await createShop('Pastdue', {
          subscription: {
            status: 'past_due', providerSubscriptionId: `sub_fdue_${stamp}`, lastProviderStatus: 'pending',
            pastDueSince: new Date(now - 2 * DAY), ...paidPeriod,
          },
        }),
        Halted: await createShop('Halted', {
          subscription: { status: 'halted', providerSubscriptionId: `sub_fhalt_${stamp}`, lastProviderStatus: 'halted', ...paidPeriod },
        }),
        Cancelled: await createShop('Cancelled', {
          subscription: { status: 'cancelled', cancelledAt: new Date(now - DAY), ...paidPeriod },
        }),
        Unverified: await createShop('Unverified', {
          emailVerified: false,
          subscription: { status: 'trialing', trialUsed: true, trialStartAt, trialEndAt },
        }),
      };

      const paying = new mongoose.Types.ObjectId(shops.Paying.businessId);
      await Product.collection.insertOne({ businessId: paying, name: 'Paying Ring', status: 'Active', createdAt: new Date(now - 6 * DAY) });
      await Order.collection.insertMany([
        {
          businessId: paying,
          orderNumber: `FS-${stamp}`,
          confirmationTokenHash: `storefront-${stamp}`,
          createdAt: new Date(now - DAY),
          paymentEvents: [],
        },
        {
          businessId: paying,
          orderNumber: `FM-${stamp}`,
          createdAt: new Date(now - 3 * DAY),
          paymentEvents: [
            { at: new Date(now - 60 * 60 * 1000), fromStatus: 'Payment Pending', toStatus: 'Paid', actorType: 'seller' },
            { at: new Date(now - 30 * 60 * 1000), fromStatus: 'Paid', toStatus: 'Paid', actorType: 'customer' },
          ],
        },
      ]);
      await SubscriptionReceipt.create({
        businessId: paying,
        subscriptionId: shops.Paying.subscription._id,
        providerSubscriptionId: `sub_fpay_${stamp}`,
        providerPaymentId: `pay_fpay_${stamp}`,
        receiptNumber: `CR-T${stamp}`,
        plan: 'advanced',
        amountPaise: 89900,
        currency: 'INR',
        paidAt: new Date(now - 5 * DAY),
        periodStartAt: new Date(now - 5 * DAY),
        periodEndAt: new Date(now + 25 * DAY),
      });
    });

    it('filters businesses by account status, trial autopay, verification and setup', async () => {
      const everyone = Object.keys(shops).sort();
      assert.deepEqual(names(await list()), everyone);
      const expected = {
        trial_no_autopay: ['Nocard', 'Unverified'],
        trial_ended: ['Ended'],
        active: ['Paying'],
        cancelling: ['Cancelling'],
        past_due: ['Pastdue'],
        halted: ['Halted'],
        cancelled: ['Cancelled'],
        email_unverified: ['Unverified'],
        needs_setup: everyone.filter((name) => name !== 'Paying'),
        exempt: [],
        archived: [],
      };
      for (const [filter, shopNames] of Object.entries(expected)) {
        const result = await list(filter);
        assert.equal(result.filter, filter);
        assert.deepEqual(names(result), shopNames, filter);
        assert.equal(result.total, shopNames.length, filter);
      }
      const bogus = await list('{"$ne":null}');
      assert.equal(bogus.filter, 'all');
      assert.deepEqual(names(bogus), everyone);
    });

    it('shows accurate statuses, trial autopay, store state, setup and seller activity on each row', async () => {
      const result = await list();
      const row = Object.fromEntries(result.businesses.map((item) => [item.name.split(' ')[0], item]));

      assert.equal(row.Autopay.subscription.accountStatus, 'trial');
      assert.equal(row.Autopay.subscription.trialPaymentMethod, 'autopay');
      assert.equal(row.Autopay.subscription.liveProviderSubscription, true);
      assert.equal(row.Nocard.subscription.trialPaymentMethod, 'none');
      assert.equal(row.Nocard.subscription.liveProviderSubscription, false);
      assert.equal(row.Ended.subscription.accountStatus, 'trial_ended');
      assert.equal(row.Ended.subscription.trialPaymentMethod, null);
      assert.equal(row.Cancelling.subscription.accountStatus, 'cancelling');
      assert.equal(row.Pastdue.subscription.accountStatus, 'past_due');
      assert.equal(row.Halted.subscription.accountStatus, 'halted');
      assert.equal(row.Cancelled.subscription.accountStatus, 'cancelled');

      assert.deepEqual(row.Unverified.store, { state: 'closed_unverified', label: 'Closed: email not verified' });
      assert.equal(row.Unverified.owner.emailVerified, false);
      assert.equal(row.Unverified.setup.emailVerified, false);
      assert.equal(row.Nocard.store.state, 'live');

      const paying = row.Paying;
      assert.equal(paying.subscription.accountStatus, 'active');
      assert.equal(paying.subscription.accountStatusLabel, 'Paying');
      assert.equal(paying.setup.complete, true);
      assert.deepEqual(paying.counts, { products: 1, activeProducts: 1, orders: 2, storefrontOrders: 1 });
      assert.ok(paying.firstStorefrontOrderAt);
      // The seller verified a payment after the customer orders and product; customer events never count.
      assert.equal(paying.lastSellerActivity.type, 'payment');
      assert.equal(row.Nocard.lastSellerActivity, null);

      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes('providerSubscriptionId'), false);
      assert.equal(serialized.includes(`sub_f`), false);
      assert.equal(serialized.includes('paymentInstructions'), false);
    });

    it('reports collected payments from receipts separately from the estimated MRR', async () => {
      const overview = (await api('GET', '/api/admin/overview', { token: admin.token })).data.overview;
      const recorded = await SubscriptionReceipt.aggregate([
        { $match: { currency: 'INR' } },
        { $group: { _id: null, total: { $sum: '$amountPaise' }, count: { $sum: 1 } } },
      ]);
      const inr = overview.collected.currencies.find((row) => row.currency === 'INR');
      assert.equal(inr.totalPaise, recorded[0].total);
      assert.equal(inr.payments, recorded[0].count);
      assert.ok(inr.windowPaise >= 89900);
      assert.ok(inr.windowPayments >= 1);

      // A subscription set to cancel is not counted in the estimate.
      assert.ok(overview.totals.statuses.cancelling >= 1);
      const advanced = overview.revenue.plans.find((plan) => plan.key === 'advanced');
      assert.ok(advanced.activeSubscriptions >= 1);
      assert.equal(
        overview.revenue.plans.reduce((sum, plan) => sum + plan.activeSubscriptions, 0),
        overview.totals.statuses.active
      );

      const soon = overview.trialsEndingSoon.items;
      assert.equal(soon.find((item) => item.id === shops.Autopay.businessId)?.paymentMethod, 'autopay');
      assert.equal(soon.find((item) => item.id === shops.Nocard.businessId)?.paymentMethod, 'none');
      assert.ok(overview.trialsEndingSoon.withoutAutopay >= 1);

      const detail = await api('GET', `/api/admin/businesses/${shops.Paying.businessId}`, { token: admin.token });
      assert.equal(detail.status, 200);
      const { receipts } = detail.data.business;
      assert.deepEqual(receipts.totals, [{ currency: 'INR', totalPaise: 89900, payments: 1 }]);
      assert.equal(receipts.items.length, 1);
      assert.equal(receipts.items[0].receiptNumber, `CR-T${stamp}`);
      assert.equal(receipts.items[0].planName, 'Cove Plus');
      assert.equal(receipts.items[0].amountPaise, 89900);
      const serialized = JSON.stringify(detail.data);
      assert.equal(serialized.includes(`pay_fpay_${stamp}`), false);
      assert.equal(serialized.includes(`sub_fpay_${stamp}`), false);
    });

    it('records every archive, restore, delete and admin-access change permanently', async () => {
      const shop = await createShop('Audit', {
        subscription: { status: 'trialing', trialUsed: true, trialStartAt: new Date(), trialEndAt: new Date(Date.now() + 7 * DAY) },
      });
      const path = `/api/admin/businesses/${shop.businessId}`;

      // An audited action always needs a known admin; refused or no-op requests leave no entry.
      for (const call of [
        () => adminService.archiveBusiness(shop.businessId, null),
        () => adminService.restoreBusiness(shop.businessId, undefined),
        () => adminService.deleteBusiness(shop.businessId, null, { confirmSlug: shop.slug }),
        () => adminService.setOwnerPlatformAdmin(shop.businessId, null, { grant: true, confirmEmail: shop.email }),
      ]) {
        await assert.rejects(call(), { statusCode: 401 });
      }
      assert.equal((await Business.findById(shop.businessId)).archivedAt, null);
      assert.equal((await api('POST', `/api/admin/businesses/${shops.Paying.businessId}/archive`, { token: admin.token })).status, 409);
      assert.equal(await AdminAction.countDocuments({ businessId: shops.Paying.businessId }), 0);
      assert.equal((await api('POST', `${path}/archive`, { token: seller.token })).status, 403);

      const grant = await api('POST', `${path}/platform-admin`, { token: admin.token, body: { grant: true, confirmEmail: shop.email } });
      assert.equal(grant.status, 200, JSON.stringify(grant.data));
      const exempt = await list('exempt');
      assert.deepEqual(names(exempt), ['Audit']);
      const revoke = await api('POST', `${path}/platform-admin`, { token: admin.token, body: { grant: false, confirmEmail: shop.email } });
      assert.equal(revoke.status, 200, JSON.stringify(revoke.data));
      await api('POST', `${path}/platform-admin`, { token: admin.token, body: { grant: false, confirmEmail: shop.email } });

      assert.equal((await api('POST', `${path}/archive`, { token: admin.token })).status, 200);
      assert.equal((await api('POST', `${path}/archive`, { token: admin.token })).status, 200);
      assert.equal((await api('POST', `${path}/restore`, { token: admin.token })).status, 200);
      const archived = await api('POST', `${path}/archive`, { token: admin.token });
      assert.equal(archived.status, 200);
      assert.deepEqual(
        archived.data.business.adminHistory.map((entry) => entry.action),
        ['archive', 'restore', 'archive', 'revoke_admin', 'grant_admin']
      );
      assert.equal(archived.data.business.adminHistory[3].targetEmail, shop.email);

      const deleted = await api('DELETE', path, { token: admin.token, body: { confirmSlug: shop.slug } });
      assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
      assert.equal(await Business.exists({ _id: shop.businessId }), null);

      const entries = await AdminAction.find({ businessId: shop.businessId }).sort({ createdAt: 1, _id: 1 }).lean();
      assert.deepEqual(entries.map((entry) => entry.action), ['grant_admin', 'revoke_admin', 'archive', 'restore', 'archive', 'delete']);
      for (const entry of entries) {
        assert.equal(String(entry.adminUserId), String(admin.user._id));
        assert.equal(entry.adminEmail, admin.email);
        assert.equal(entry.businessName, shop.name);
        assert.equal(entry.businessSlug, shop.slug);
      }
      assert.equal(entries[0].targetEmail, shop.email);
      assert.equal(entries[2].targetEmail, '');
      assert.equal(entries[5].summary, 'Deleted 0 products, 0 orders and 0 customers.');

      const overview = (await api('GET', '/api/admin/overview', { token: admin.token })).data.overview;
      const latestDelete = overview.recentAdminActions.find((entry) => entry.businessId === shop.businessId);
      assert.equal(latestDelete.action, 'delete');
      assert.equal(latestDelete.label, 'Deleted seller account');
      assert.equal(latestDelete.businessName, shop.name);
      assert.equal(latestDelete.businessExists, false);
    });

    it('never leaves a change without its audit entry, and records concurrent archives once', async () => {
      const shop = await createShop('Atomic', {
        subscription: { status: 'trialing', trialUsed: true, trialStartAt: new Date(), trialEndAt: new Date(Date.now() + 7 * DAY) },
      });
      const path = `/api/admin/businesses/${shop.businessId}`;
      const userId = (await User.findOne({ businessId: shop.businessId }).lean())._id;
      const tokenVersion = (await User.findById(userId)).tokenVersion;
      await Product.collection.insertOne({ businessId: new mongoose.Types.ObjectId(shop.businessId), name: 'Atomic Ring', status: 'Active' });

      const realCreate = AdminAction.create;
      AdminAction.create = async () => { throw new Error('simulated audit write failure'); };
      try {
        assert.equal((await api('POST', `${path}/archive`, { token: admin.token })).status, 500);
        assert.equal((await Business.findById(shop.businessId)).archivedAt, null, 'archive rolled back');
        assert.equal((await User.findById(userId)).tokenVersion, tokenVersion, 'owner not signed out');

        const grant = await api('POST', `${path}/platform-admin`, { token: admin.token, body: { grant: true, confirmEmail: shop.email } });
        assert.equal(grant.status, 500);
        assert.equal((await User.findById(userId)).isPlatformAdmin, false, 'admin grant rolled back');

        await Business.updateOne({ _id: shop.businessId }, { $set: { archivedAt: new Date() } });
        assert.equal((await api('POST', `${path}/restore`, { token: admin.token })).status, 500);
        assert.ok((await Business.findById(shop.businessId)).archivedAt, 'restore rolled back');

        const deleted = await api('DELETE', path, { token: admin.token, body: { confirmSlug: shop.slug } });
        assert.equal(deleted.status, 500);
        assert.ok(await Business.exists({ _id: shop.businessId }), 'delete rolled back');
        assert.ok(await User.exists({ _id: userId }));
        assert.equal(await Product.countDocuments({ businessId: shop.businessId }), 1);
        assert.ok(await Subscription.exists({ businessId: shop.businessId }));
      } finally {
        AdminAction.create = realCreate;
      }
      assert.equal(await AdminAction.countDocuments({ businessId: shop.businessId }), 0);

      // Two admins archiving at the same moment: one change, one entry.
      await Business.updateOne({ _id: shop.businessId }, { $set: { archivedAt: null } });
      const results = await Promise.all([1, 2, 3].map(() => api('POST', `${path}/archive`, { token: admin.token })));
      assert.deepEqual(results.map((result) => result.status), [200, 200, 200]);
      assert.equal(await AdminAction.countDocuments({ businessId: shop.businessId, action: 'archive' }), 1);
      assert.equal((await User.findById(userId)).tokenVersion, tokenVersion + 1);
    });

    it('shows stores closed for billing when billing is enforced', async () => {
      const previous = env.enforceBilling;
      env.enforceBilling = true;
      try {
        const row = Object.fromEntries((await list()).businesses.map((item) => [item.name.split(' ')[0], item]));
        assert.deepEqual(row.Ended.store, { state: 'closed_billing', label: 'Closed: no active plan' });
        assert.equal(row.Halted.store.state, 'closed_billing');
        assert.equal(row.Paying.store.state, 'live');
        assert.equal(row.Nocard.store.state, 'live');
        assert.equal(row.Unverified.store.state, 'closed_unverified');
        const overview = (await api('GET', '/api/admin/overview', { token: admin.token })).data.overview;
        assert.ok(overview.totals.closedStores.closed_billing >= 2);
      } finally {
        env.enforceBilling = previous;
      }
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
    const future = new Date('2026-01-20T00:00:00Z');
    const past = new Date('2026-01-01T00:00:00Z');
    assert.equal(accountStatus(null, now), 'payment_required');
    assert.equal(accountStatus({ status: 'active' }, now), 'active');
    assert.equal(accountStatus({ status: 'active', cancelAtPeriodEnd: true, currentPeriodEndAt: future }, now), 'cancelling');
    // The paid period is over even if Razorpay's final webhook has not arrived.
    assert.equal(accountStatus({ status: 'active', cancelAtPeriodEnd: true, currentPeriodEndAt: past }, now), 'cancelled');
    assert.equal(accountStatus({ status: 'trialing', trialEndAt: future }, now), 'trial');
    assert.equal(accountStatus({
      status: 'trialing',
      trialEndAt: new Date('2026-01-09T12:00:00Z'),
      providerSubscriptionId: 'sub_x',
      lastProviderStatus: 'authenticated',
    }, now), 'trial', 'first charge in flight');
    assert.equal(accountStatus({ status: 'trialing', trialEndAt: past }, now), 'trial_ended');
    assert.equal(accountStatus({ status: 'incomplete', trialEndAt: past }, now), 'trial_ended');
    assert.equal(accountStatus({ status: 'incomplete', trialEndAt: past, currentPeriodEndAt: past }, now), 'payment_required');
    assert.equal(accountStatus({ status: 'incomplete' }, now), 'payment_required');
    assert.equal(accountStatus({ status: 'past_due', pastDueSince: past }, now), 'past_due');
    assert.equal(accountStatus({ status: 'halted' }, now), 'halted');
    assert.equal(accountStatus({ status: 'cancelled' }, now), 'cancelled');

    assert.equal(accountStatus(null, now, { exempt: true }), 'exempt');
    assert.equal(accountStatus({ status: 'trialing', trialEndAt: past }, now, { exempt: true }), 'exempt');
    assert.equal(accountStatus({ status: 'cancelled' }, now, { exempt: true }), 'exempt');
    assert.equal(accountStatus({ status: 'active' }, now, { exempt: true }), 'active', 'a real paid plan still shows');
    assert.equal(accountStatus({ status: 'past_due' }, now, { exempt: true }), 'past_due');
  });

  it('derives trial payment method, store state, live subscriptions and setup from stored data', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const running = { status: 'trialing', trialEndAt: new Date('2026-01-15T00:00:00Z') };

    assert.equal(trialPaymentMethod(null), null);
    assert.equal(trialPaymentMethod({ status: 'active', providerSubscriptionId: 'sub_x' }), null);
    assert.equal(trialPaymentMethod(running), 'none');
    assert.equal(trialPaymentMethod({ ...running, providerSubscriptionId: 'sub_x', lastProviderStatus: 'created' }), 'checkout_started');
    assert.equal(trialPaymentMethod({ ...running, providerSubscriptionId: 'sub_x', lastProviderStatus: 'authenticated' }), 'autopay');

    assert.equal(isLiveProviderSubscription(null), false);
    assert.equal(isLiveProviderSubscription({ status: 'active', providerSubscriptionId: '' }), false);
    assert.equal(isLiveProviderSubscription({ status: 'cancelled', providerSubscriptionId: 'sub_x' }), false);
    for (const status of ['trialing', 'incomplete', 'active', 'past_due', 'halted']) {
      assert.equal(isLiveProviderSubscription({ status, providerSubscriptionId: 'sub_x' }), true, status);
    }

    assert.equal(isUnfinishedCheckout(null), false);
    assert.equal(isUnfinishedCheckout({ status: 'trialing', providerSubscriptionId: '' }), false);
    assert.equal(isUnfinishedCheckout({ status: 'trialing', providerSubscriptionId: 'sub_x', lastProviderStatus: 'created' }), true);
    assert.equal(isUnfinishedCheckout({ status: 'incomplete', providerSubscriptionId: 'sub_x', lastProviderStatus: 'created' }), true);
    assert.equal(isUnfinishedCheckout({ status: 'trialing', providerSubscriptionId: 'sub_x', lastProviderStatus: 'authenticated' }), false);
    assert.equal(isUnfinishedCheckout({ status: 'incomplete', providerSubscriptionId: 'sub_x', lastProviderStatus: 'authenticated' }), false);
    for (const status of ['active', 'past_due', 'halted', 'cancelled']) {
      assert.equal(isUnfinishedCheckout({ status, providerSubscriptionId: 'sub_x', lastProviderStatus: 'created' }), false, status);
    }

    const lapsed = { status: 'trialing', trialEndAt: new Date('2026-01-01T00:00:00Z') };
    const base = { now, enforceBilling: true, subscription: running };
    assert.equal(storeState(base), 'live');
    assert.equal(storeState({ ...base, storefrontActive: false }), 'off');
    assert.equal(storeState({ ...base, subscription: lapsed }), 'closed_billing');
    assert.equal(storeState({ ...base, subscription: lapsed, enforceBilling: false }), 'live');
    assert.equal(storeState({ ...base, subscription: lapsed, exempt: true }), 'live');
    assert.equal(storeState({ ...base, subscription: null }), 'closed_billing');
    assert.equal(storeState({ ...base, subscription: lapsed, ownerUnverified: true }), 'closed_unverified');
    assert.equal(storeState({ ...base, ownerUnverified: true, archived: true }), 'archived');
    // Past due keeps the store open only through the grace period.
    assert.equal(storeState({ ...base, subscription: { status: 'past_due', pastDueSince: new Date('2026-01-08T00:00:00Z') } }), 'live');
    assert.equal(storeState({ ...base, subscription: { status: 'past_due', pastDueSince: new Date('2025-12-20T00:00:00Z') } }), 'closed_billing');

    assert.equal(onlinePaymentReady(null), false);
    assert.equal(onlinePaymentReady({ payOnPickupEnabled: true, cashOnDeliveryEnabled: true }), false);
    assert.equal(onlinePaymentReady({ paymentQrEnabled: true }), false);
    assert.equal(onlinePaymentReady({ paymentQrEnabled: true, paymentUpiId: 'shop@okaxis' }), true);
    assert.equal(onlinePaymentReady({ paymentQrEnabled: true, paymentQrImage: 'https://example.com/qr.png' }), true);
    assert.equal(onlinePaymentReady({ paymentQrEnabled: false, paymentUpiId: 'shop@okaxis' }), false);
    assert.equal(onlinePaymentReady({ paymentLinkEnabled: true, paymentLink: '' }), false);
    assert.equal(onlinePaymentReady({ paymentLinkEnabled: true, paymentLink: 'https://rzp.io/l/shop' }), true);
    assert.equal(onlinePaymentReady({ paymentInstructionsEnabled: true, paymentInstructions: '   ' }), false);
    assert.equal(onlinePaymentReady({ paymentInstructionsEnabled: true, paymentInstructions: 'Bank transfer' }), true);

    assert.deepEqual(setupStatus({ emailVerified: true, activeProducts: 2, paymentsReady: true }), {
      emailVerified: true, hasActiveProduct: true, paymentsReady: true, done: 3, total: 3, complete: true,
    });
    assert.deepEqual(setupStatus({ emailVerified: false, activeProducts: 0, paymentsReady: false }), {
      emailVerified: false, hasActiveProduct: false, paymentsReady: false, done: 0, total: 3, complete: false,
    });
  });
});

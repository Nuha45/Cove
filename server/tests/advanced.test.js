const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { connectTestDB } = require('./_testDb');
const env = require('../config/env');
const app = require('../app');
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const OrderCounter = require('../models/OrderCounter');
const Business = require('../models/Business');
const Subscription = require('../models/Subscription');
const StoreEvent = require('../models/StoreEvent');
const Invoice = require('../models/Invoice');
const EmailDelivery = require('../models/EmailDelivery');
const Notification = require('../models/Notification');
const Customer = require('../models/Customer');
const emailService = require('../services/emailService');
const notifyEvents = require('../services/notifyEvents');
const weeklyReportService = require('../services/weeklyReportService');
const { signToken } = require('../services/tokenService');
const { resolveRange } = require('../utils/dateRange');
const { csvCell } = require('../utils/csv');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'AdvancedTest1';
const createdBusinessIds = [];

let server;
let base;

function uniqueEmail(label) {
  return `advanced-${label}-${stamp}@example.com`;
}

function visitorId(label) {
  return `v-${label}-${stamp}`.replace(/[^A-Za-z0-9-]/g, '').slice(0, 64).padEnd(16, '0');
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
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/pdf') || contentType.includes('text/csv')) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return { status: response.status, contentType, buffer, headers: response.headers };
  }
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { status: response.status, data, contentType, headers: response.headers };
}

async function registerTenant(label) {
  const email = uniqueEmail(label);
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password,
      businessName: `${label} Advanced ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { new: true });
  const business = await Business.findById(user.businessId);
  createdBusinessIds.push(user.businessId);
  return { email, token: signToken(user), businessId: user.businessId, slug: business.slug };
}

async function setPlan(businessId, { plan, status, trialEndAt }) {
  await Subscription.updateOne(
    { businessId },
    { $set: { plan, status, ...(trialEndAt !== undefined ? { trialEndAt } : {}) } }
  );
}

async function addProduct(token, input) {
  const response = await api('POST', '/api/products', { token, body: input });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data.product;
}

async function placeStoreOrder(slug, productId, { quantity = 1, email = '' } = {}) {
  const response = await api('POST', `/api/store/${slug}/orders`, {
    body: {
      customer: { name: 'Riya Menon', phone: '9876512345', ...(email ? { email } : {}) },
      items: [{ productId, quantity }],
      deliveryMethod: 'Pickup',
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data;
}

async function waitFor(check, { timeout = 4000, interval = 50 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    // eslint-disable-next-line no-await-in-loop
    const value = await check();
    if (value) return value;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return check();
}

describe('cove advanced', { timeout: 240000 }, () => {
  let owner;
  let other;
  let basic;

  before(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    owner = await registerTenant('owner');
    other = await registerTenant('other');
    basic = await registerTenant('basic');
    await setPlan(basic.businessId, { plan: 'pro', status: 'active', trialEndAt: new Date(Date.now() - 86400000) });
  });

  after(async () => {
    if (createdBusinessIds.length) {
      const ids = { $in: createdBusinessIds };
      await Promise.all([
        StoreEvent.deleteMany({ businessId: ids }),
        Invoice.deleteMany({ businessId: ids }),
        EmailDelivery.deleteMany({ businessId: ids }),
        Notification.deleteMany({ businessId: ids }),
        Order.deleteMany({ businessId: ids }),
        Customer.deleteMany({ businessId: ids }),
        Product.deleteMany({ businessId: ids }),
        OrderCounter.deleteMany({ businessId: ids }),
        Subscription.deleteMany({ businessId: ids }),
      ]);
      await User.deleteMany({ businessId: ids });
      await Business.deleteMany({ _id: ids });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  describe('plan access', () => {
    it('exposes both plans and grants Advanced during a running trial', async () => {
      const billing = await api('GET', '/api/billing', { token: owner.token });
      assert.equal(billing.status, 200, JSON.stringify(billing.data));
      const keys = billing.data.plans.map((plan) => plan.key);
      assert.deepEqual(keys, ['pro', 'advanced']);
      const advanced = billing.data.plans.find((plan) => plan.key === 'advanced');
      assert.equal(advanced.amount, 899);
      assert.equal(billing.data.plan.amount, 599);
      assert.equal(billing.data.entitlements.advanced, true);
      assert.equal(billing.data.entitlements.inTrial, true);

      const perf = await api('GET', '/api/analytics/performance?range=7d', { token: owner.token });
      assert.equal(perf.status, 200, JSON.stringify(perf.data));
    });

    it('blocks Advanced endpoints for Pro subscribers and expired trials', async () => {
      for (const path of [
        '/api/analytics/performance',
        '/api/analytics/products',
        '/api/analytics/insights',
        '/api/analytics/sales-report',
        '/api/invoices',
        '/api/products/inventory',
      ]) {
        // eslint-disable-next-line no-await-in-loop
        const res = await api('GET', path, { token: basic.token });
        assert.equal(res.status, 403, path);
        assert.equal(res.data.errors[0].message, 'advanced_required', path);
      }
      const bulk = await api('POST', '/api/products/bulk', {
        token: basic.token,
        body: { ids: [new mongoose.Types.ObjectId().toString()], action: 'archive' },
      });
      assert.equal(bulk.status, 403);

      const billing = await api('GET', '/api/billing', { token: basic.token });
      assert.equal(billing.data.entitlements.advanced, false);
      assert.equal(billing.data.subscription.plan, 'pro');

      // The basic analytics overview stays available to every plan.
      const overview = await api('GET', '/api/analytics', { token: basic.token });
      assert.equal(overview.status, 200);
    });

    it('grants Advanced to active Advanced subscribers after the trial', async () => {
      const temp = await registerTenant('paid');
      await setPlan(temp.businessId, { plan: 'advanced', status: 'active', trialEndAt: new Date(Date.now() - 86400000) });
      const res = await api('GET', '/api/analytics/performance', { token: temp.token });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      await setPlan(temp.businessId, { plan: 'advanced', status: 'cancelled' });
      const blocked = await api('GET', '/api/analytics/performance', { token: temp.token });
      assert.equal(blocked.status, 403);
    });

    it('rejects Advanced-only settings for non-Advanced shops', async () => {
      const res = await api('PATCH', '/api/business/settings', {
        token: basic.token,
        body: { storefrontAnnouncement: 'Sale now on' },
      });
      assert.equal(res.status, 403, JSON.stringify(res.data));
      const prefs = await api('PATCH', '/api/business/settings', {
        token: basic.token,
        body: { emailWeeklyReport: false },
      });
      assert.equal(prefs.status, 200, JSON.stringify(prefs.data));
      assert.equal(prefs.data.business.emailWeeklyReport, false);
    });
  });

  describe('tracking and analytics', () => {
    let product;
    let otherProduct;

    before(async () => {
      product = await addProduct(owner.token, {
        name: 'Tracked Earrings',
        price: 450,
        stockQuantity: 20,
        category: 'Earrings',
        status: 'Active',
      });
      otherProduct = await addProduct(other.token, {
        name: 'Other Shop Ring',
        price: 900,
        stockQuantity: 5,
        status: 'Active',
      });
    });

    it('records anonymous events, dedupes repeats and never stores the raw visitor id', async () => {
      const id = visitorId('a');
      const first = await api('POST', `/api/store/${owner.slug}/events`, { body: { type: 'visit', visitorId: id } });
      assert.equal(first.status, 202);
      const repeat = await api('POST', `/api/store/${owner.slug}/events`, { body: { type: 'visit', visitorId: id } });
      assert.equal(repeat.status, 202);

      const events = await StoreEvent.find({ businessId: owner.businessId, type: 'visit' }).lean();
      assert.equal(events.length, 1);
      assert.notEqual(events[0].visitorHash, id);
      assert.equal(events[0].visitorHash.length, 32);
      assert.equal('ip' in events[0], false);
      assert.equal('userAgent' in events[0], false);
    });

    it('ignores the seller browsing their own store and products from another shop', async () => {
      const own = await api('POST', `/api/store/${owner.slug}/events`, {
        token: owner.token,
        body: { type: 'visit', visitorId: visitorId('seller') },
      });
      assert.equal(own.status, 202);
      const cross = await api('POST', `/api/store/${owner.slug}/events`, {
        body: { type: 'product_view', visitorId: visitorId('b'), productId: otherProduct.id },
      });
      assert.equal(cross.status, 202);
      const invalid = await api('POST', `/api/store/${owner.slug}/events`, {
        body: { type: 'visit', visitorId: 'short' },
      });
      assert.equal(invalid.status, 400);

      const count = await StoreEvent.countDocuments({ businessId: owner.businessId });
      assert.equal(count, 1);
      assert.equal(await StoreEvent.countDocuments({ businessId: other.businessId }), 0);
    });

    it('computes funnel and conversion from real events and storefront orders', async () => {
      for (const label of ['b', 'c']) {
        // eslint-disable-next-line no-await-in-loop
        await api('POST', `/api/store/${owner.slug}/events`, { body: { type: 'visit', visitorId: visitorId(label) } });
      }
      for (const label of ['a', 'b']) {
        // eslint-disable-next-line no-await-in-loop
        await api('POST', `/api/store/${owner.slug}/events`, {
          body: { type: 'product_view', visitorId: visitorId(label), productId: product.id },
        });
      }
      await api('POST', `/api/store/${owner.slug}/events`, {
        body: { type: 'add_to_cart', visitorId: visitorId('a'), productId: product.id, quantity: 2 },
      });
      await placeStoreOrder(owner.slug, product.id, { quantity: 2 });

      const perf = await api('GET', '/api/analytics/performance?range=today', { token: owner.token });
      assert.equal(perf.status, 200, JSON.stringify(perf.data));
      const { metrics, funnel } = perf.data;
      assert.equal(metrics.uniqueVisitors, 3);
      assert.equal(metrics.productViews, 2);
      assert.equal(metrics.addToCart, 1);
      assert.equal(metrics.orders, 1);
      assert.equal(metrics.storefrontOrders, 1);
      assert.equal(metrics.revenue, 900);
      assert.equal(metrics.conversionRate, 33.33);
      assert.deepEqual(funnel.map((step) => step.value), [3, 2, 1, 1]);
      assert.equal(funnel[1].ofPrevious, 66.67);

      const products = await api('GET', '/api/analytics/products?range=today', { token: owner.token });
      const row = products.data.products.find((item) => item.productId === product.id);
      assert.equal(row.views, 2);
      assert.equal(row.addToCart, 1);
      assert.equal(row.units, 2);
      assert.equal(row.needsAttention, false);

      const otherPerf = await api('GET', '/api/analytics/performance?range=today', { token: other.token });
      assert.equal(otherPerf.data.metrics.uniqueVisitors, 0);
      assert.equal(otherPerf.data.metrics.orders, 0);
    });

    it('withholds insights until there is enough activity', async () => {
      const res = await api('GET', '/api/analytics/insights?range=30d', { token: owner.token });
      assert.equal(res.status, 200);
      const { insights } = res.data;
      assert.equal(insights.topViewedCategory.available, false);
      assert.equal(insights.popularPriceRange.available, false);
      assert.equal(insights.activity.available, false);
      assert.equal(insights.activity.minimum, 50);
    });

    it('validates date ranges and exports CSV safely', async () => {
      const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
      const bad = await api('GET', `/api/analytics/sales-report?range=custom&from=${future}&to=${future}`, { token: owner.token });
      assert.equal(bad.status, 400);

      const report = await api('GET', '/api/analytics/sales-report?range=month', { token: owner.token });
      assert.equal(report.status, 200);
      assert.equal(report.data.summary.orders, 1);
      assert.equal(report.data.summary.unitsSold, 2);

      const csv = await api('GET', '/api/analytics/export/orders.csv?range=today', { token: owner.token });
      assert.equal(csv.status, 200);
      assert.match(csv.contentType, /text\/csv/);
      assert.match(csv.buffer.toString('utf8'), /Riya Menon/);

      assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
    });

    it('resolves calendar ranges in the analytics time zone', () => {
      const now = new Date('2026-03-10T20:00:00Z');
      const today = resolveRange({ range: 'today' }, { timeZone: 'Asia/Kolkata', now });
      assert.equal(today.from, '2026-03-11');
      assert.equal(today.start.toISOString(), '2026-03-10T18:30:00.000Z');
      const month = resolveRange({ range: 'month' }, { timeZone: 'Asia/Kolkata', now });
      assert.equal(month.from, '2026-03-01');
      assert.equal(month.days, 11);
    });
  });

  describe('invoices', () => {
    let order;
    let confirmationToken;

    before(async () => {
      const product = await addProduct(owner.token, { name: 'Invoice Bangle', price: 1200, stockQuantity: 10, status: 'Active' });
      const placed = await placeStoreOrder(owner.slug, product.id, { quantity: 1 });
      confirmationToken = placed.confirmationToken;
      order = await Order.findOne({ businessId: owner.businessId, orderNumber: placed.order.orderNumber });
    });

    it('creates one numbered invoice per order and renders a PDF', async () => {
      const invoice = await waitFor(() => Invoice.findOne({ businessId: owner.businessId, orderId: order._id }));
      assert.ok(invoice, 'invoice should be created after the order');
      assert.match(invoice.invoiceNumber, /^INV-\d{6}$/);

      const again = await api('GET', `/api/orders/${order._id}/invoice`, { token: owner.token });
      assert.equal(again.status, 200);
      assert.equal(again.data.invoice.invoiceNumber, invoice.invoiceNumber);
      assert.equal(await Invoice.countDocuments({ businessId: owner.businessId, orderId: order._id }), 1);

      const pdf = await api('GET', `/api/orders/${order._id}/invoice/pdf?download=1`, { token: owner.token });
      assert.equal(pdf.status, 200);
      assert.match(pdf.contentType, /application\/pdf/);
      assert.equal(pdf.buffer.subarray(0, 4).toString(), '%PDF');
      assert.match(pdf.headers.get('content-disposition'), /attachment/);

      const list = await api('GET', '/api/invoices', { token: owner.token });
      assert.equal(list.status, 200);
      assert.ok(list.data.invoices.some((item) => item.invoiceNumber === invoice.invoiceNumber));
    });

    it('keeps invoices private to their shop', async () => {
      const invoice = await Invoice.findOne({ businessId: owner.businessId, orderId: order._id });
      const byId = await api('GET', `/api/invoices/${invoice._id}/pdf`, { token: other.token });
      assert.equal(byId.status, 404);
      const byOrder = await api('GET', `/api/orders/${order._id}/invoice`, { token: other.token });
      assert.equal(byOrder.status, 404);
      const list = await api('GET', '/api/invoices', { token: other.token });
      assert.equal(list.data.invoices.length, 0);
    });

    it('lets the customer download their invoice with the confirmation token only', async () => {
      const ok = await api('GET', `/api/store/${owner.slug}/orders/confirm/${confirmationToken}/invoice`);
      assert.equal(ok.status, 200);
      assert.equal(ok.buffer.subarray(0, 4).toString(), '%PDF');
      const wrongShop = await api('GET', `/api/store/${other.slug}/orders/confirm/${confirmationToken}/invoice`);
      assert.equal(wrongShop.status, 404);
    });
  });

  describe('bulk products', () => {
    it('only changes products that belong to the signed-in shop', async () => {
      const mine = await addProduct(owner.token, { name: 'Bulk Mine', price: 100, stockQuantity: 4, status: 'Active' });
      const theirs = await addProduct(other.token, { name: 'Bulk Theirs', price: 100, stockQuantity: 4, status: 'Active' });

      const res = await api('POST', '/api/products/bulk', {
        token: owner.token,
        body: { ids: [mine.id, theirs.id], action: 'adjustPricePercent', value: 10 },
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(res.data.modified, 1);
      assert.equal((await Product.findById(mine.id)).price, 110);
      assert.equal((await Product.findById(theirs.id)).price, 100);

      const stock = await api('POST', '/api/products/bulk', {
        token: owner.token,
        body: { ids: [mine.id], action: 'adjustStock', value: -10 },
      });
      assert.equal(stock.status, 200);
      assert.equal((await Product.findById(mine.id)).stockQuantity, 0);

      const invalid = await api('POST', '/api/products/bulk', {
        token: owner.token,
        body: { ids: [mine.id], action: 'setPrice', value: -5 },
      });
      assert.equal(invalid.status, 400);
    });
  });

  describe('emails and alerts', () => {
    it('emails the customer an order confirmation and respects the preference', async () => {
      const product = await addProduct(owner.token, { name: 'Confirm Necklace', price: 700, stockQuantity: 10, status: 'Active' });
      emailService.clearMemoryOutbox();
      const email = `buyer-${stamp}@example.com`;
      const placed = await placeStoreOrder(owner.slug, product.id, { email });
      const sent = await waitFor(() => emailService.getMemoryOutbox().find((item) => item.to === email));
      assert.ok(sent, 'customer confirmation email should be sent');
      assert.match(sent.subject, new RegExp(placed.order.orderNumber));
      assert.match(sent.html, /\/invoice/);

      await api('PATCH', '/api/business/settings', { token: owner.token, body: { emailOrderConfirmation: false } });
      emailService.clearMemoryOutbox();
      const quietEmail = `quiet-${stamp}@example.com`;
      await placeStoreOrder(owner.slug, product.id, { email: quietEmail });
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(emailService.getMemoryOutbox().some((item) => item.to === quietEmail), false);
      await api('PATCH', '/api/business/settings', { token: owner.token, body: { emailOrderConfirmation: true } });
    });

    it('alerts once when stock crosses the low-stock threshold', async () => {
      await api('PATCH', '/api/business/settings', { token: owner.token, body: { lowStockThreshold: 3 } });
      const product = await addProduct(owner.token, { name: 'Low Stock Anklet', price: 250, stockQuantity: 4, status: 'Active' });
      emailService.clearMemoryOutbox();

      await placeStoreOrder(owner.slug, product.id, { quantity: 1 });
      const notification = await waitFor(() => Notification.findOne({
        businessId: owner.businessId,
        type: 'LOW_STOCK',
        relatedEntityId: product.id,
      }));
      assert.ok(notification, 'low stock notification should be created');
      assert.match(notification.message, /3 left/);
      const alert = await waitFor(() => emailService.getMemoryOutbox().find((item) => item.to === owner.email && /stock/i.test(item.subject)));
      assert.ok(alert, 'low stock email should be sent to the owner');

      await placeStoreOrder(owner.slug, product.id, { quantity: 1 });
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(await Notification.countDocuments({ businessId: owner.businessId, type: 'LOW_STOCK', relatedEntityId: product.id }), 1);

      const inventory = await api('GET', '/api/products/inventory', { token: owner.token });
      assert.equal(inventory.data.threshold, 3);
      assert.ok(inventory.data.lowStock.some((item) => item.id === product.id));
    });

    it('sends deduplicated emails only once per key', async () => {
      let calls = 0;
      const send = async () => {
        calls += 1;
        return { ok: true };
      };
      const key = { businessId: owner.businessId, dedupeKey: `TEST:${stamp}`, kind: 'weekly_report' };
      assert.equal(await notifyEvents.sendOnce(key, send), true);
      assert.equal(await notifyEvents.sendOnce(key, send), false);
      assert.equal(calls, 1);

      const failing = { businessId: owner.businessId, dedupeKey: `FAIL:${stamp}`, kind: 'weekly_report' };
      assert.equal(await notifyEvents.sendOnce(failing, async () => ({ ok: false })), false);
      assert.equal(await notifyEvents.sendOnce(failing, send), true);
    });
  });

  describe('weekly report job endpoint', () => {
    it('requires the cron secret and runs the job when authorised', async () => {
      const originalSecret = env.cronSecret;
      const originalRun = weeklyReportService.runWeeklyReports;
      let runs = 0;
      // Stubbed so the test never touches real shops in a shared database.
      weeklyReportService.runWeeklyReports = async () => {
        runs += 1;
        return { eligible: 0, sent: 0, skipped: 0, failed: 0 };
      };
      try {
        env.cronSecret = '';
        const unconfigured = await api('POST', '/api/jobs/weekly-reports');
        assert.equal(unconfigured.status, 503);

        env.cronSecret = `cron-${stamp}`;
        const missing = await api('POST', '/api/jobs/weekly-reports');
        assert.equal(missing.status, 401);
        const wrong = await api('POST', '/api/jobs/weekly-reports', { headers: { authorization: 'Bearer nope' } });
        assert.equal(wrong.status, 401);
        const ok = await api('POST', '/api/jobs/weekly-reports', { headers: { authorization: `Bearer cron-${stamp}` } });
        assert.equal(ok.status, 200, JSON.stringify(ok.data));
        assert.equal(runs, 1);
      } finally {
        env.cronSecret = originalSecret;
        weeklyReportService.runWeeklyReports = originalRun;
      }
    });

    it('reports on the previous seven full days', () => {
      const week = weeklyReportService.previousWeek(new Date('2026-03-16T04:00:00Z'));
      assert.deepEqual(week, { range: 'custom', from: '2026-03-09', to: '2026-03-15' });
    });
  });

  describe('storefront promotions', () => {
    it('publishes promotions for Advanced shops and filters foreign featured products', async () => {
      const mine = await addProduct(owner.token, { name: 'Featured Mine', price: 300, stockQuantity: 5, category: 'Rings', status: 'Active' });
      const theirs = await addProduct(other.token, { name: 'Featured Theirs', price: 300, stockQuantity: 5, status: 'Active' });

      const saved = await api('PATCH', '/api/business/settings', {
        token: owner.token,
        body: {
          storefrontAnnouncement: 'Free pickup this week',
          storefrontPromoTitle: 'Festive edit',
          storefrontFeaturedProductIds: [mine.id, theirs.id],
          storefrontFeaturedCategories: ['Rings'],
        },
      });
      assert.equal(saved.status, 200, JSON.stringify(saved.data));
      assert.deepEqual(saved.data.business.storefrontFeaturedProductIds, [mine.id]);

      const store = await api('GET', `/api/store/${owner.slug}`);
      assert.equal(store.status, 200);
      const { promotions } = store.data.business;
      assert.equal(promotions.announcement, 'Free pickup this week');
      assert.equal(promotions.featuredProducts.length, 1);
      assert.equal(promotions.featuredProducts[0].name, 'Featured Mine');
      assert.deepEqual(promotions.featuredCategories, ['Rings']);

      const basicStore = await api('GET', `/api/store/${basic.slug}`);
      assert.equal(basicStore.data.business.promotions, null);
    });
  });
});

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectTestDB } = require('./_testDb');
const Business = require('../models/Business');
const Subscription = require('../models/Subscription');
const SubscriptionReceipt = require('../models/SubscriptionReceipt');
const {
  parseArgs,
  findArchivedChargeableShops,
  runDiagnostic,
} = require('../scripts/find-archived-chargeable-shops');

const stamp = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
const DAY = 24 * 60 * 60 * 1000;
const createdBusinessIds = [];

async function createShop(label, { archived = true, subscription = null } = {}) {
  const business = await Business.create({
    ownerId: new mongoose.Types.ObjectId(),
    name: `Diag ${label}`,
    slug: `diag-${label}-${stamp}`,
    category: 'Jewelry & Accessories',
    archivedAt: archived ? new Date(Date.now() - 2 * DAY) : null,
  });
  createdBusinessIds.push(business._id);
  const sub = subscription ? await Subscription.create({ businessId: business._id, ...subscription }) : null;
  return { business, subscription: sub };
}

async function snapshot() {
  const filter = { businessId: { $in: createdBusinessIds } };
  const [businesses, subscriptions, receipts] = await Promise.all([
    Business.find({ _id: { $in: createdBusinessIds } }).sort({ _id: 1 }).lean(),
    Subscription.find(filter).sort({ _id: 1 }).lean(),
    SubscriptionReceipt.find(filter).sort({ _id: 1 }).lean(),
  ]);
  return JSON.stringify({ businesses, subscriptions, receipts });
}

function ours(shops) {
  return shops.filter((shop) => shop.slug.endsWith(stamp)).map((shop) => shop.slug.split('-')[1]).sort();
}

describe('find-archived-chargeable-shops script', { timeout: 60000 }, () => {
  let shops;

  before(async () => {
    await connectTestDB();
    const periodEnd = new Date(Date.now() + 20 * DAY);
    shops = {
      active: await createShop('active', {
        subscription: { status: 'active', providerSubscriptionId: `sub_diagactive${stamp}`, lastProviderStatus: 'active', currentPeriodEndAt: periodEnd },
      }),
      cancelling: await createShop('cancelling', {
        subscription: {
          status: 'active', providerSubscriptionId: `sub_diagcancelling${stamp}`, lastProviderStatus: 'active',
          cancelAtPeriodEnd: true, currentPeriodEndAt: periodEnd,
        },
      }),
      trialing: await createShop('trialing', {
        subscription: {
          status: 'trialing', providerSubscriptionId: `sub_diagtrialing${stamp}`, lastProviderStatus: 'authenticated',
          trialEndAt: new Date(Date.now() + 2 * DAY),
        },
      }),
      pastdue: await createShop('pastdue', {
        subscription: { status: 'past_due', providerSubscriptionId: `sub_diagpastdue${stamp}`, lastProviderStatus: 'pending', pastDueSince: new Date() },
      }),
      halted: await createShop('halted', {
        subscription: { status: 'halted', providerSubscriptionId: `sub_diaghalted${stamp}`, lastProviderStatus: 'halted' },
      }),
      cancelled: await createShop('cancelled', {
        subscription: { status: 'cancelled', providerSubscriptionId: `sub_diagcancelled${stamp}`, lastProviderStatus: 'cancelled' },
      }),
      checkout: await createShop('checkout', {
        subscription: { status: 'incomplete', providerSubscriptionId: `sub_diagcheckout${stamp}`, lastProviderStatus: 'created' },
      }),
      noprovider: await createShop('noprovider', { subscription: { status: 'trialing', trialEndAt: new Date(Date.now() + DAY) } }),
      norow: await createShop('norow'),
      notarchived: await createShop('notarchived', {
        archived: false,
        subscription: { status: 'active', providerSubscriptionId: `sub_diaglive${stamp}`, lastProviderStatus: 'active' },
      }),
    };
    await SubscriptionReceipt.create({
      businessId: shops.active.business._id,
      subscriptionId: shops.active.subscription._id,
      providerSubscriptionId: `sub_diagactive${stamp}`,
      providerPaymentId: `pay_diag${stamp}`,
      receiptNumber: `CR-D${stamp}`,
      plan: 'pro',
      amountPaise: 59900,
      currency: 'INR',
      paidAt: new Date('2026-09-01T00:00:00Z'),
    });
  });

  after(async () => {
    const filter = { businessId: { $in: createdBusinessIds } };
    await SubscriptionReceipt.deleteMany(filter);
    await Subscription.deleteMany(filter);
    await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('accepts only the documented flag', () => {
    assert.deepEqual(parseArgs([]), { showSubscriptionIds: false });
    assert.deepEqual(parseArgs(['--show-subscription-ids']), { showSubscriptionIds: true });
    assert.throws(() => parseArgs(['--write']), /Unknown argument "--write"/);
    assert.throws(() => parseArgs(['--fix']), /Unknown argument/);
  });

  it('finds archived shops whose Razorpay subscription is not cancelled, using the archive guard rule', async () => {
    const found = await findArchivedChargeableShops();
    assert.deepEqual(ours(found), ['active', 'cancelling', 'checkout', 'halted', 'pastdue', 'trialing']);
    assert.equal(found.find((shop) => shop.slug === shops.checkout.business.slug).unfinishedCheckout, true);
    assert.equal(found.find((shop) => shop.slug === shops.trialing.business.slug).unfinishedCheckout, false);
    const active = found.find((shop) => shop.slug === shops.active.business.slug);
    assert.equal(active.status, 'active');
    assert.equal(active.businessId, String(shops.active.business._id));
    assert.equal(new Date(active.lastPaidAt).toISOString(), '2026-09-01T00:00:00.000Z');
    assert.equal(found.find((shop) => shop.slug === shops.cancelling.business.slug).cancelAtPeriodEnd, true);
  });

  it('changes nothing and prints Razorpay ids only when asked', async () => {
    const before = await snapshot();
    const lines = [];
    const reported = await runDiagnostic({ log: (line) => lines.push(line) });
    assert.equal(await snapshot(), before, 'no shop, subscription or receipt was modified');
    assert.deepEqual(ours(reported.chargeable), ['active', 'cancelling', 'halted', 'pastdue', 'trialing']);
    assert.deepEqual(ours(reported.unfinished), ['checkout']);

    const output = lines.join('\n');
    const unfinishedAt = output.indexOf('unfinished Razorpay checkout');
    assert.ok(unfinishedAt > 0);
    assert.ok(output.indexOf(shops.checkout.business.slug) > unfinishedAt, 'unfinished checkouts are listed separately');
    assert.ok(output.indexOf(shops.active.business.slug) < unfinishedAt);
    assert.match(output, new RegExp(`${shops.active.business.slug} \\(shop id ${shops.active.business._id}\\)`));
    assert.match(output, /Last recorded payment: 2026-09-01/);
    assert.match(output, /set to cancel at period end/);
    assert.match(output, /Nothing was changed/);
    assert.equal(output.includes('sub_diag'), false);
    assert.equal(output.includes('pay_diag'), false);
    assert.equal(output.includes(shops.cancelled.business.slug), false);
    assert.equal(output.includes(shops.notarchived.business.slug), false);
    assert.equal(output.includes('@'), false, 'no email addresses');

    const withIds = [];
    await runDiagnostic({ showSubscriptionIds: true, log: (line) => withIds.push(line) });
    assert.ok(withIds.some((line) => line.includes(`sub_diagactive${stamp}`)));
    assert.equal(withIds.some((line) => line.includes(`sub_diagcancelled${stamp}`)), false);
    assert.equal(await snapshot(), before);
  });
});

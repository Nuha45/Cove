const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// Fake values for this process only. Razorpay is never called: a stub client is injected below.
process.env.RAZORPAY_KEY_ID = 'rzp_test_backfill_key';
process.env.RAZORPAY_KEY_SECRET = 'backfill_test_secret_value_123456';
process.env.RAZORPAY_PRO_PLAN_ID = 'plan_test_pro_599';
process.env.RAZORPAY_ADVANCED_PLAN_ID = 'plan_test_advanced_899';

const { connectTestDB } = require('./_testDb');
const env = require('../config/env');
const Business = require('../models/Business');
const Subscription = require('../models/Subscription');
const SubscriptionReceipt = require('../models/SubscriptionReceipt');
const ReceiptCounter = require('../models/ReceiptCounter');
const razorpayService = require('../services/razorpayService');
const subscriptionReceiptService = require('../services/subscriptionReceiptService');
const { parseArgs, runBackfill } = require('../scripts/backfill-subscription-receipts');

const stamp = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
const DAY_S = 24 * 60 * 60;
const createdBusinessIds = [];

const razorpay = {
  invoices: [],
  payments: new Map(),
  failFor: new Set(),
};

function fakeClient() {
  return {
    invoices: {
      all: async (params = {}) => {
        if (razorpay.failFor.has(params.subscription_id)) {
          throw Object.assign(new Error('Razorpay unavailable'), { statusCode: 503 });
        }
        const matching = razorpay.invoices.filter((invoice) => invoice.subscription_id === params.subscription_id);
        const skip = Number(params.skip) || 0;
        const items = matching.slice(skip, skip + (Number(params.count) || 10)).map((invoice) => ({ ...invoice }));
        return { entity: 'collection', count: items.length, items };
      },
      fetch: async () => {
        throw Object.assign(new Error('not used'), { statusCode: 400 });
      },
    },
    payments: {
      fetch: async (id) => {
        if (!razorpay.payments.has(id)) {
          throw Object.assign(new Error('The id provided does not exist'), { statusCode: 400 });
        }
        return { ...razorpay.payments.get(id) };
      },
    },
  };
}

let seq = 0;
function seedPayment(overrides = {}) {
  seq += 1;
  const payment = {
    id: `pay_bf${stamp}${seq}`,
    entity: 'payment',
    amount: 59900,
    currency: 'INR',
    status: 'captured',
    captured: true,
    created_at: Math.floor(Date.now() / 1000),
    ...overrides,
  };
  razorpay.payments.set(payment.id, payment);
  return payment;
}

function seedInvoice(sub, payment, overrides = {}) {
  seq += 1;
  const paidAt = payment?.created_at || Math.floor(Date.now() / 1000);
  const invoice = {
    id: `inv_bf${stamp}${seq}`,
    entity: 'invoice',
    subscription_id: sub.providerSubscriptionId,
    payment_id: payment?.id || null,
    status: 'paid',
    paid_at: paidAt,
    billing_start: paidAt,
    billing_end: paidAt + 30 * DAY_S,
    short_url: `https://rzp.io/i/bf${seq}`,
    ...overrides,
  };
  razorpay.invoices.push(invoice);
  return invoice;
}

async function createShop(label, { plan = 'pro' } = {}) {
  const business = await Business.create({
    ownerId: new mongoose.Types.ObjectId(),
    name: `Backfill ${label}`,
    slug: `backfill-${label}-${stamp}`,
    category: 'Jewelry & Accessories',
  });
  createdBusinessIds.push(business._id);
  const subscription = await Subscription.create({
    businessId: business._id,
    providerSubscriptionId: `sub_bf${label}${stamp}`,
    providerPlanId: plan === 'advanced' ? env.razorpay.advancedPlanId : env.razorpay.planId,
    plan,
    status: 'active',
  });
  return { business, subscription };
}

function captureLog() {
  const lines = [];
  return { lines, log: (line) => lines.push(String(line)) };
}

const receiptsOf = (business) => SubscriptionReceipt.find({ businessId: business._id }).sort({ paidAt: 1 }).lean();
const counterSeq = async () => (await ReceiptCounter.findById('subscription').lean())?.seq || 0;

function assertNoSensitiveOutput(lines, extra = []) {
  const output = lines.join('\n');
  const sensitive = [
    ...razorpay.payments.keys(),
    ...razorpay.invoices.map((invoice) => invoice.id),
    ...razorpay.invoices.map((invoice) => invoice.subscription_id),
    env.razorpay.keyId,
    env.razorpay.keySecret,
    'rzp.io',
    '@',
    ...extra,
  ];
  for (const value of sensitive) {
    assert.equal(output.includes(value), false, `backfill output exposed ${value}`);
  }
}

describe('subscription receipt backfill', { timeout: 120000 }, () => {
  before(async () => {
    await connectTestDB();
    razorpayService.setClientForTests(fakeClient());
  });

  after(async () => {
    razorpayService.resetClientForTests();
    if (createdBusinessIds.length) {
      const scope = { businessId: { $in: createdBusinessIds } };
      await SubscriptionReceipt.deleteMany(scope);
      await Subscription.deleteMany(scope);
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('is a dry run unless --write is given, and rejects unknown arguments', () => {
    assert.deepEqual(parseArgs([]), { write: false, shop: '' });
    assert.deepEqual(parseArgs(['--write']), { write: true, shop: '' });
    assert.deepEqual(parseArgs(['--shop=Nuha-Jewelry']), { write: false, shop: 'nuha-jewelry' });
    assert.throws(() => parseArgs(['--wirte']), /Unknown argument/);
    assert.throws(() => parseArgs(['write']), /Unknown argument/);
    assert.throws(() => parseArgs(['--shop=']), /needs a shop link/);
  });

  it('previews, then records every paid invoice once, across pages and with no date cutoff', async () => {
    const { business, subscription } = await createShop('main', { plan: 'advanced' });
    const now = Math.floor(Date.now() / 1000);

    // A full first page of unpaid invoices pushes the paid ones onto the second page.
    for (let i = 0; i < 50; i += 1) seedInvoice(subscription, null, { status: 'issued', payment_id: null });
    const old = seedPayment({ amount: 59900, created_at: now - 400 * DAY_S });
    seedInvoice(subscription, old);
    const prorated = seedPayment({ amount: 30000, created_at: now - 20 * DAY_S });
    seedInvoice(subscription, prorated);
    const full = seedPayment({ amount: 89900, created_at: now - 10 * DAY_S });
    const fullInvoice = seedInvoice(subscription, full);
    seedInvoice(subscription, full);
    const refunded = seedPayment({ amount: 89900, status: 'refunded', captured: false });
    seedInvoice(subscription, refunded);
    const elsewhere = seedPayment({ amount: 59900, invoice_id: `inv_bf${stamp}other` });
    seedInvoice(subscription, elsewhere);
    const known = seedPayment({ amount: 89900, created_at: now - 5 * DAY_S });
    const knownInvoice = seedInvoice(subscription, known);
    await subscriptionReceiptService.recordPaymentForSubscription(subscription, {
      providerSubscriptionId: subscription.providerSubscriptionId,
      plan: 'advanced',
      payment: known,
    });

    const seqBefore = await counterSeq();
    const preview = captureLog();
    const dry = await runBackfill({ shop: business.slug, log: preview.log });
    assert.equal(dry.failed, 0);
    assert.equal(dry.incomplete, 0);
    assert.equal(dry.paidInvoices, 7);
    assert.deepEqual(dry.counts, { would_create: 3, would_link: 1, duplicate_payment: 1, not_captured: 2 });
    assert.equal(dry.newPaise, 59900 + 30000 + 89900);
    assert.equal((await receiptsOf(business)).length, 1, 'a dry run writes nothing');
    assert.equal((await receiptsOf(business))[0].providerInvoiceId, '');
    assert.equal(await counterSeq(), seqBefore);
    assert.ok(preview.lines.some((line) => line.includes('DRY RUN')));
    assertNoSensitiveOutput(preview.lines);

    const written = captureLog();
    const write = await runBackfill({ write: true, shop: business.slug, log: written.log });
    assert.equal(write.failed, 0);
    assert.deepEqual(write.counts, { created: 3, linked: 1, duplicate_payment: 1, not_captured: 2 });
    assertNoSensitiveOutput(written.lines);

    const receipts = await receiptsOf(business);
    assert.equal(receipts.length, 4);
    const byPayment = new Map(receipts.map((receipt) => [receipt.providerPaymentId, receipt]));
    assert.equal(byPayment.get(old.id).plan, 'pro', 'a full ₹599 charge is Cove Basic');
    assert.equal(byPayment.get(old.id).paidAt.getTime(), (now - 400 * DAY_S) * 1000, 'no date cutoff');
    assert.equal(byPayment.get(prorated.id).plan, 'advanced', 'a prorated charge takes the subscription plan');
    assert.equal(byPayment.get(full.id).plan, 'advanced');
    assert.equal(byPayment.get(full.id).providerInvoiceId, fullInvoice.id);
    assert.equal(byPayment.get(full.id).amountPaise, 89900);
    assert.equal(byPayment.get(known.id).providerInvoiceId, knownInvoice.id, 'the existing receipt gained its invoice');
    assert.equal(byPayment.has(refunded.id), false);
    assert.equal(byPayment.has(elsewhere.id), false);
    assert.equal(await counterSeq(), seqBefore + 3);

    // Running again changes nothing.
    const again = await runBackfill({ write: true, shop: business.slug, log: () => {} });
    assert.deepEqual(again.counts, { exists: 4, duplicate_payment: 1, not_captured: 2 });
    assert.equal((await receiptsOf(business)).length, 4);
    assert.equal(await counterSeq(), seqBefore + 3);
  });

  it('reports a Razorpay failure for one shop and still backfills the others', async () => {
    const broken = await createShop('broken');
    const healthy = await createShop('healthy');
    seedInvoice(broken.subscription, seedPayment());
    seedInvoice(healthy.subscription, seedPayment());
    razorpay.failFor.add(broken.subscription.providerSubscriptionId);

    const output = captureLog();
    let totals;
    try {
      totals = await runBackfill({ write: true, log: output.log });
    } finally {
      razorpay.failFor.clear();
    }
    assert.ok(totals.failed >= 1);
    assert.ok(output.lines.some((line) => line.startsWith(`${broken.business.slug}: FAILED (502 `)));
    assert.equal((await receiptsOf(broken.business)).length, 0);
    assert.equal((await receiptsOf(healthy.business)).length, 1);
    assertNoSensitiveOutput(output.lines);

    const retry = await runBackfill({ write: true, shop: broken.business.slug, log: () => {} });
    assert.equal(retry.failed, 0);
    assert.equal((await receiptsOf(broken.business)).length, 1);
  });

  it('rejects an unknown shop without touching anything', async () => {
    await assert.rejects(runBackfill({ shop: `no-such-shop-${stamp}`, log: () => {} }), /No shop found/);
  });
});

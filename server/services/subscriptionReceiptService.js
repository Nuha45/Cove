const mongoose = require('mongoose');
const SubscriptionReceipt = require('../models/SubscriptionReceipt');
const ReceiptCounter = require('../models/ReceiptCounter');
const ApiError = require('../utils/ApiError');
const { PLAN_KEYS, getPlan } = require('../utils/covePlan');
const razorpayService = require('./razorpayService');

const COUNTER_KEY = 'subscription';
const INVOICE_ID = /^inv_[A-Za-z0-9]+$/;
const INVOICE_PAGE_SIZE = 50;
const INVOICE_MAX_PAGES = 4;
// The backfill reads a subscription's whole invoice history: 1,000 invoices is decades of monthly billing.
const BACKFILL_MAX_PAGES = 20;
// How far back a subscription.updated event looks for a paid invoice that has no receipt yet.
const RECONCILE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const INVOICE_NOT_AVAILABLE = 'This invoice is not available.';
const INVOICE_NOT_READY = 'Razorpay has not issued an invoice for this payment yet. Please try again later.';
// A receipt whose invoice Razorpay could not find is not looked up again for this long.
const INVOICE_LOOKUP_COOLDOWN_MS = 60 * 60 * 1000;

function fromUnix(value) {
  const num = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(num) || num <= 0) return null;
  return new Date(num * 1000);
}

function formatReceiptNumber(seq) {
  return `CR-${String(seq).padStart(6, '0')}`;
}

// The payment Razorpay attached to a webhook, only when its money has actually been captured.
function capturedPayment(payment) {
  if (!payment || typeof payment.id !== 'string' || !payment.id.trim()) return null;
  if (payment.status !== 'captured') return null;
  if (!Number.isInteger(payment.amount) || payment.amount <= 0) return null;
  return payment;
}

function invoiceIdOf(value) {
  return typeof value === 'string' && INVOICE_ID.test(value) ? value : '';
}

// Razorpay's hosted invoice page. Anything else (another host, plain http, a Dashboard link) is refused.
function hostedInvoiceUrl(value) {
  if (typeof value !== 'string') return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'rzp.io' || url.port || url.username || url.password) return null;
  return url.href;
}

// Links Razorpay's invoice to a receipt that has none yet. A stored invoice id is never replaced.
async function linkInvoice(receipt, invoiceId) {
  if (!invoiceId || receipt.providerInvoiceId) return receipt;
  const updated = await SubscriptionReceipt.findOneAndUpdate(
    { _id: receipt._id, providerInvoiceId: { $in: ['', null] } },
    { $set: { providerInvoiceId: invoiceId } },
    { new: true }
  );
  return updated || SubscriptionReceipt.findById(receipt._id);
}

/**
 * Records one receipt per captured Razorpay payment. Safe to call again for the same payment
 * (subscription.activated and subscription.charged often both carry it, and webhooks are retried):
 * the existing receipt is returned, gains a missing invoice id, and no receipt number is used up.
 */
async function recordCapturedPayment(details) {
  const providerInvoiceId = invoiceIdOf(details.providerInvoiceId);
  const existing = await SubscriptionReceipt.findOne({ providerPaymentId: details.providerPaymentId });
  if (existing) return { receipt: await linkInvoice(existing, providerInvoiceId), created: false };

  // Indexes and the counter row must exist before the transaction; neither can be created inside one.
  await SubscriptionReceipt.init();
  await ReceiptCounter.updateOne({ _id: COUNTER_KEY }, { $setOnInsert: { seq: 0 } }, { upsert: true });

  const session = await mongoose.startSession();
  try {
    let created = false;
    const receipt = await session.withTransaction(async () => {
      created = false;
      const raced = await SubscriptionReceipt.findOne({ providerPaymentId: details.providerPaymentId }).session(session);
      if (raced) return raced;
      // The number and the receipt commit together, so a retried or aborted attempt never leaves a gap.
      const counter = await ReceiptCounter.findOneAndUpdate(
        { _id: COUNTER_KEY },
        { $inc: { seq: 1 } },
        { new: true, session }
      );
      const [doc] = await SubscriptionReceipt.create(
        [{ ...details, providerInvoiceId, receiptNumber: formatReceiptNumber(counter.seq) }],
        { session }
      );
      created = true;
      return doc;
    });
    if (!created) return { receipt: await linkInvoice(receipt, providerInvoiceId), created };
    return { receipt, created };
  } catch (err) {
    if (err.code === 11000) {
      const raced = await SubscriptionReceipt.findOne({ providerPaymentId: details.providerPaymentId });
      if (raced) return { receipt: await linkInvoice(raced, providerInvoiceId), created: false };
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

// `payment` must already have passed capturedPayment().
async function recordPaymentForSubscription(subscription, {
  providerSubscriptionId,
  plan,
  payment,
  invoiceId,
  paidAt,
  periodStartAt,
  periodEndAt,
}) {
  return recordCapturedPayment({
    businessId: subscription.businessId,
    subscriptionId: subscription._id,
    providerSubscriptionId,
    providerPaymentId: payment.id,
    providerInvoiceId: invoiceId || payment.invoice_id,
    plan,
    amountPaise: payment.amount,
    currency: String(payment.currency || 'INR').toUpperCase(),
    paidAt: paidAt || fromUnix(payment.created_at) || new Date(),
    periodStartAt: periodStartAt || null,
    periodEndAt: periodEndAt || null,
  });
}

// Pages through a subscription's invoices on Razorpay and keeps the ones `keep` accepts.
// `complete` is false when the page limit stopped the listing before Razorpay ran out of invoices.
async function findSubscriptionInvoices(providerSubscriptionId, keep, { first = false, maxPages = INVOICE_MAX_PAGES } = {}) {
  const invoices = [];
  for (let page = 0; page < maxPages; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const items = await razorpayService.listSubscriptionInvoices(providerSubscriptionId, {
      count: INVOICE_PAGE_SIZE,
      skip: page * INVOICE_PAGE_SIZE,
    });
    invoices.push(...items.filter(keep));
    if ((first && invoices.length) || items.length < INVOICE_PAGE_SIZE) return { invoices, complete: true };
  }
  return { invoices, complete: false };
}

function isPaidInvoiceOf(invoice, providerSubscriptionId) {
  return invoice?.status === 'paid'
    && invoice.subscription_id === providerSubscriptionId
    && Boolean(invoiceIdOf(invoice.id))
    && typeof invoice.payment_id === 'string'
    && invoice.payment_id !== '';
}

/**
 * Records a receipt for each paid Razorpay invoice of a subscription that has none yet, from the captured
 * payment the invoice names. Returns one outcome per paid invoice:
 *   created / would_create   a new receipt (dryRun only reports it)
 *   exists / linked / would_link   the payment already has a receipt; a missing invoice id is filled in
 *   duplicate_payment   another invoice in this run already named the payment
 *   other_subscription  the payment's receipt belongs to a different subscription; left alone
 *   not_captured        Razorpay does not report a captured payment that matches the invoice
 */
async function reconcilePaidInvoices(subscription, {
  providerSubscriptionId,
  planFor,
  keep = () => true,
  dryRun = false,
  maxPages = INVOICE_MAX_PAGES,
}) {
  const { invoices, complete } = await findSubscriptionInvoices(
    providerSubscriptionId,
    (invoice) => isPaidInvoiceOf(invoice, providerSubscriptionId) && keep(invoice),
    { maxPages }
  );

  const outcomes = [];
  const seenPayments = new Set();
  for (const invoice of invoices) {
    if (seenPayments.has(invoice.payment_id)) {
      outcomes.push({ outcome: 'duplicate_payment' });
      continue;
    }
    seenPayments.add(invoice.payment_id);

    // eslint-disable-next-line no-await-in-loop
    const existing = await SubscriptionReceipt.findOne({ providerPaymentId: invoice.payment_id });
    if (existing) {
      if (existing.providerSubscriptionId !== providerSubscriptionId) {
        outcomes.push({ outcome: 'other_subscription' });
      } else if (dryRun) {
        outcomes.push({ outcome: existing.providerInvoiceId ? 'exists' : 'would_link', receipt: existing, created: false });
      } else {
        const linked = !existing.providerInvoiceId;
        // eslint-disable-next-line no-await-in-loop
        outcomes.push({ outcome: linked ? 'linked' : 'exists', receipt: await linkInvoice(existing, invoice.id), created: false });
      }
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const payment = capturedPayment(await razorpayService.fetchPayment(invoice.payment_id));
    if (!payment || payment.id !== invoice.payment_id || (payment.invoice_id && payment.invoice_id !== invoice.id)) {
      outcomes.push({ outcome: 'not_captured' });
      continue;
    }
    const plan = planFor(payment);
    if (dryRun) {
      outcomes.push({ outcome: 'would_create', plan, amountPaise: payment.amount });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const result = await recordPaymentForSubscription(subscription, {
      providerSubscriptionId,
      plan,
      payment,
      invoiceId: invoice.id,
      paidAt: fromUnix(invoice.paid_at),
      periodStartAt: fromUnix(invoice.billing_start),
      periodEndAt: fromUnix(invoice.billing_end),
    });
    outcomes.push({ outcome: result.created ? 'created' : 'exists', plan, amountPaise: payment.amount, ...result });
  }
  return { outcomes, complete };
}

/**
 * An immediate upgrade charges the prorated difference, and Razorpay reports it on subscription.updated
 * without promising a payment in the payload. Razorpay's paid invoices are the record of that charge, so
 * recent ones without a receipt are recorded from the captured payment each invoice names.
 */
async function reconcileRecentInvoices(subscription, { providerSubscriptionId, plan, eventAt }) {
  const since = (eventAt || new Date()).getTime() - RECONCILE_WINDOW_MS;
  const { outcomes } = await reconcilePaidInvoices(subscription, {
    providerSubscriptionId,
    planFor: () => plan,
    keep: (invoice) => (fromUnix(invoice.paid_at)?.getTime() || 0) >= since,
  });
  return outcomes.filter((item) => item.receipt).map(({ receipt, created }) => ({ receipt, created }));
}

// A full monthly charge names its plan by price. Anything else (a prorated upgrade) uses `fallback`.
function planForAmount(amountPaise, fallback) {
  return PLAN_KEYS.find((key) => getPlan(key).amountPaise === amountPaise) || fallback;
}

/**
 * One-off backfill for payments made before receipts existed: every paid Razorpay invoice of the
 * subscription, however old, gets a receipt through the same checks as live webhooks.
 * Dry run unless `dryRun` is false.
 */
async function backfillSubscriptionReceipts(subscription, { dryRun = true } = {}) {
  const fallback = razorpayService.planKeyForProviderPlanId(subscription.providerPlanId) || subscription.plan || 'pro';
  return reconcilePaidInvoices(subscription, {
    providerSubscriptionId: subscription.providerSubscriptionId,
    planFor: (payment) => planForAmount(payment.amount, fallback),
    dryRun,
    maxPages: BACKFILL_MAX_PAGES,
  });
}

// A lookup blocks new ones while its timestamp is inside this window. A timestamp further ahead than one
// cooldown can only come from a wrong clock, and must not block lookups for longer than that.
function lookupBlockedWindow() {
  const now = Date.now();
  return {
    since: new Date(now - INVOICE_LOOKUP_COOLDOWN_MS),
    until: new Date(now + INVOICE_LOOKUP_COOLDOWN_MS),
  };
}

function canLookUpInvoice(receipt) {
  if (receipt.providerInvoiceId) return false;
  if (!receipt.invoiceLookupAt) return true;
  const at = new Date(receipt.invoiceLookupAt);
  const { since, until } = lookupBlockedWindow();
  return !(at > since && at <= until);
}

function toPublic(receipt) {
  return {
    id: String(receipt._id),
    receiptNumber: receipt.receiptNumber,
    plan: receipt.plan,
    planName: getPlan(receipt.plan).name,
    amountPaise: receipt.amountPaise,
    amount: receipt.amountPaise / 100,
    currency: receipt.currency,
    paidAt: receipt.paidAt,
    periodStartAt: receipt.periodStartAt || null,
    periodEndAt: receipt.periodEndAt || null,
    invoiceAvailable: Boolean(receipt.providerInvoiceId),
    invoiceLookupAvailable: canLookUpInvoice(receipt),
  };
}

async function listForBusiness(businessId, { page = 1, limit = 20 } = {}) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const safePage = Math.max(1, Math.floor(Number(page)) || 1);
  const [receipts, total] = await Promise.all([
    SubscriptionReceipt.find({ businessId })
      .sort({ paidAt: -1, _id: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    SubscriptionReceipt.countDocuments({ businessId }),
  ]);
  return { receipts: receipts.map(toPublic), page: safePage, limit: safeLimit, total };
}

// For receipts recorded before Razorpay's invoice id was known: the payment names it, or the
// subscription's invoice list does.
async function findInvoiceId(receipt) {
  const payment = await razorpayService.fetchPayment(receipt.providerPaymentId);
  const fromPayment = payment?.id === receipt.providerPaymentId ? invoiceIdOf(payment.invoice_id) : '';
  if (fromPayment) return fromPayment;
  const { invoices: [match] } = await findSubscriptionInvoices(
    receipt.providerSubscriptionId,
    (invoice) => invoice?.payment_id === receipt.providerPaymentId && Boolean(invoiceIdOf(invoice.id)),
    { first: true }
  );
  return match ? match.id : '';
}

// The hosted URL of Razorpay's paid invoice `invoiceId` when it belongs to this receipt's payment, or null.
async function verifiedInvoiceUrl(receipt, invoiceId) {
  const invoice = await razorpayService.fetchInvoice(invoiceId);
  const matches = invoice
    && invoice.id === invoiceId
    && invoice.status === 'paid'
    && invoice.payment_id === receipt.providerPaymentId
    && invoice.subscription_id === receipt.providerSubscriptionId;
  return matches ? hostedInvoiceUrl(invoice.short_url) : null;
}

// Starts a lookup for a receipt without an invoice id. Null while another lookup is within its cooldown.
function claimInvoiceLookup(receipt) {
  const { since, until } = lookupBlockedWindow();
  return SubscriptionReceipt.findOneAndUpdate(
    {
      _id: receipt._id,
      providerInvoiceId: { $in: ['', null] },
      $or: [{ invoiceLookupAt: null }, { invoiceLookupAt: { $lte: since } }, { invoiceLookupAt: { $gt: until } }],
    },
    { $set: { invoiceLookupAt: new Date() } },
    { new: true }
  );
}

// The hosted URL of Razorpay's paid invoice for one of this shop's payments, or a 404.
async function invoiceUrlForReceipt(businessId, receiptId) {
  const notAvailable = (message = INVOICE_NOT_AVAILABLE) => new ApiError(404, message);
  if (!mongoose.isValidObjectId(receiptId)) throw notAvailable();
  const receipt = await SubscriptionReceipt.findOne({ _id: receiptId, businessId });
  if (!receipt) throw notAvailable();

  if (receipt.providerInvoiceId) {
    const url = await verifiedInvoiceUrl(receipt, receipt.providerInvoiceId);
    if (!url) throw notAvailable();
    return url;
  }

  const claim = await claimInvoiceLookup(receipt);
  if (!claim) {
    const current = await SubscriptionReceipt.findById(receipt._id);
    if (current?.providerInvoiceId) return invoiceUrlForReceipt(businessId, receiptId);
    throw notAvailable(INVOICE_NOT_READY);
  }

  try {
    const invoiceId = await findInvoiceId(receipt);
    const url = invoiceId ? await verifiedInvoiceUrl(receipt, invoiceId) : null;
    if (!url) throw notAvailable(INVOICE_NOT_READY);
    await linkInvoice(receipt, invoiceId);
    return url;
  } catch (err) {
    // Razorpay could not be asked: free the lookup so the seller can retry without waiting out the cooldown.
    if (err?.statusCode !== 404) {
      await SubscriptionReceipt.updateOne(
        { _id: claim._id, invoiceLookupAt: claim.invoiceLookupAt },
        { $set: { invoiceLookupAt: receipt.invoiceLookupAt || null } }
      ).catch(() => {});
    }
    throw err;
  }
}

module.exports = {
  capturedPayment,
  recordCapturedPayment,
  recordPaymentForSubscription,
  reconcileRecentInvoices,
  backfillSubscriptionReceipts,
  listForBusiness,
  invoiceUrlForReceipt,
  formatReceiptNumber,
  hostedInvoiceUrl,
};

const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');
const WebhookEvent = require('../models/WebhookEvent');
const ApiError = require('../utils/ApiError');
const { PROVIDER, mapRazorpayStatus } = require('../utils/subscriptionStatus');
const razorpayService = require('./razorpayService');
const subscriptionReceiptService = require('./subscriptionReceiptService');
const { hasPaidAccess } = require('../utils/entitlements');

const ACTIVATED_STATUSES = new Set(['active', 'past_due', 'halted']);

function unixToDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return new Date(num * 1000);
}

function extractSubscription(payload) {
  const entity = payload?.payload?.subscription?.entity;
  if (entity && entity.id) return entity;
  return null;
}

function extractPayment(payload) {
  return payload?.payload?.payment?.entity || null;
}

function safeLog(eventType, details = {}) {
  console.info('[razorpay-webhook]', JSON.stringify({
    eventType,
    ...details,
  }));
}

async function claimEvent(eventId, eventType) {
  try {
    await WebhookEvent.create({
      provider: PROVIDER,
      eventId,
      eventType,
      processedAt: new Date(),
    });
    return true;
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
}

const PAYMENT_EVENTS = new Set(['subscription.activated', 'subscription.charged']);

/**
 * A seller paid through a Razorpay subscription Cove created but no longer points at
 * (for example an earlier checkout that was replaced). The businessId comes from the
 * notes Cove set at creation and arrives inside a signature-verified webhook.
 * Only adopted when the shop has no paid access of its own, so it never replaces a live plan.
 */
async function adoptOrphanedSubscription(entity, eventType) {
  if (!PAYMENT_EVENTS.has(eventType)) return null;
  const businessId = entity.notes?.businessId;
  if (!businessId || !mongoose.isValidObjectId(businessId)) return null;
  const subscription = await Subscription.findOne({ businessId });
  if (!subscription || hasPaidAccess(subscription)) {
    if (subscription) {
      safeLog(eventType, {
        result: 'ignored',
        reason: 'second_paid_subscription',
        businessId: String(businessId),
        providerSubscriptionId: entity.id,
      });
    }
    return null;
  }
  subscription.providerSubscriptionId = entity.id;
  subscription.lastProviderEventAt = null;
  subscription.lastProviderStatus = '';
  subscription.cancelAtPeriodEnd = false;
  safeLog(eventType, { result: 'adopted', businessId: String(businessId), providerSubscriptionId: entity.id });
  return subscription;
}

const TERMINAL_PROVIDER_STATUSES = new Set(['cancelled', 'completed', 'expired']);
const TERMINAL_EVENTS = new Set(['subscription.cancelled', 'subscription.completed']);

// Returns the Cove subscription the event belongs to (even when its state is left unchanged), or null.
async function applySubscriptionEntity(entity, eventType, eventAt = null) {
  if (!entity?.id) {
    safeLog(eventType, { result: 'ignored', reason: 'missing_subscription' });
    return null;
  }

  let subscription = await Subscription.findOne({ providerSubscriptionId: entity.id });
  if (!subscription) subscription = await adoptOrphanedSubscription(entity, eventType);
  if (!subscription) {
    safeLog(eventType, {
      result: 'ignored',
      reason: 'unknown_subscription',
      providerSubscriptionId: entity.id,
    });
    return null;
  }

  // Razorpay retries can arrive after newer events. Never let an older event roll state back.
  if (eventAt && subscription.lastProviderEventAt && eventAt < subscription.lastProviderEventAt) {
    safeLog(eventType, { result: 'ignored', reason: 'stale_event', providerSubscriptionId: entity.id });
    return subscription;
  }
  // The one-time mandate check can arrive after activation with the same timestamp; it must not undo a paid state.
  if (eventType === 'subscription.authenticated' && ACTIVATED_STATUSES.has(subscription.status)) {
    safeLog(eventType, { result: 'ignored', reason: 'already_activated', providerSubscriptionId: entity.id });
    return subscription;
  }
  // An ended Razorpay subscription cannot come back to life.
  if (
    subscription.status === 'cancelled'
    && TERMINAL_PROVIDER_STATUSES.has(subscription.lastProviderStatus)
    && !TERMINAL_EVENTS.has(eventType)
  ) {
    safeLog(eventType, { result: 'ignored', reason: 'subscription_ended', providerSubscriptionId: entity.id });
    return subscription;
  }

  const previousStatus = subscription.status;
  const mapped = mapRazorpayStatus(entity.status, { trialEndAt: subscription.trialEndAt });
  subscription.lastProviderStatus = entity.status || subscription.lastProviderStatus;
  if (entity.customer_id) subscription.providerCustomerId = entity.customer_id;
  if (entity.plan_id) {
    subscription.providerPlanId = entity.plan_id;
    const planKey = razorpayService.planKeyForProviderPlanId(entity.plan_id);
    if (planKey) {
      subscription.plan = planKey;
      if (subscription.scheduledPlan === planKey) subscription.scheduledPlan = '';
    }
  }

  const periodStart = unixToDate(entity.current_start);
  const periodEnd = unixToDate(entity.current_end);
  if (periodStart) subscription.currentPeriodStartAt = periodStart;
  if (periodEnd) subscription.currentPeriodEndAt = periodEnd;

  if (mapped) {
    subscription.status = mapped;
  }

  if (mapped === 'cancelled') {
    subscription.cancelledAt = unixToDate(entity.ended_at) || subscription.cancelledAt || new Date();
  }

  // Explicit event overrides when status mapping is ambiguous.
  if (eventType === 'subscription.pending') subscription.status = 'past_due';
  if (eventType === 'subscription.halted' || eventType === 'subscription.paused') {
    subscription.status = 'halted';
  }
  if (eventType === 'subscription.cancelled' || eventType === 'subscription.completed') {
    subscription.status = 'cancelled';
    subscription.cancelledAt = subscription.cancelledAt || new Date();
  }
  if (eventType === 'subscription.activated' || eventType === 'subscription.charged') {
    subscription.status = 'active';
  }
  if (eventType === 'subscription.authenticated') {
    subscription.status = mapRazorpayStatus('authenticated', { trialEndAt: subscription.trialEndAt });
  }

  if (subscription.status === 'past_due') {
    if (previousStatus !== 'past_due' || !subscription.pastDueSince) {
      subscription.pastDueSince = eventAt || new Date();
    }
  } else {
    subscription.pastDueSince = null;
  }
  if (subscription.status === 'cancelled') {
    subscription.cancelAtPeriodEnd = false;
    subscription.scheduledPlan = '';
  }
  if (eventAt) subscription.lastProviderEventAt = eventAt;

  await subscription.save();
  safeLog(eventType, {
    result: 'updated',
    businessId: String(subscription.businessId),
    providerSubscriptionId: entity.id,
    status: subscription.status,
  });
  return subscription;
}

// Events that can report a charge. A subscription.authenticated payment is the mandate check and never
// gets a receipt. subscription.updated reports an immediate upgrade's prorated charge.
const RECEIPT_EVENTS = new Set([...PAYMENT_EVENTS, 'subscription.updated']);

async function recordReceipt(subscription, entity, payload, eventType, eventAt) {
  if (!RECEIPT_EVENTS.has(eventType)) return;
  const plan = razorpayService.planKeyForProviderPlanId(entity.plan_id) || subscription.plan || 'pro';
  const payment = subscriptionReceiptService.capturedPayment(extractPayment(payload));

  let results = [];
  if (payment) {
    results = [await subscriptionReceiptService.recordPaymentForSubscription(subscription, {
      providerSubscriptionId: entity.id,
      plan,
      payment,
      paidAt: unixToDate(payment.created_at) || eventAt,
      periodStartAt: unixToDate(entity.current_start),
      periodEndAt: unixToDate(entity.current_end),
    })];
  } else if (eventType === 'subscription.updated') {
    // No captured payment in the payload: Razorpay's paid invoices decide whether the update charged.
    // A failure here fails the webhook, so Razorpay retries it instead of the charge going unrecorded.
    results = await subscriptionReceiptService.reconcileRecentInvoices(subscription, {
      providerSubscriptionId: entity.id,
      plan,
      eventAt,
    });
  }

  results.forEach(({ receipt, created }) => safeLog(eventType, {
    result: created ? 'receipt_created' : 'receipt_exists',
    businessId: String(subscription.businessId),
    receiptNumber: receipt.receiptNumber,
  }));
}

const HANDLED_EVENTS = new Set([
  'subscription.authenticated',
  'subscription.activated',
  'subscription.charged',
  'subscription.pending',
  'subscription.halted',
  'subscription.cancelled',
  'subscription.completed',
  'subscription.paused',
  'subscription.resumed',
  'subscription.updated',
]);

async function processRazorpayWebhook({ rawBody, signature, eventIdHeader }) {
  if (!razorpayService.verifyWebhookSignature(rawBody, signature)) {
    throw new ApiError(400, 'Invalid webhook signature.');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
  } catch {
    throw new ApiError(400, 'Malformed webhook payload.');
  }

  const eventType = payload?.event;
  const eventId = eventIdHeader || payload?.id;
  if (!eventType || !eventId) {
    throw new ApiError(400, 'Malformed webhook payload.');
  }

  const claimed = await claimEvent(String(eventId), String(eventType));
  if (!claimed) {
    safeLog(eventType, { result: 'duplicate', eventId: String(eventId) });
    return { duplicate: true };
  }

  if (!HANDLED_EVENTS.has(eventType)) {
    safeLog(eventType, { result: 'ignored', reason: 'unhandled_event', eventId: String(eventId) });
    return { ignored: true };
  }

  const entity = extractSubscription(payload);
  const eventAt = unixToDate(payload.created_at);
  try {
    if (eventType === 'subscription.resumed' && entity) entity.status = 'active';
    const subscription = await applySubscriptionEntity(entity, eventType, eventAt);
    if (subscription) await recordReceipt(subscription, entity, payload, eventType, eventAt);
  } catch (err) {
    // Release the claim so Razorpay's retry of this event is processed instead of skipped.
    await WebhookEvent.deleteOne({ provider: PROVIDER, eventId: String(eventId) }).catch(() => {});
    throw err;
  }
  return { ok: true };
}

module.exports = {
  processRazorpayWebhook,
  HANDLED_EVENTS,
};

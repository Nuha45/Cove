const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');
const WebhookEvent = require('../models/WebhookEvent');
const ApiError = require('../utils/ApiError');
const { PROVIDER, mapRazorpayStatus } = require('../utils/subscriptionStatus');
const razorpayService = require('./razorpayService');

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

async function applySubscriptionEntity(entity, eventType) {
  if (!entity?.id) {
    safeLog(eventType, { result: 'ignored', reason: 'missing_subscription' });
    return;
  }

  const subscription = await Subscription.findOne({ providerSubscriptionId: entity.id });
  if (!subscription) {
    safeLog(eventType, {
      result: 'ignored',
      reason: 'unknown_subscription',
      providerSubscriptionId: entity.id,
    });
    return;
  }

  const mapped = mapRazorpayStatus(entity.status, { trialEndAt: subscription.trialEndAt });
  subscription.lastProviderStatus = entity.status || subscription.lastProviderStatus;
  if (entity.customer_id) subscription.providerCustomerId = entity.customer_id;
  if (entity.plan_id) subscription.providerPlanId = entity.plan_id;

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
    subscription.status = mapRazorpayStatus('authenticated', { trialEndAt: subscription.trialEndAt }) || 'trialing';
  }

  await subscription.save();
  safeLog(eventType, {
    result: 'updated',
    businessId: String(subscription.businessId),
    providerSubscriptionId: entity.id,
    status: subscription.status,
  });
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

  if (eventType === 'subscription.resumed') {
    const entity = extractSubscription(payload);
    if (entity) {
      entity.status = 'active';
      await applySubscriptionEntity(entity, eventType);
    } else {
      safeLog(eventType, { result: 'ignored', reason: 'missing_subscription' });
    }
    return { ok: true };
  }

  const entity = extractSubscription(payload);
  await applySubscriptionEntity(entity, eventType);
  return { ok: true };
}

module.exports = {
  processRazorpayWebhook,
  HANDLED_EVENTS,
};

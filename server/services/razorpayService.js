const crypto = require('crypto');
const Razorpay = require('razorpay');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { getPlan } = require('../utils/covePlan');

let client;

function planIdFor(planKey) {
  return planKey === 'advanced' ? env.razorpay.advancedPlanId : env.razorpay.planId;
}

function planKeyForProviderPlanId(providerPlanId) {
  if (!providerPlanId) return null;
  if (env.razorpay.advancedPlanId && providerPlanId === env.razorpay.advancedPlanId) return 'advanced';
  if (env.razorpay.planId && providerPlanId === env.razorpay.planId) return 'pro';
  return null;
}

function isPlanConfigured(planKey) {
  return Boolean(env.razorpay.keyId && env.razorpay.keySecret && planIdFor(planKey));
}

function getClient() {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) {
    throw new ApiError(503, 'Billing is not available right now. Please try again later.');
  }
  if (!client) {
    client = new Razorpay({
      key_id: env.razorpay.keyId,
      key_secret: env.razorpay.keySecret,
    });
  }
  return client;
}

function requirePlanId(planKey) {
  const planId = planIdFor(planKey);
  if (!planId) {
    throw new ApiError(503, `${getPlan(planKey).name} is not available right now. Please try again later.`);
  }
  return planId;
}

// Provider error text can mention internal ids or configuration, so it is logged, not shown.
function providerError(action, err, message) {
  console.error('[razorpay]', JSON.stringify({
    action,
    status: err?.statusCode || null,
    code: err?.error?.code || null,
    description: err?.error?.description || err?.message || null,
  }));
  return new ApiError(502, message);
}

// Tests inject a fake client so we never hit the live Razorpay API.
function setClientForTests(fake) {
  client = fake;
}

function resetClientForTests() {
  client = undefined;
}

function verifyWebhookSignature(rawBody, signature) {
  const secret = env.razorpay.webhookSecret;
  if (!secret) {
    throw new ApiError(503, 'Webhook verification is not configured.');
  }
  if (!signature || typeof signature !== 'string') {
    return false;
  }
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const received = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (received.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(received, expectedBuf);
}

async function createSubscription({
  planKey = 'pro',
  startAtUnix,
  expireByUnix,
  notes = {},
  totalCount = 120,
}) {
  const planId = requirePlanId(planKey);
  const api = getClient();
  const plan = getPlan(planKey);
  // Plan ID and amount come only from server config / Razorpay dashboard plan — never the client.
  const payload = {
    plan_id: planId,
    total_count: totalCount,
    quantity: 1,
    customer_notify: 1,
    notes: {
      ...notes,
      cove_plan: plan.name,
      cove_amount_paise: String(plan.amountPaise),
    },
  };
  if (startAtUnix) payload.start_at = startAtUnix;
  if (expireByUnix) payload.expire_by = expireByUnix;

  try {
    return await api.subscriptions.create(payload);
  } catch (err) {
    throw providerError('create', err, 'We could not start checkout right now. Please try again in a few minutes.');
  }
}

// Razorpay only supports plan changes for some payment methods (for example cards).
async function changeSubscriptionPlan(providerSubscriptionId, { planKey, scheduleChangeAt = 'now' }) {
  const planId = requirePlanId(planKey);
  const api = getClient();
  try {
    return await api.subscriptions.update(providerSubscriptionId, {
      plan_id: planId,
      schedule_change_at: scheduleChangeAt,
      customer_notify: 1,
    });
  } catch (err) {
    throw providerError(
      'change_plan',
      err,
      'We could not change your plan right now. Some payment methods do not support plan changes; '
        + 'if this keeps happening, cancel and choose the new plan after your current period ends.'
    );
  }
}

// Drops a plan change that was scheduled for the end of the cycle.
async function cancelScheduledChanges(providerSubscriptionId) {
  const api = getClient();
  try {
    return await api.subscriptions.cancelScheduledChanges(providerSubscriptionId);
  } catch (err) {
    throw providerError('cancel_scheduled_change', err, 'We could not keep your current plan right now. Please try again.');
  }
}

async function cancelSubscription(providerSubscriptionId, { cancelAtCycleEnd = false } = {}) {
  const api = getClient();
  try {
    return await api.subscriptions.cancel(providerSubscriptionId, cancelAtCycleEnd);
  } catch (err) {
    throw providerError('cancel', err, 'We could not cancel your subscription right now. Please try again.');
  }
}

const INVOICE_UNAVAILABLE = 'We could not load this invoice right now. Please try again in a few minutes.';

// Razorpay answers 400 (or 404) for an id it does not know.
function isUnknownId(err) {
  return err?.statusCode === 400 || err?.statusCode === 404;
}

async function fetchInvoice(invoiceId) {
  const api = getClient();
  try {
    return await api.invoices.fetch(invoiceId);
  } catch (err) {
    if (isUnknownId(err)) return null;
    throw providerError('fetch_invoice', err, INVOICE_UNAVAILABLE);
  }
}

async function fetchPayment(paymentId) {
  const api = getClient();
  try {
    return await api.payments.fetch(paymentId);
  } catch (err) {
    if (isUnknownId(err)) return null;
    throw providerError('fetch_payment', err, INVOICE_UNAVAILABLE);
  }
}

// One page of a subscription's invoices.
async function listSubscriptionInvoices(providerSubscriptionId, { count = 50, skip = 0 } = {}) {
  const api = getClient();
  try {
    const result = await api.invoices.all({ subscription_id: providerSubscriptionId, count, skip });
    return Array.isArray(result?.items) ? result.items : [];
  } catch (err) {
    if (isUnknownId(err)) return [];
    throw providerError('list_invoices', err, INVOICE_UNAVAILABLE);
  }
}

module.exports = {
  getClient,
  setClientForTests,
  resetClientForTests,
  verifyWebhookSignature,
  createSubscription,
  changeSubscriptionPlan,
  cancelScheduledChanges,
  cancelSubscription,
  fetchInvoice,
  fetchPayment,
  listSubscriptionInvoices,
  planIdFor,
  planKeyForProviderPlanId,
  isPlanConfigured,
};

const Subscription = require('../models/Subscription');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { COVE_PRO } = require('../utils/covePlan');
const { canUseCoveFeatures } = require('../utils/entitlements');
const { PROVIDER } = require('../utils/subscriptionStatus');
const razorpayService = require('./razorpayService');

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toUnix(date) {
  return Math.floor(new Date(date).getTime() / 1000);
}

function planPublic() {
  return {
    name: COVE_PRO.name,
    amount: COVE_PRO.amountDisplay,
    amountPaise: COVE_PRO.amountPaise,
    currency: COVE_PRO.currency,
    interval: COVE_PRO.interval,
    trialDays: env.trialDays,
  };
}

async function createTrialForBusiness(businessId, { force = false } = {}) {
  const existing = await Subscription.findOne({ businessId });
  if (existing) return existing;

  if (!force && !env.grantTrialOnRegister) {
    return Subscription.create({
      businessId,
      provider: PROVIDER,
      status: 'incomplete',
      trialUsed: false,
    });
  }

  const trialStartAt = new Date();
  const trialEndAt = addDays(trialStartAt, env.trialDays);
  return Subscription.create({
    businessId,
    provider: PROVIDER,
    status: 'trialing',
    trialUsed: true,
    trialStartAt,
    trialEndAt,
  });
}

// Existing shops without a row do NOT get a fresh trial (avoids unlimited re-trials).
async function getOrCreateBillingRecord(businessId) {
  let subscription = await Subscription.findOne({ businessId });
  if (subscription) return subscription;

  subscription = await Subscription.create({
    businessId,
    provider: PROVIDER,
    status: 'incomplete',
    trialUsed: true,
  });
  return subscription;
}

function refreshLocalTrialStatus(subscription, now = new Date()) {
  if (
    subscription.status === 'trialing'
    && subscription.trialEndAt
    && new Date(subscription.trialEndAt) <= now
    && !subscription.providerSubscriptionId
  ) {
    subscription.status = 'incomplete';
  }
  return subscription;
}

async function getBilling(businessId) {
  let subscription = await getOrCreateBillingRecord(businessId);
  subscription = refreshLocalTrialStatus(subscription);
  if (subscription.isModified('status')) await subscription.save();

  return {
    plan: planPublic(),
    subscription: subscription.toPublic(),
    entitlements: {
      canUseCoveFeatures: canUseCoveFeatures(subscription, { enforce: env.enforceBilling }),
      enforceBilling: env.enforceBilling,
    },
    checkout: {
      // Public key only. Secrets never leave the server.
      keyId: env.razorpay.keyId || null,
      configured: Boolean(env.razorpay.keyId && env.razorpay.keySecret && env.razorpay.planId),
    },
  };
}

const OPEN_PROVIDER_STATUSES = new Set(['trialing', 'active', 'past_due', 'incomplete']);

async function startSubscriptionCheckout(businessId) {
  const subscription = refreshLocalTrialStatus(await getOrCreateBillingRecord(businessId));

  if (subscription.status === 'active' && subscription.providerSubscriptionId) {
    throw new ApiError(409, 'Your Cove Pro subscription is already active.');
  }

  if (
    subscription.providerSubscriptionId
    && OPEN_PROVIDER_STATUSES.has(subscription.status)
    && subscription.status !== 'incomplete'
  ) {
    // Reuse the existing Razorpay subscription for checkout retries.
    return {
      subscription: subscription.toPublic(),
      checkout: {
        keyId: env.razorpay.keyId,
        subscriptionId: subscription.providerSubscriptionId,
        planName: COVE_PRO.name,
        amount: COVE_PRO.amountDisplay,
        currency: COVE_PRO.currency,
      },
    };
  }

  const now = new Date();
  let startAtUnix;
  if (subscription.trialEndAt && new Date(subscription.trialEndAt) > now) {
    startAtUnix = toUnix(subscription.trialEndAt);
  } else if (!subscription.trialUsed && env.grantTrialOnRegister) {
    // Should be rare: grant remaining trial only when explicitly unused.
    const trialStartAt = now;
    const trialEndAt = addDays(trialStartAt, env.trialDays);
    subscription.trialUsed = true;
    subscription.trialStartAt = trialStartAt;
    subscription.trialEndAt = trialEndAt;
    subscription.status = 'trialing';
    startAtUnix = toUnix(trialEndAt);
  }

  const expireByUnix = toUnix(addDays(now, 2));
  const created = await razorpayService.createSubscription({
    startAtUnix,
    expireByUnix,
    notes: {
      businessId: String(businessId),
    },
  });

  subscription.provider = PROVIDER;
  subscription.providerSubscriptionId = created.id;
  subscription.providerPlanId = created.plan_id || env.razorpay.planId;
  subscription.providerCustomerId = created.customer_id || subscription.providerCustomerId || '';
  subscription.lastProviderStatus = created.status || '';
  if (subscription.status === 'incomplete' && startAtUnix) {
    subscription.status = 'trialing';
  }
  await subscription.save();

  return {
    subscription: subscription.toPublic(),
    checkout: {
      keyId: env.razorpay.keyId,
      subscriptionId: created.id,
      planName: COVE_PRO.name,
      amount: COVE_PRO.amountDisplay,
      currency: COVE_PRO.currency,
    },
  };
}

async function cancelSubscription(businessId) {
  const subscription = await Subscription.findOne({ businessId });
  if (!subscription || !subscription.providerSubscriptionId) {
    throw new ApiError(400, 'There is no active provider subscription to cancel.');
  }
  if (subscription.status === 'cancelled') {
    throw new ApiError(400, 'This subscription is already cancelled.');
  }

  const providerSub = await razorpayService.cancelSubscription(subscription.providerSubscriptionId, {
    cancelAtCycleEnd: false,
  });

  subscription.lastProviderStatus = providerSub.status || 'cancelled';
  subscription.status = 'cancelled';
  subscription.cancelledAt = new Date();
  subscription.cancelAtPeriodEnd = false;
  await subscription.save();

  return {
    message: 'Subscription cancelled.',
    subscription: subscription.toPublic(),
  };
}

module.exports = {
  createTrialForBusiness,
  getOrCreateBillingRecord,
  getBilling,
  startSubscriptionCheckout,
  cancelSubscription,
  planPublic,
};

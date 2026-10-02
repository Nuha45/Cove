const Subscription = require('../models/Subscription');
const User = require('../models/User');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { PLANS, PLAN_KEYS, TRIAL_DAYS, getPlan } = require('../utils/covePlan');
const {
  canUseCoveFeatures,
  hasAdvancedFeatures,
  hasPaidAccess,
  inRunningTrial,
  isEntitled,
  trialEnded,
  ENTITLEMENT_FIELDS,
} = require('../utils/entitlements');
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

function planPublic(planKey = 'pro') {
  const plan = getPlan(planKey);
  return {
    key: plan.key,
    name: plan.name,
    amount: plan.amountDisplay,
    amountPaise: plan.amountPaise,
    currency: plan.currency,
    interval: plan.interval,
    trialDays: TRIAL_DAYS,
  };
}

function plansPublic() {
  return PLAN_KEYS.map((key) => ({
    ...planPublic(key),
    checkoutConfigured: razorpayService.isPlanConfigured(key),
  }));
}

// Called once, when registration creates the shop. The trial clock starts here.
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
  const trialEndAt = addDays(trialStartAt, TRIAL_DAYS);
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

// A "trialing" row whose trial and first-charge window have both passed is waiting for payment.
function refreshLocalTrialStatus(subscription, now = new Date()) {
  if (subscription.status === 'trialing' && !isEntitled(subscription, now)) {
    subscription.status = 'incomplete';
  }
  return subscription;
}

function detachProviderSubscription(subscription) {
  subscription.providerSubscriptionId = '';
  subscription.providerPlanId = '';
  subscription.lastProviderStatus = '';
  subscription.scheduledPlan = '';
  subscription.cancelAtPeriodEnd = false;
  subscription.pastDueSince = null;
  subscription.lastProviderEventAt = null;
}

// Platform admins run Cove, so a shop with an admin member is never paused or plan-gated by
// Cove billing. Read from the database on every check: revoking the flag restores normal billing
// immediately. This is the only place billing exemption is decided.
async function isBillingExempt(businessId) {
  if (!businessId) return false;
  return Boolean(await User.exists({ businessId, isPlatformAdmin: true }));
}

async function billingExemptBusinessIds(businessIds) {
  if (!businessIds.length) return new Set();
  const ids = await User.distinct('businessId', { businessId: { $in: businessIds }, isPlatformAdmin: true });
  return new Set(ids.map(String));
}

// Read-only access check used by feature gates. Never creates billing rows.
async function getPlanAccess(businessId) {
  const [subscription, exempt] = await Promise.all([
    Subscription.findOne({ businessId }).select(ENTITLEMENT_FIELDS).lean(),
    isBillingExempt(businessId),
  ]);
  const now = new Date();
  return {
    plan: subscription?.plan || 'pro',
    status: subscription?.status || 'incomplete',
    inTrial: inRunningTrial(subscription, now),
    advanced: exempt || hasAdvancedFeatures(subscription, now),
    billingExempt: exempt,
  };
}

async function hasAdvancedAccess(businessId) {
  const access = await getPlanAccess(businessId);
  return access.advanced;
}

const STORE_PAUSED = 'store_paused';
const PUBLIC_PAUSED_MESSAGE = 'This store is paused and is not taking orders right now.';
const SELLER_PAUSED_MESSAGES = {
  trial_ended: 'Your trial has ended. Choose a plan to reopen your Cove store.',
  billing_required: 'Your Cove store is paused. Choose a plan to reopen your Cove store.',
};

function storePausedFor(subscription, now = new Date()) {
  return env.enforceBilling && !isEntitled(subscription, now);
}

// Why access lapsed: the free trial ran out before any paid period, or a paid plan ended.
function accessState(subscription, now = new Date()) {
  if (isEntitled(subscription, now)) return 'ok';
  const everPaid = Boolean(subscription?.currentPeriodStartAt || subscription?.currentPeriodEndAt);
  return subscription?.trialEndAt && !everPaid ? 'trial_ended' : 'billing_required';
}

const EMAIL_UNVERIFIED = 'email_unverified';
const SELLER_UNVERIFIED_MESSAGE = 'Please verify your email address to continue.';

// A shop stays closed until its owner verifies their email. Only new signups are ever stored as false.
async function ownerUnverified(businessId) {
  return Boolean(await User.exists({ businessId, emailVerified: false }));
}

// Billing required: the public store and new orders stop. Seller data is never touched.
async function isStorePaused(businessId, now = new Date()) {
  if (await ownerUnverified(businessId)) return true;
  if (!env.enforceBilling) return false;
  if (await isBillingExempt(businessId)) return false;
  const subscription = await Subscription.findOne({ businessId }).select(ENTITLEMENT_FIELDS).lean();
  return storePausedFor(subscription, now);
}

async function pausedBusinessIds(businessIds, now = new Date()) {
  if (!businessIds.length) return new Set();
  const unverified = await User.distinct('businessId', {
    businessId: { $in: businessIds },
    emailVerified: false,
  });
  const paused = new Set(unverified.map(String));
  if (!env.enforceBilling) return paused;
  const [subscriptions, exempt] = await Promise.all([
    Subscription.find({ businessId: { $in: businessIds } }).select(`businessId ${ENTITLEMENT_FIELDS}`).lean(),
    billingExemptBusinessIds(businessIds),
  ]);
  const byBusiness = new Map(subscriptions.map((item) => [String(item.businessId), item]));
  businessIds.map(String)
    .filter((id) => !exempt.has(id) && storePausedFor(byBusiness.get(id), now))
    .forEach((id) => paused.add(id));
  return paused;
}

async function assertStoreOpen(businessId, { audience = 'public' } = {}) {
  if (await ownerUnverified(businessId)) {
    const message = audience === 'seller' ? SELLER_UNVERIFIED_MESSAGE : PUBLIC_PAUSED_MESSAGE;
    throw new ApiError(403, message, [{ field: 'store', message: EMAIL_UNVERIFIED }]);
  }
  if (!env.enforceBilling) return;
  if (await isBillingExempt(businessId)) return;
  const now = new Date();
  const subscription = await Subscription.findOne({ businessId })
    .select(`${ENTITLEMENT_FIELDS} currentPeriodStartAt`)
    .lean();
  if (!storePausedFor(subscription, now)) return;
  const message = audience === 'seller'
    ? SELLER_PAUSED_MESSAGES[accessState(subscription, now)]
    : PUBLIC_PAUSED_MESSAGE;
  throw new ApiError(403, message, [{ field: 'store', message: STORE_PAUSED }]);
}

async function getBilling(businessId) {
  const now = new Date();
  let subscription = await getOrCreateBillingRecord(businessId);
  subscription = refreshLocalTrialStatus(subscription, now);
  if (subscription.isModified('status')) await subscription.save();

  const currentPlan = subscription.plan || 'pro';
  const exempt = await isBillingExempt(businessId);
  const running = inRunningTrial(subscription, now);
  const ended = !exempt && trialEnded(subscription, now);
  const paused = !exempt && storePausedFor(subscription, now);
  const state = exempt ? 'ok' : accessState(subscription, now);
  return {
    store: {
      paused,
      reason: paused ? state : null,
    },
    access: state,
    billingExempt: exempt,
    plan: planPublic(currentPlan),
    plans: plansPublic(),
    subscription: subscription.toPublic(),
    trial: {
      days: TRIAL_DAYS,
      active: running,
      ended,
      endsAt: subscription.trialEndAt,
    },
    entitlements: {
      canUseCoveFeatures: exempt || canUseCoveFeatures(subscription, { enforce: env.enforceBilling, now }),
      enforceBilling: env.enforceBilling,
      advanced: exempt || hasAdvancedFeatures(subscription, now),
      inTrial: running,
      paid: hasPaidAccess(subscription, now),
      trialEnded: ended,
    },
    checkout: {
      // Public key only. Secrets and plan IDs never leave the server.
      keyId: env.razorpay.keyId || null,
      configured: PLAN_KEYS.some((key) => razorpayService.isPlanConfigured(key)),
    },
  };
}

function checkoutPayload(subscription, planKey) {
  const plan = PLANS[planKey];
  return {
    subscription: subscription.toPublic(),
    checkout: {
      keyId: env.razorpay.keyId,
      subscriptionId: subscription.providerSubscriptionId,
      planKey,
      planName: plan.name,
      amount: plan.amountDisplay,
      currency: plan.currency,
    },
  };
}

async function changeActivePlan(subscription, planKey) {
  const upgrading = planKey === 'advanced';
  // Upgrades apply immediately; downgrades wait for the current paid cycle to finish.
  const providerSub = await razorpayService.changeSubscriptionPlan(subscription.providerSubscriptionId, {
    planKey,
    scheduleChangeAt: upgrading ? 'now' : 'cycle_end',
  });

  const appliedPlan = razorpayService.planKeyForProviderPlanId(providerSub?.plan_id);
  if (appliedPlan) {
    subscription.plan = appliedPlan;
    subscription.providerPlanId = providerSub.plan_id;
  }
  if (providerSub?.status) subscription.lastProviderStatus = providerSub.status;
  const changedNow = subscription.plan === planKey;
  subscription.scheduledPlan = changedNow ? '' : planKey;
  await subscription.save();

  return {
    subscription: subscription.toPublic(),
    planChange: {
      planKey,
      applied: changedNow,
      message: changedNow
        ? `You are now on ${PLANS[planKey].name}.`
        : `Your plan switches to ${PLANS[planKey].name} at the end of the current billing cycle.`,
    },
  };
}

async function keepCurrentPlan(subscription) {
  await razorpayService.cancelScheduledChanges(subscription.providerSubscriptionId);
  subscription.scheduledPlan = '';
  await subscription.save();
  const name = getPlan(subscription.plan).name;
  return {
    subscription: subscription.toPublic(),
    planChange: {
      planKey: subscription.plan,
      applied: true,
      message: `You are staying on ${name}.`,
    },
  };
}

// One checkout at a time per shop, so two tabs can't create two Razorpay subscriptions.
const checkoutsInFlight = new Map();

async function startSubscriptionCheckout(businessId, options = {}) {
  const key = String(businessId);
  const previous = checkoutsInFlight.get(key) || Promise.resolve();
  const run = previous.catch(() => null).then(() => runSubscriptionCheckout(businessId, options));
  checkoutsInFlight.set(key, run);
  try {
    return await run;
  } finally {
    if (checkoutsInFlight.get(key) === run) checkoutsInFlight.delete(key);
  }
}

async function runSubscriptionCheckout(businessId, { plan: requestedPlan } = {}) {
  if (requestedPlan !== undefined && !PLAN_KEYS.includes(requestedPlan)) {
    throw new ApiError(400, 'Please choose Cove Basic or Cove Plus.');
  }
  const planKey = requestedPlan || 'pro';
  const plan = PLANS[planKey];
  const now = new Date();
  const subscription = refreshLocalTrialStatus(await getOrCreateBillingRecord(businessId), now);
  const currentPlan = subscription.plan || 'pro';
  const hasProvider = Boolean(subscription.providerSubscriptionId);

  // A cancellation whose paid period is over has ended, even if Razorpay's final webhook never arrived.
  if (
    hasProvider
    && subscription.status === 'active'
    && subscription.cancelAtPeriodEnd
    && !hasPaidAccess(subscription, now)
  ) {
    subscription.status = 'cancelled';
  }

  if (hasProvider && subscription.status === 'active') {
    if (subscription.cancelAtPeriodEnd) {
      throw new ApiError(
        409,
        'Your subscription is cancelled and ends with the current billing period. You can choose a plan again after it ends.'
      );
    }
    if (currentPlan === planKey) {
      if (subscription.scheduledPlan && subscription.scheduledPlan !== planKey) {
        return keepCurrentPlan(subscription);
      }
      throw new ApiError(409, `Your ${plan.name} subscription is already active.`);
    }
    if (subscription.scheduledPlan === planKey) {
      throw new ApiError(409, `Your plan already switches to ${plan.name} at the end of the current billing cycle.`);
    }
    return changeActivePlan(subscription, planKey);
  }

  if (hasProvider && subscription.status === 'past_due') {
    if (currentPlan === planKey) return checkoutPayload(subscription, planKey);
    throw new ApiError(409, 'Please resolve the pending payment before changing plans.');
  }

  if (hasProvider && subscription.status === 'trialing') {
    // Reuse the existing Razorpay subscription for checkout retries.
    if (currentPlan === planKey) return checkoutPayload(subscription, planKey);
    // Not charged yet: replace it so the seller never holds two subscriptions.
    await razorpayService.cancelSubscription(subscription.providerSubscriptionId, { cancelAtCycleEnd: false });
    detachProviderSubscription(subscription);
  } else if (hasProvider && subscription.status === 'halted') {
    await razorpayService.cancelSubscription(subscription.providerSubscriptionId, { cancelAtCycleEnd: false });
    detachProviderSubscription(subscription);
  } else if (hasProvider && subscription.status === 'incomplete') {
    // Abandoned checkout. Razorpay may already have expired it, so a failed cancel is not fatal.
    await razorpayService
      .cancelSubscription(subscription.providerSubscriptionId, { cancelAtCycleEnd: false })
      .catch(() => null);
    detachProviderSubscription(subscription);
  } else if (hasProvider && subscription.status === 'cancelled') {
    detachProviderSubscription(subscription);
  }

  let startAtUnix;
  if (subscription.trialEndAt && new Date(subscription.trialEndAt) > now) {
    // Card is set up now; the first charge happens when the free trial ends.
    startAtUnix = toUnix(subscription.trialEndAt);
  } else if (!subscription.trialUsed && env.grantTrialOnRegister) {
    // Should be rare: grant the trial only when it was explicitly never used.
    const trialStartAt = now;
    const trialEndAt = addDays(trialStartAt, TRIAL_DAYS);
    subscription.trialUsed = true;
    subscription.trialStartAt = trialStartAt;
    subscription.trialEndAt = trialEndAt;
    startAtUnix = toUnix(trialEndAt);
  }

  const expireByUnix = toUnix(addDays(now, 2));
  const created = await razorpayService.createSubscription({
    planKey,
    startAtUnix,
    expireByUnix,
    notes: {
      businessId: String(businessId),
    },
  });

  subscription.provider = PROVIDER;
  subscription.providerSubscriptionId = created.id;
  subscription.providerPlanId = created.plan_id || razorpayService.planIdFor(planKey);
  subscription.providerCustomerId = created.customer_id || subscription.providerCustomerId || '';
  subscription.lastProviderStatus = created.status || '';
  subscription.plan = planKey;
  subscription.scheduledPlan = '';
  subscription.cancelAtPeriodEnd = false;
  subscription.pastDueSince = null;
  subscription.lastProviderEventAt = null;
  // Paid access only begins when a verified Razorpay webhook says so.
  subscription.status = startAtUnix ? 'trialing' : 'incomplete';
  await subscription.save();

  return checkoutPayload(subscription, planKey);
}

async function cancelSubscription(businessId) {
  const subscription = await Subscription.findOne({ businessId });
  if (!subscription || !subscription.providerSubscriptionId) {
    throw new ApiError(400, 'You do not have an active subscription to cancel.');
  }
  if (subscription.status === 'cancelled') {
    throw new ApiError(400, 'This subscription is already cancelled.');
  }
  if (subscription.cancelAtPeriodEnd) {
    throw new ApiError(400, 'Your subscription is already set to end with the current billing period.');
  }

  const now = new Date();
  let message;

  if (subscription.status === 'active') {
    // Paid period stays usable; Razorpay stops the next renewal and sends subscription.cancelled then.
    const providerSub = await razorpayService.cancelSubscription(subscription.providerSubscriptionId, {
      cancelAtCycleEnd: true,
    });
    subscription.lastProviderStatus = providerSub?.status || subscription.lastProviderStatus;
    subscription.cancelledAt = now;
    subscription.scheduledPlan = '';
    if (providerSub?.status === 'cancelled') {
      subscription.status = 'cancelled';
      subscription.cancelAtPeriodEnd = false;
      message = 'Subscription cancelled.';
    } else {
      subscription.cancelAtPeriodEnd = true;
      message = 'Your subscription will not renew. You keep access until the end of the current billing period.';
    }
  } else if (subscription.status === 'trialing' || subscription.status === 'incomplete') {
    // Nothing has been charged yet. Stop the checkout; a running free trial carries on.
    await razorpayService.cancelSubscription(subscription.providerSubscriptionId, { cancelAtCycleEnd: false });
    detachProviderSubscription(subscription);
    subscription.lastProviderStatus = 'cancelled';
    subscription.cancelledAt = now;
    const trialRunning = subscription.trialEndAt && new Date(subscription.trialEndAt) > now;
    subscription.status = trialRunning ? 'trialing' : 'incomplete';
    message = trialRunning
      ? 'Your plan choice was cancelled. Your free trial continues until it ends.'
      : 'Your plan choice was cancelled. Nothing was charged.';
  } else {
    // past_due or halted: the current period was never paid for.
    const providerSub = await razorpayService.cancelSubscription(subscription.providerSubscriptionId, {
      cancelAtCycleEnd: false,
    });
    subscription.lastProviderStatus = providerSub?.status || 'cancelled';
    subscription.status = 'cancelled';
    subscription.cancelledAt = now;
    subscription.cancelAtPeriodEnd = false;
    subscription.pastDueSince = null;
    subscription.scheduledPlan = '';
    message = 'Subscription cancelled.';
  }

  await subscription.save();
  return {
    message,
    subscription: subscription.toPublic(),
  };
}

module.exports = {
  createTrialForBusiness,
  getOrCreateBillingRecord,
  getBilling,
  getPlanAccess,
  hasAdvancedAccess,
  isBillingExempt,
  billingExemptBusinessIds,
  isStorePaused,
  pausedBusinessIds,
  assertStoreOpen,
  STORE_PAUSED,
  startSubscriptionCheckout,
  cancelSubscription,
  planPublic,
};

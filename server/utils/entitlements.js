/**
 * Central entitlement helper for Cove SaaS access. Always evaluated on the server
 * from the stored Subscription; nothing sent by the browser is ever consulted.
 *
 * Without trial or paid access the public store and new orders pause (billing required),
 * unless COVE_ENFORCE_BILLING=false. Seller data, Billing and Settings stay available.
 * Cove Plus features (internal plan "advanced") are always plan-gated:
 *   - a running free trial (trialEndAt in the future) gets Cove Plus
 *   - otherwise only a paid Cove Plus subscription with current access
 *
 * Paid access (used for both plans):
 *   active    → yes, until the period ends if cancellation is scheduled
 *   past_due  → yes, for PAST_DUE_GRACE_DAYS after the first failed charge
 *   trialing  → yes while the trial runs; after it ends only for a short window when
 *               Razorpay reports the mandate as authenticated and the first charge is in flight
 *   halted, cancelled, incomplete, missing → no
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const PAST_DUE_GRACE_DAYS = 7;
const FIRST_CHARGE_GRACE_MS = DAY_MS;

// Statuses that can carry access. Individual rules above still apply.
const ALLOWED = new Set(['trialing', 'active', 'past_due']);

// Fields every entitlement check needs. Keep lean() selects in sync with this list.
const ENTITLEMENT_FIELDS = 'status plan trialEndAt providerSubscriptionId lastProviderStatus '
  + 'cancelAtPeriodEnd currentPeriodEndAt pastDueSince';

function toTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function inRunningTrial(subscription, now = new Date()) {
  const trialEnd = toTime(subscription?.trialEndAt);
  return Boolean(
    subscription
    && subscription.status === 'trialing'
    && trialEnd
    && trialEnd > now.getTime()
  );
}

function hasPaidAccess(subscription, now = new Date()) {
  if (!subscription) return false;
  const nowMs = now.getTime();

  if (subscription.status === 'active') {
    const periodEnd = toTime(subscription.currentPeriodEndAt);
    if (subscription.cancelAtPeriodEnd && periodEnd && periodEnd <= nowMs) return false;
    return true;
  }

  if (subscription.status === 'past_due') {
    const since = toTime(subscription.pastDueSince) || toTime(subscription.currentPeriodEndAt);
    return Boolean(since && nowMs < since + PAST_DUE_GRACE_DAYS * DAY_MS);
  }

  if (subscription.status === 'trialing') {
    const trialEnd = toTime(subscription.trialEndAt);
    if (!trialEnd || !subscription.providerSubscriptionId) return false;
    return subscription.lastProviderStatus === 'authenticated'
      && nowMs < trialEnd + FIRST_CHARGE_GRACE_MS;
  }

  return false;
}

function isEntitled(subscription, now = new Date()) {
  return inRunningTrial(subscription, now) || hasPaidAccess(subscription, now);
}

function canUseCoveFeatures(subscription, { enforce = false, now = new Date() } = {}) {
  if (!enforce) return true;
  return isEntitled(subscription, now);
}

function hasAdvancedFeatures(subscription, now = new Date()) {
  if (!subscription) return false;
  if (inRunningTrial(subscription, now)) return true;
  return subscription.plan === 'advanced' && hasPaidAccess(subscription, now);
}

// Trial has run out and nothing paid is giving access: the seller must choose a plan.
function trialEnded(subscription, now = new Date()) {
  if (!subscription?.trialEndAt) return false;
  return toTime(subscription.trialEndAt) <= now.getTime() && !hasPaidAccess(subscription, now);
}

module.exports = {
  canUseCoveFeatures,
  hasAdvancedFeatures,
  hasPaidAccess,
  inRunningTrial,
  isEntitled,
  trialEnded,
  ALLOWED,
  ENTITLEMENT_FIELDS,
  PAST_DUE_GRACE_DAYS,
};

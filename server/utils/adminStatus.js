/**
 * Admin-facing views of a shop, derived from stored data only. Nothing here changes billing.
 *
 * Account status (Cove SaaS subscription):
 *   active            ← status active, renewing
 *   cancelling        ← status active, set to end with the paid period
 *   trial             ← free trial running (or its first charge in flight)
 *   past_due          ← a renewal charge failed and Razorpay is retrying
 *   trial_ended       ← the free trial ran out and nothing was ever paid
 *   payment_required  ← no access for another reason (abandoned checkout, no billing row)
 *   halted            ← Razorpay stopped retrying failed charges
 *   cancelled         ← subscription ended
 *   exempt            ← a platform admin's shop, which never needs a plan
 */

const { hasPaidAccess, isEntitled } = require('./entitlements');

const ACCOUNT_STATUSES = [
  'active',
  'cancelling',
  'trial',
  'past_due',
  'trial_ended',
  'payment_required',
  'halted',
  'cancelled',
  'exempt',
];

const ACCOUNT_STATUS_LABELS = {
  active: 'Paying',
  cancelling: 'Cancelling',
  trial: 'Trial',
  past_due: 'Past due',
  trial_ended: 'Trial ended',
  payment_required: 'Payment required',
  halted: 'Halted',
  cancelled: 'Cancelled',
  exempt: 'Admin shop',
};

const STORE_STATES = ['live', 'off', 'closed_unverified', 'closed_billing', 'archived'];

const STORE_STATE_LABELS = {
  live: 'Live',
  off: 'Turned off by seller',
  closed_unverified: 'Closed: email not verified',
  closed_billing: 'Closed: no active plan',
  archived: 'Archived',
};

function accountStatus(subscription, now = new Date(), { exempt = false } = {}) {
  const status = subscription?.status;
  // An admin shop that really is on a paid Razorpay plan still shows that plan's state.
  if (exempt && status !== 'active' && status !== 'past_due') return 'exempt';
  if (!status) return 'payment_required';
  if (status === 'active') {
    if (!hasPaidAccess(subscription, now)) return 'cancelled';
    return subscription.cancelAtPeriodEnd ? 'cancelling' : 'active';
  }
  if (status === 'past_due') return 'past_due';
  if (status === 'halted') return 'halted';
  if (status === 'cancelled') return 'cancelled';
  if (isEntitled(subscription, now)) return 'trial';
  const everPaid = Boolean(subscription.currentPeriodStartAt || subscription.currentPeriodEndAt);
  if (subscription.trialEndAt && !everPaid) return 'trial_ended';
  return 'payment_required';
}

/**
 * Whether a seller in a free trial has set up payment for after the trial.
 *   autopay           ← Razorpay mandate authenticated; the first charge is scheduled for the trial end
 *   checkout_started  ← a Razorpay subscription exists but the mandate was never completed
 *   none              ← no Razorpay subscription
 * null outside a trial.
 */
function trialPaymentMethod(subscription) {
  if (!subscription || subscription.status !== 'trialing') return null;
  if (!subscription.providerSubscriptionId) return 'none';
  return subscription.lastProviderStatus === 'authenticated' ? 'autopay' : 'checkout_started';
}

// Same rule as the admin archive/delete guard: any Razorpay subscription not seen cancelled may charge.
function isLiveProviderSubscription(subscription) {
  return Boolean(subscription?.providerSubscriptionId && subscription.status !== 'cancelled');
}

// A Razorpay checkout the seller never completed: no payment mandate, so it cannot charge unless they finish it.
// Admin archive and delete end it at Razorpay first instead of refusing.
function isUnfinishedCheckout(subscription) {
  return Boolean(
    subscription?.providerSubscriptionId
    && (subscription.status === 'trialing' || subscription.status === 'incomplete')
    && subscription.lastProviderStatus !== 'authenticated'
  );
}

// Mirrors what the public storefront does: verification and billing pauses apply before the seller toggle.
function storeState({
  archived = false,
  ownerUnverified = false,
  exempt = false,
  storefrontActive = true,
  subscription = null,
  enforceBilling = false,
  now = new Date(),
} = {}) {
  if (archived) return 'archived';
  if (ownerUnverified) return 'closed_unverified';
  if (enforceBilling && !exempt && !isEntitled(subscription, now)) return 'closed_billing';
  if (storefrontActive === false) return 'off';
  return 'live';
}

// Matches the seller's "Set up payments" checklist step: an online method with its details filled in.
function onlinePaymentReady(business) {
  if (!business) return false;
  const hasUpi = Boolean(String(business.paymentUpiId || '').trim());
  if (business.paymentQrEnabled && (hasUpi || business.paymentQrImage)) return true;
  if (business.paymentLinkEnabled && String(business.paymentLink || '').trim()) return true;
  if (business.paymentInstructionsEnabled && String(business.paymentInstructions || '').trim()) return true;
  return false;
}

function setupStatus({ emailVerified, activeProducts, paymentsReady }) {
  const steps = {
    emailVerified: Boolean(emailVerified),
    hasActiveProduct: Number(activeProducts) > 0,
    paymentsReady: Boolean(paymentsReady),
  };
  const done = Object.values(steps).filter(Boolean).length;
  const total = Object.keys(steps).length;
  return { ...steps, done, total, complete: done === total };
}

module.exports = {
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_LABELS,
  STORE_STATES,
  STORE_STATE_LABELS,
  accountStatus,
  trialPaymentMethod,
  isLiveProviderSubscription,
  isUnfinishedCheckout,
  storeState,
  onlinePaymentReady,
  setupStatus,
};

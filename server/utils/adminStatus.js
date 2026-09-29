/**
 * Admin-facing account buckets derived from the Cove SaaS subscription row.
 *
 *   active            ← status active
 *   trial             ← status trialing with a trial still running (or its first charge in flight)
 *   payment_required  ← past_due, incomplete, an expired local trial, or no subscription row
 *   restricted        ← halted or cancelled
 */

const { isEntitled } = require('./entitlements');

const ACCOUNT_STATUSES = ['active', 'trial', 'payment_required', 'restricted'];

const ACCOUNT_STATUS_LABELS = {
  active: 'Active',
  trial: 'Trial',
  payment_required: 'Payment required',
  restricted: 'Restricted',
};

function accountStatus(subscription, now = new Date()) {
  if (!subscription || !subscription.status) return 'payment_required';
  const { status } = subscription;
  if (status === 'active') return 'active';
  if (status === 'trialing') return isEntitled(subscription, now) ? 'trial' : 'payment_required';
  if (status === 'halted' || status === 'cancelled') return 'restricted';
  return 'payment_required';
}

module.exports = { ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS, accountStatus };

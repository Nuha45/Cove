/**
 * Cove internal subscription statuses vs Razorpay Subscription states.
 *
 * Razorpay states (docs): created, authenticated, active, pending, halted,
 * cancelled, completed, paused, expired.
 *
 * Cove maps those into a small seller-facing set:
 *   trialing   ← Cove-local trial before/during authenticated period with future start_at
 *   active     ← Razorpay active (and successful charges)
 *   past_due   ← Razorpay pending (charge failed, retries in progress)
 *   halted     ← Razorpay halted or paused
 *   cancelled  ← Razorpay cancelled, completed, or expired
 *   incomplete ← local placeholder before checkout / after failed setup
 *
 * Provider event → Cove status mapping lives in mapRazorpayStatus / applyWebhookEvent.
 */

const STATUSES = [
  'incomplete',
  'trialing',
  'active',
  'past_due',
  'halted',
  'cancelled',
];

const PROVIDER = 'razorpay';

function mapRazorpayStatus(razorpayStatus, { trialEndAt, now = new Date() } = {}) {
  const status = String(razorpayStatus || '').toLowerCase();
  if (status === 'active') return 'active';
  if (status === 'pending') return 'past_due';
  if (status === 'halted' || status === 'paused') return 'halted';
  if (status === 'cancelled' || status === 'completed' || status === 'expired') return 'cancelled';
  if (status === 'authenticated' || status === 'created') {
    if (trialEndAt && new Date(trialEndAt) > now) return 'trialing';
    return status === 'authenticated' ? 'trialing' : 'incomplete';
  }
  return null;
}

module.exports = {
  STATUSES,
  PROVIDER,
  mapRazorpayStatus,
};

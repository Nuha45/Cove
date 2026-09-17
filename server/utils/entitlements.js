/**
 * Central entitlement helper for Cove SaaS access.
 *
 * Phase 8A does NOT lock the app by default (COVE_ENFORCE_BILLING=false).
 * When enforcement is enabled later:
 *   trialing, active, past_due → allowed (past_due has grace)
 *   halted, cancelled, incomplete, missing → restricted
 */

const ALLOWED = new Set(['trialing', 'active', 'past_due']);

function canUseCoveFeatures(subscription, { enforce = false } = {}) {
  if (!enforce) return true;
  if (!subscription || !subscription.status) return false;
  return ALLOWED.has(subscription.status);
}

module.exports = { canUseCoveFeatures, ALLOWED };

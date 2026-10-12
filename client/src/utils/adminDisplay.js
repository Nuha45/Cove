import { formatPrice } from './display';

export const ACCOUNT_STATUS_TONE = {
  active: 'green',
  cancelling: 'orange',
  trial: 'blue',
  past_due: 'yellow',
  trial_ended: 'neutral',
  payment_required: 'yellow',
  halted: 'red',
  cancelled: 'neutral',
  exempt: 'soft-orange',
};

export const STORE_STATE_TONE = {
  live: 'green',
  off: 'neutral',
  closed_unverified: 'yellow',
  closed_billing: 'red',
  archived: 'neutral',
};

export const TRIAL_PAYMENT_LABELS = {
  autopay: 'Autopay set up',
  checkout_started: 'Checkout not finished',
  none: 'No payment method',
};

export const TRIAL_PAYMENT_TONE = {
  autopay: 'green',
  checkout_started: 'yellow',
  none: 'neutral',
};

export const BUSINESS_FILTERS = [
  { value: 'all', label: 'All businesses' },
  { value: 'needs_setup', label: 'Setup not finished' },
  { value: 'email_unverified', label: 'Email not verified' },
  { value: 'trial_no_autopay', label: 'On trial, no autopay' },
  { value: 'trial_ended', label: 'Trial ended, never paid' },
  { value: 'past_due', label: 'Past due (payment failing)' },
  { value: 'halted', label: 'Halted (payments stopped)' },
  { value: 'cancelling', label: 'Cancelling at period end' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'active', label: 'Paying' },
  { value: 'exempt', label: 'Admin shops' },
  { value: 'archived', label: 'Archived' },
];

export const SETUP_STEP_LABELS = {
  emailVerified: 'Email verified',
  hasActiveProduct: 'Active product',
  paymentsReady: 'Online payment set up',
};

export function formatShortDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function daysUntil(iso, now = Date.now()) {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / (24 * 60 * 60 * 1000)));
}

export function formatPaise(paise, currency) {
  return formatPrice((Number(paise) || 0) / 100, currency);
}

export function missingSetupSteps(setup) {
  if (!setup) return [];
  return Object.keys(SETUP_STEP_LABELS).filter((key) => !setup[key]).map((key) => SETUP_STEP_LABELS[key]);
}

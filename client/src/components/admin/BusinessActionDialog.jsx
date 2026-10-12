import { useState } from 'react';
import {
  archiveAdminBusiness,
  deleteAdminBusiness,
  restoreAdminBusiness,
  setAdminBusinessOwnerAdmin,
} from '../../services/adminService';
import { getErrorMessage } from '../../utils/errors';
import { formatShortDate } from '../../utils/adminDisplay';

const COPY = {
  archive: {
    eyebrow: 'ARCHIVE SHOP',
    title: (name) => `Archive ${name}?`,
    text: 'The storefront goes offline and the owner is signed out and cannot log in. Nothing is deleted — you can restore the shop anytime.',
    confirm: 'Archive shop',
    busy: 'Archiving...',
    tone: 'danger',
  },
  restore: {
    eyebrow: 'RESTORE SHOP',
    title: (name) => `Restore ${name}?`,
    text: 'The storefront comes back online and the owner can log in again. Billing rules still apply.',
    confirm: 'Restore shop',
    busy: 'Restoring...',
    tone: 'primary',
  },
  delete: {
    eyebrow: 'DELETE SELLER ACCOUNT',
    title: (name) => `Permanently delete ${name}?`,
    text: 'This permanently deletes the seller account and the shop: the owner login, products, orders, customers, customer requests, invoices, notifications, analytics and subscription record, plus every uploaded file (logo, cover, product photos and payment QR). This cannot be undone.',
    confirm: 'Delete permanently',
    busy: 'Deleting...',
    tone: 'danger',
  },
  grantAdmin: {
    eyebrow: 'GRANT ADMIN ACCESS',
    title: (name) => `Make the owner of ${name} a platform admin?`,
    text: 'They will be able to open the Admin panel, see every shop and seller email, and archive or delete shops. Their own shop stops needing a Cove plan. Only grant this to someone you trust.',
    confirm: 'Grant admin access',
    busy: 'Granting...',
    tone: 'danger',
  },
  revokeAdmin: {
    eyebrow: 'REMOVE ADMIN ACCESS',
    title: (name) => `Remove admin access from the owner of ${name}?`,
    text: 'They lose the Admin panel immediately. Their shop goes back to normal Cove billing: if they have no active trial or plan, their store pauses until they choose one.',
    confirm: 'Remove admin access',
    busy: 'Removing...',
    tone: 'danger',
  },
};

const EMAIL_CONFIRM_MODES = new Set(['grantAdmin', 'revokeAdmin']);

export default function BusinessActionDialog({ business, mode, onClose, onDone, onFailed }) {
  const copy = COPY[mode];
  const [confirmSlug, setConfirmSlug] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const confirmsEmail = EMAIL_CONFIRM_MODES.has(mode);
  const needsTyping = mode === 'delete' || confirmsEmail;
  const expected = confirmsEmail ? business.owner?.email || '' : business.slug;
  const typedMatches = confirmsEmail
    ? Boolean(expected) && confirmSlug.trim().toLowerCase() === expected.toLowerCase()
    : confirmSlug.trim() === expected;
  // The server re-checks on submit; this only stops an archive the page already knows will be refused.
  // An unfinished checkout is not blocked: the server ends it at Razorpay before archiving.
  const subscription = business.subscription || {};
  const unfinishedCheckout = mode === 'archive' && Boolean(subscription.unfinishedCheckout);
  const archiveBlocked = mode === 'archive' && Boolean(subscription.liveProviderSubscription) && !unfinishedCheckout;
  const cancellingPaidPlan = archiveBlocked && subscription.cancelAtPeriodEnd && subscription.billingStatus === 'active';
  const canSubmit = !submitting && !archiveBlocked && (!needsTyping || typedMatches);

  async function submit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      let result;
      if (mode === 'archive') result = await archiveAdminBusiness(business.id);
      else if (mode === 'restore') result = await restoreAdminBusiness(business.id);
      else if (confirmsEmail) {
        result = await setAdminBusinessOwnerAdmin(business.id, {
          grant: mode === 'grantAdmin',
          confirmEmail: confirmSlug.trim(),
        });
      } else result = await deleteAdminBusiness(business.id, confirmSlug.trim());
      onDone(mode, result);
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
      onFailed?.(mode);
    }
  }

  return (
    <div className="modal-backdrop">
      <form
        className="modal confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="business-action-title"
        onSubmit={submit}
      >
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2 id="business-action-title">{copy.title(business.name)}</h2>
        <p className="muted">{copy.text}</p>
        {mode === 'archive' ? (
          cancellingPaidPlan ? (
            <p className="admin-billing-warning blocked" role="alert">
              This seller has paid until {formatShortDate(subscription.currentPeriodEndAt)} and their plan is set to
              cancel then, so Razorpay will not charge again. Archiving is blocked because it would lock them out of
              time they paid for. Archive once this page shows the plan as cancelled, or cancel it immediately in
              Razorpay if you mean to end it now.
            </p>
          ) : archiveBlocked ? (
            <p className="admin-billing-warning blocked" role="alert">
              This shop has a Razorpay subscription that is not cancelled, so it can still charge the seller.
              Archiving is blocked because the owner could not log in to cancel it. Cancel the subscription in
              Razorpay first, then archive once this page shows it as cancelled.
            </p>
          ) : unfinishedCheckout ? (
            <p className="admin-billing-warning">
              Billing check: this shop has an unfinished Razorpay checkout that was never paid or authorised.
              Archiving cancels it in Razorpay first, so it can never be completed. If Razorpay shows the seller did
              set up payment, archiving is refused instead.
            </p>
          ) : (
            <p className="admin-billing-warning">
              Billing check: an archived owner cannot log in to manage or cancel their Cove plan. Archiving is
              refused while the shop has a Razorpay subscription that is not cancelled.
            </p>
          )
        ) : null}
        {needsTyping ? (
          <label className="confirm-type-field">
            Type <code>{expected}</code> exactly to confirm
            <input
              value={confirmSlug}
              onChange={(event) => setConfirmSlug(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
            />
          </label>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="secondary" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className={copy.tone} type="submit" disabled={!canSubmit}>
            {submitting ? copy.busy : copy.confirm}
          </button>
        </div>
      </form>
    </div>
  );
}

import { useState } from 'react';
import {
  archiveAdminBusiness,
  deleteAdminBusiness,
  restoreAdminBusiness,
} from '../../services/adminService';
import { getErrorMessage } from '../../utils/errors';

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
};

export default function BusinessActionDialog({ business, mode, onClose, onDone, onFailed }) {
  const copy = COPY[mode];
  const [confirmSlug, setConfirmSlug] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const needsTyping = mode === 'delete';
  const canSubmit = !submitting && (!needsTyping || confirmSlug.trim() === business.slug);

  async function submit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      let result;
      if (mode === 'archive') result = await archiveAdminBusiness(business.id);
      else if (mode === 'restore') result = await restoreAdminBusiness(business.id);
      else result = await deleteAdminBusiness(business.id, confirmSlug.trim());
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
        {needsTyping ? (
          <label className="confirm-type-field">
            Type <code>{business.slug}</code> exactly to confirm
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

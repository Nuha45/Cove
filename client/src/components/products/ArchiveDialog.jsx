import { useState } from 'react';
import { archiveProduct } from '../../services/productService';
import { getErrorMessage } from '../../utils/errors';

export default function ArchiveDialog({ product, onClose, onArchived }) {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function confirmArchive() {
    setSubmitting(true);
    setError('');
    try {
      const result = await archiveProduct(product.id);
      onArchived(result.product);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="archive-title">
        <p className="eyebrow">ARCHIVE PRODUCT</p>
        <h2 id="archive-title">Archive {product.name}?</h2>
        <p className="muted">
          It will leave your active list. The product is not permanently deleted, and you can restore it from the Archived filter.
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="secondary" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="danger" type="button" onClick={confirmArchive} disabled={submitting}>
            {submitting ? 'Archiving...' : 'Archive product'}
          </button>
        </div>
      </div>
    </div>
  );
}

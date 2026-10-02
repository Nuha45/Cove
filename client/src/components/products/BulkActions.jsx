import { useState } from 'react';
import { bulkUpdateProducts } from '../../services/productService';
import { currencySymbol, formatPrice } from '../../utils/display';
import { getErrorMessage } from '../../utils/errors';

export const BULK_LIMIT = 100;

const ACTIONS = {
  setPrice: { label: 'Set price', input: 'number', placeholder: () => `New price in ${currencySymbol()}`, step: '0.01', min: 0 },
  adjustPricePercent: { label: 'Change price by %', input: 'number', placeholder: 'e.g. 10 or -15', step: '1', min: -90, max: 500 },
  setStock: { label: 'Set stock', input: 'number', placeholder: 'New stock quantity', step: '1', min: 0 },
  adjustStock: { label: 'Add or remove stock', input: 'number', placeholder: 'e.g. 5 or -3', step: '1' },
  setStatusActive: { label: 'Publish (make active)', action: 'setStatus', value: 'Active' },
  setStatusDraft: { label: 'Move to drafts', action: 'setStatus', value: 'Draft' },
  archive: { label: 'Archive', danger: true },
};

function describe(key, value, count) {
  const products = `${count} ${count === 1 ? 'product' : 'products'}`;
  const amount = Number(value);
  switch (key) {
    case 'setPrice': return `Set the price of ${products} to ${formatPrice(amount)}.`;
    case 'adjustPricePercent': return `${amount > 0 ? 'Increase' : 'Decrease'} the price of ${products} by ${Math.abs(amount)}%. Prices are rounded to 2 decimal places.`;
    case 'setStock': return `Set stock for ${products} to ${amount}.`;
    case 'adjustStock': return `${amount > 0 ? 'Add' : 'Remove'} ${Math.abs(amount)} ${amount > 0 ? 'to' : 'from'} the stock of ${products}. Stock never goes below 0.`;
    case 'setStatusActive': return `Publish ${products}. Active products appear on your storefront.`;
    case 'setStatusDraft': return `Move ${products} to drafts. Drafts are hidden from your storefront.`;
    case 'archive': return `Archive ${products}. They will be hidden from your storefront and product list. You can restore them later.`;
    default: return '';
  }
}

function validate(key, raw) {
  const config = ACTIONS[key];
  if (!config?.input) return '';
  if (raw === '' || raw === null) return 'Enter a value.';
  const number = Number(raw);
  if (!Number.isFinite(number)) return 'Enter a number.';
  if (key === 'setPrice' && number < 0) return 'Price cannot be negative.';
  if (key === 'adjustPricePercent' && (number < -90 || number > 500 || number === 0)) return 'Enter a percentage between -90 and 500.';
  if (key === 'setStock' && (!Number.isInteger(number) || number < 0)) return 'Enter a whole number of 0 or more.';
  if (key === 'adjustStock' && (!Number.isInteger(number) || number === 0)) return 'Enter a whole number such as 5 or -3.';
  return '';
}

export default function BulkActions({ selected, onClear, onDone, onExport, exporting }) {
  const [actionKey, setActionKey] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const count = selected.length;
  const config = ACTIONS[actionKey];

  function review(event) {
    event.preventDefault();
    if (!actionKey) {
      setError('Choose an action.');
      return;
    }
    const problem = validate(actionKey, value);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setConfirming(true);
  }

  async function apply() {
    setSaving(true);
    setError('');
    try {
      const result = await bulkUpdateProducts({
        ids: selected.map((item) => item.id),
        action: config.action || actionKey,
        value: config.value ?? (config.input ? Number(value) : undefined),
      });
      setConfirming(false);
      setActionKey('');
      setValue('');
      onDone(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form className="bulk-bar" onSubmit={review} aria-label="Bulk product actions">
        <div className="bulk-count">
          <strong>{count} selected</strong>
          <button className="text-button" type="button" onClick={onClear}>Clear</button>
        </div>
        <div className="bulk-controls">
          <select
            className="filter-select"
            aria-label="Bulk action"
            value={actionKey}
            onChange={(event) => {
              setActionKey(event.target.value);
              setValue('');
              setError('');
            }}
          >
            <option value="">Choose an action</option>
            {Object.entries(ACTIONS).map(([key, item]) => (
              <option key={key} value={key}>{item.label}</option>
            ))}
          </select>
          {config?.input ? (
            <input
              className="bulk-value"
              type="number"
              inputMode="decimal"
              aria-label={config.label}
              placeholder={typeof config.placeholder === 'function' ? config.placeholder() : config.placeholder}
              step={config.step}
              min={config.min}
              max={config.max}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          ) : null}
          <button className={config?.danger ? 'danger tiny' : 'primary tiny'} type="submit">Review</button>
          <button className="secondary tiny" type="button" onClick={onExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export selected'}
          </button>
        </div>
        {error && !confirming ? <p className="form-error bulk-error" role="alert">{error}</p> : null}
      </form>

      {confirming ? (
        <div className="modal-backdrop">
          <div className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-confirm-title">
            <p className="eyebrow">BULK UPDATE</p>
            <h2 id="bulk-confirm-title">{config.label}?</h2>
            <p className="muted">{describe(actionKey, value, count)}</p>
            <ul className="bulk-confirm-list">
              {selected.slice(0, 6).map((item) => <li key={item.id}>{item.name}</li>)}
              {count > 6 ? <li>and {count - 6} more</li> : null}
            </ul>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="modal-actions">
              <button className="secondary" type="button" disabled={saving} onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button className={config.danger ? 'danger' : 'primary'} type="button" disabled={saving} onClick={apply}>
                {saving ? 'Applying...' : 'Apply to selected'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

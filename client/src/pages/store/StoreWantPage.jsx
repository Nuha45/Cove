import { useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { createStoreWant } from '../../services/storeService';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  request: '',
  quantity: '',
  notes: '',
};

export default function StoreWantPage() {
  const { slug } = useParams();
  const { business } = useOutletContext();
  const shopName = business?.name || 'the shop';
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function clientErrors() {
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Please enter your name.';
    if (!/^[+0-9][0-9\s()-]{6,19}$/.test(form.phone.trim())) {
      next.phone = 'Please enter a valid phone number.';
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'Please enter a valid email.';
    }
    if (form.request.trim().length < 2) next.request = 'Please tell us what you are looking for.';
    if (form.quantity !== '') {
      const qty = Number(form.quantity);
      if (!Number.isInteger(qty) || qty < 1) next.quantity = 'Quantity must be a whole number from 1 upwards.';
    }
    return next;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = clientErrors();
    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      await createStoreWant(slug, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        request: form.request.trim(),
        quantity: form.quantity === '' ? undefined : Number(form.quantity),
        notes: form.notes.trim(),
      });
      setDone(true);
    } catch (err) {
      setErrors(getFieldErrors(err));
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="store-want">
        <Link className="back-link" to={`/store/${slug}`}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to shop
        </Link>
        <div className="store-want-success">
          <CheckCircle2 size={36} aria-hidden="true" />
          <p className="eyebrow">REQUEST RECEIVED</p>
          <h1>Thanks — {shopName} has your request.</h1>
          <p>
            They will review it and follow up if they can help.
            This does not guarantee the item will be available.
          </p>
          <Link className="primary" to={`/store/${slug}`}>Continue shopping</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="store-want">
      <Link className="back-link" to={`/store/${slug}`}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to shop
      </Link>

      <header className="store-want-intro">
        <p className="eyebrow">CUSTOM REQUEST</p>
        <h1>Can&apos;t find what you&apos;re looking for?</h1>
        <p>
          Tell {shopName} what you need. Keep it short — they will follow up if they can help.
        </p>
      </header>

      <form className="store-want-form" onSubmit={handleSubmit} noValidate>
        {formError ? <p className="form-error">{formError}</p> : null}

        <fieldset className="store-want-section">
          <legend>About you</legend>
          <div className="form-grid">
            <label className="wide">
              Your name
              <input
                name="name"
                autoComplete="name"
                value={form.name}
                onChange={update}
                required
                minLength={2}
                maxLength={80}
              />
              {errors.name ? <span className="field-error">{errors.name}</span> : null}
            </label>
            <label>
              Phone
              <input
                name="phone"
                autoComplete="tel"
                inputMode="tel"
                value={form.phone}
                onChange={update}
                required
                placeholder="98765 43210"
              />
              {errors.phone ? <span className="field-error">{errors.phone}</span> : null}
            </label>
            <label>
              Email <span className="hint-inline">(optional)</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={update}
              />
              {errors.email ? <span className="field-error">{errors.email}</span> : null}
            </label>
          </div>
        </fieldset>

        <fieldset className="store-want-section">
          <legend>Your request</legend>
          <div className="form-grid">
            <label className="wide">
              What are you looking for?
              <textarea
                name="request"
                value={form.request}
                onChange={update}
                required
                maxLength={500}
                rows={4}
                placeholder="Example: a silver version of the pearl necklace"
              />
              {errors.request ? <span className="field-error">{errors.request}</span> : null}
            </label>
            <label>
              Quantity <span className="hint-inline">(optional)</span>
              <input
                name="quantity"
                inputMode="numeric"
                value={form.quantity}
                onChange={update}
                placeholder="1"
              />
              {errors.quantity ? <span className="field-error">{errors.quantity}</span> : null}
            </label>
            <label className="wide">
              Extra notes <span className="hint-inline">(optional)</span>
              <textarea
                name="notes"
                value={form.notes}
                onChange={update}
                maxLength={500}
                rows={3}
                placeholder="Colour, size, date needed..."
              />
              {errors.notes ? <span className="field-error">{errors.notes}</span> : null}
            </label>
          </div>
        </fieldset>

        <div className="store-want-actions">
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? 'Sending...' : 'Send request'}
          </button>
          <p className="muted">No payment is taken here. The shop will contact you if they can help.</p>
        </div>
      </form>
    </div>
  );
}

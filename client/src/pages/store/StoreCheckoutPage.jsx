import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { createStoreOrder } from '../../services/storeService';
import { formatPrice } from '../../utils/display';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { saveConfirmation } from '../../utils/storefront';

export default function StoreCheckoutPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { business } = useOutletContext();
  const { items, subtotal, clear } = useCart();
  const currency = business?.currency || 'INR';
  const pickupEnabled = business?.pickupEnabled !== false;
  const deliveryEnabled = business?.deliveryEnabled !== false;
  const deliveryFee = deliveryEnabled ? Number(business?.deliveryFee) || 0 : 0;
  const orderingOpen = pickupEnabled || deliveryEnabled;

  const defaultMethod = useMemo(() => {
    if (pickupEnabled) return 'Pickup';
    if (deliveryEnabled) return 'Delivery';
    return 'Pickup';
  }, [pickupEnabled, deliveryEnabled]);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    deliveryMethod: defaultMethod,
    deliveryAddress: '',
    notes: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm((current) => {
      if (
        (current.deliveryMethod === 'Pickup' && pickupEnabled)
        || (current.deliveryMethod === 'Delivery' && deliveryEnabled)
      ) {
        return current;
      }
      return { ...current, deliveryMethod: defaultMethod };
    });
  }, [defaultMethod, pickupEnabled, deliveryEnabled]);

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  const estimatedFee = form.deliveryMethod === 'Delivery' ? deliveryFee : 0;
  const estimatedTotal = subtotal + estimatedFee;

  function clientErrors() {
    const next = {};
    if (form.name.trim().length < 2) next['customer.name'] = 'Please enter your name.';
    if (!/^[+0-9][0-9\s()-]{6,19}$/.test(form.phone.trim())) {
      next['customer.phone'] = 'Please enter a valid phone number.';
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next['customer.email'] = 'Please enter a valid email.';
    }
    if (!items.length) next.items = 'Your cart is empty.';
    if (!orderingOpen) next.deliveryMethod = 'This shop is not accepting orders right now.';
    if (form.deliveryMethod === 'Pickup' && !pickupEnabled) {
      next.deliveryMethod = 'Pickup is not available for this shop.';
    }
    if (form.deliveryMethod === 'Delivery' && !deliveryEnabled) {
      next.deliveryMethod = 'Delivery is not available for this shop.';
    }
    if (form.deliveryMethod === 'Delivery' && form.deliveryAddress.trim().length < 5) {
      next.deliveryAddress = 'Please enter a delivery address.';
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
      const result = await createStoreOrder(slug, {
        customer: {
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
        },
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        deliveryMethod: form.deliveryMethod,
        deliveryAddress: form.deliveryMethod === 'Delivery' ? form.deliveryAddress.trim() : undefined,
        notes: form.notes.trim(),
      });

      saveConfirmation(slug, result);
      clear();
      navigate(`/store/${slug}/order/${result.order.orderNumber}`, {
        replace: true,
        state: { confirmation: result },
      });
    } catch (err) {
      setErrors(getFieldErrors(err));
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!items.length) {
    return (
      <div className="store-panel">
        <h1>Checkout</h1>
        <p>Your cart is empty. Add a product before checking out.</p>
        <Link className="primary" to={`/store/${slug}`}>Browse products</Link>
      </div>
    );
  }

  if (!orderingOpen) {
    return (
      <div className="store-panel">
        <h1>Checkout unavailable</h1>
        <p>This shop is not accepting orders right now. Pickup and delivery are both turned off.</p>
        <Link className="primary" to={`/store/${slug}`}>Back to shop</Link>
      </div>
    );
  }

  return (
    <div className="store-checkout">
      <Link className="back-link" to={`/store/${slug}/cart`}>
        <ArrowLeft size={16} /> Cart
      </Link>
      <h1>Checkout</h1>
      <p className="muted">Tell the seller how to reach you. Payment stays pending until they confirm it.</p>

      <form className="store-checkout-grid" onSubmit={handleSubmit} noValidate>
        <section className="store-card">
          {formError ? <p className="form-error">{formError}</p> : null}
          {errors.items ? <p className="form-error">{errors.items}</p> : null}
          <div className="form-grid">
            <label className="wide">
              Your name
              <input name="name" autoComplete="name" value={form.name} onChange={update} required minLength={2} maxLength={80} />
              {errors['customer.name'] ? <span className="field-error">{errors['customer.name']}</span> : null}
            </label>
            <label>
              Phone
              <input name="phone" autoComplete="tel" inputMode="tel" value={form.phone} onChange={update} required placeholder="98765 43210" />
              {errors['customer.phone'] ? <span className="field-error">{errors['customer.phone']}</span> : null}
            </label>
            <label>
              Email <span className="hint-inline">(optional)</span>
              <input name="email" type="email" autoComplete="email" value={form.email} onChange={update} />
              {errors['customer.email'] ? <span className="field-error">{errors['customer.email']}</span> : null}
            </label>
            <label className="wide">
              How should we get this to you?
              <select name="deliveryMethod" value={form.deliveryMethod} onChange={update}>
                {pickupEnabled ? <option value="Pickup">Pickup</option> : null}
                {deliveryEnabled ? <option value="Delivery">Delivery</option> : null}
              </select>
              {errors.deliveryMethod ? <span className="field-error">{errors.deliveryMethod}</span> : null}
            </label>
            {form.deliveryMethod === 'Delivery' ? (
              <label className="wide">
                Delivery address
                <textarea name="deliveryAddress" autoComplete="street-address" value={form.deliveryAddress} onChange={update} maxLength={200} />
                {errors.deliveryAddress ? <span className="field-error">{errors.deliveryAddress}</span> : null}
              </label>
            ) : null}
            <label className="wide">
              Notes <span className="hint-inline">(optional)</span>
              <textarea name="notes" value={form.notes} onChange={update} maxLength={500} placeholder="Colour, size, or anything the seller should know" />
            </label>
          </div>
        </section>

        <aside className="store-card store-checkout-summary">
          <h2>Order summary</h2>
          {items.map((item) => (
            <div className="store-summary-line" key={item.productId}>
              <span>{item.name} × {item.quantity}</span>
              <strong>{formatPrice(item.price * item.quantity, currency)}</strong>
            </div>
          ))}
          <div className="totals">
            <div><span>Estimated subtotal</span><span>{formatPrice(subtotal, currency)}</span></div>
            <div>
              <span>Delivery fee</span>
              <span>{formatPrice(estimatedFee, currency)}</span>
            </div>
            <div className="totals-total"><span>Estimated total</span><strong>{formatPrice(estimatedTotal, currency)}</strong></div>
          </div>
          <p className="muted">The shop confirms the final amount. Payment remains pending after you place this order.</p>
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? 'Placing order...' : 'Place order'}
          </button>
        </aside>
      </form>
    </div>
  );
}

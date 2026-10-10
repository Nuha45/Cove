import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { createStoreOrder, getStoreProduct } from '../../services/storeService';
import { formatPrice } from '../../utils/display';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { enabledCheckoutMethods, paymentMethodIcon } from '../../utils/payments';
import { saveConfirmation } from '../../utils/storefront';
import { EMPTY_ADDRESS, addressErrors, formatAddress } from '../../utils/address';
import StorePaymentDetails from './StorePaymentDetails';
import DeliveryEstimate from '../../components/storefront/DeliveryEstimate';

function newCheckoutKey() {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const PRICE_CHECK_TIMEOUT_MS = 8000;

// The current product, null when the shop no longer sells it, or undefined when it could not be checked.
function latestProduct(slug, productId) {
  const lookup = getStoreProduct(slug, productId)
    .then((result) => result?.product)
    .catch((err) => (err?.response?.status === 404 ? null : undefined));
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve(undefined), PRICE_CHECK_TIMEOUT_MS);
  });
  return Promise.race([lookup, timeout]);
}

function cartChangeMessages({ priceChanged, removed, reduced }) {
  return [
    priceChanged.length ? `Price updated: ${priceChanged.join(', ')}.` : '',
    removed.length ? `No longer available, removed: ${removed.join(', ')}.` : '',
    reduced.length ? `Quantity lowered to what is in stock: ${reduced.join(', ')}.` : '',
  ].filter(Boolean);
}

export default function StoreCheckoutPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { business } = useOutletContext();
  const { items, subtotal, clear, syncItems } = useCart();
  const currency = business?.currency || 'INR';
  const pickupEnabled = business?.pickupEnabled !== false;
  const deliveryEnabled = business?.deliveryEnabled !== false;
  const deliveryFee = deliveryEnabled ? Number(business?.deliveryFee) || 0 : 0;
  const orderingOpen = pickupEnabled || deliveryEnabled;
  const payments = business?.payments;

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
    ...EMPTY_ADDRESS,
    city: business?.city || '',
    notes: '',
    paymentMethod: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Reused for retries of this checkout so a lost response can never place the order twice.
  const [checkoutKey] = useState(newCheckoutKey);
  const errorRef = useRef(null);
  // The cart keeps the price seen when an item was added; the total shown here must match what the order charges.
  const [checkingPrices, setCheckingPrices] = useState(items.length > 0);
  const [cartChanges, setCartChanges] = useState([]);
  const cartAtOpen = useRef({ items, syncItems });

  useEffect(() => {
    let active = true;
    const ids = cartAtOpen.current.items.map((item) => item.productId);
    if (!ids.length) return undefined;
    Promise.all(ids.map((id) => latestProduct(slug, id))).then((products) => {
      if (!active) return;
      const latest = {};
      products.forEach((product, index) => {
        if (product !== undefined) latest[ids[index]] = product;
      });
      setCartChanges(cartChangeMessages(cartAtOpen.current.syncItems(latest)));
      setCheckingPrices(false);
    });
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (formError && typeof errorRef.current?.scrollIntoView === 'function') {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [formError]);

  const paymentOptions = useMemo(
    () => enabledCheckoutMethods(payments, form.deliveryMethod, currency),
    [payments, form.deliveryMethod, currency]
  );

  useEffect(() => {
    setForm((current) => {
      let next = current;
      if (
        !((current.deliveryMethod === 'Pickup' && pickupEnabled)
          || (current.deliveryMethod === 'Delivery' && deliveryEnabled))
      ) {
        next = { ...next, deliveryMethod: defaultMethod };
      }
      return next;
    });
  }, [defaultMethod, pickupEnabled, deliveryEnabled]);

  useEffect(() => {
    setForm((current) => {
      if (!paymentOptions.length) {
        return current.paymentMethod ? { ...current, paymentMethod: '' } : current;
      }
      if (paymentOptions.some((option) => option.value === current.paymentMethod)) {
        return current;
      }
      return { ...current, paymentMethod: paymentOptions[0].value };
    });
  }, [paymentOptions]);

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  const estimatedFee = form.deliveryMethod === 'Delivery' ? deliveryFee : 0;
  const estimatedTotal = subtotal + estimatedFee;
  const selectedPayment = paymentOptions.find((option) => option.value === form.paymentMethod);

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
    if (form.deliveryMethod === 'Delivery') {
      Object.assign(next, addressErrors(form, { requirePostalCode: currency === 'INR' }));
    }
    if (paymentOptions.length && !form.paymentMethod) {
      next.paymentMethod = 'Please choose how you will pay.';
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
        deliveryAddress: form.deliveryMethod === 'Delivery' ? formatAddress(form) : undefined,
        notes: form.notes.trim(),
        paymentMethod: form.paymentMethod || undefined,
        checkoutKey,
      });

      try {
        saveConfirmation(slug, result);
      } catch {
        // Storage can be full or blocked; the confirmation link still works.
      }
      clear();
      const token = result.confirmationToken
        ? `?c=${encodeURIComponent(result.confirmationToken)}`
        : '';
      navigate(`/store/${slug}/order/${result.order.orderNumber}${token}`, {
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
        {cartChanges.map((message) => <p className="form-notice" role="status" key={message}>{message}</p>)}
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
      <p className="muted">
        Ordering from <strong>{business?.name || 'this shop'}</strong>. You pay the seller directly —
        Cove does not collect or automatically verify payment.
      </p>

      <form className="store-checkout-grid" onSubmit={handleSubmit} noValidate>
        <section className="store-card">
          {formError ? <p className="form-error" role="alert" ref={errorRef}>{formError}</p> : null}
          {errors.items ? <p className="form-error" role="alert">{errors.items}</p> : null}
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
              <fieldset className="wide store-address">
                <legend>Delivery address</legend>
                <p className="muted store-address-hint">
                  Add enough detail for the seller to find you without calling.
                </p>
                <div className="store-address-grid">
                  <label className="wide">
                    House / flat no. and building
                    <input
                      name="addressLine1"
                      autoComplete="address-line1"
                      value={form.addressLine1}
                      onChange={update}
                      maxLength={100}
                      placeholder="Flat 4B, Sea View Apartments"
                    />
                    {errors.addressLine1 ? <span className="field-error">{errors.addressLine1}</span> : null}
                  </label>
                  <label className="wide">
                    Street, area or locality
                    <input
                      name="addressLine2"
                      autoComplete="address-line2"
                      value={form.addressLine2}
                      onChange={update}
                      maxLength={100}
                      placeholder="Sector 17, Vashi"
                    />
                    {errors.addressLine2 ? <span className="field-error">{errors.addressLine2}</span> : null}
                  </label>
                  <label className="wide">
                    Landmark <span className="hint-inline">(optional)</span>
                    <input
                      name="landmark"
                      value={form.landmark}
                      onChange={update}
                      maxLength={80}
                      placeholder="Near Inorbit Mall"
                    />
                  </label>
                  <label>
                    City
                    <input
                      name="city"
                      autoComplete="address-level2"
                      value={form.city}
                      onChange={update}
                      maxLength={60}
                      placeholder="Navi Mumbai"
                    />
                    {errors.city ? <span className="field-error">{errors.city}</span> : null}
                  </label>
                  <label>
                    {currency === 'INR' ? 'Pincode' : (
                      <>Postal code <span className="hint-inline">(optional)</span></>
                    )}
                    <input
                      name="postalCode"
                      autoComplete="postal-code"
                      inputMode={currency === 'INR' ? 'numeric' : 'text'}
                      value={form.postalCode}
                      onChange={update}
                      maxLength={10}
                      placeholder={currency === 'INR' ? '400703' : ''}
                    />
                    {errors.postalCode ? <span className="field-error">{errors.postalCode}</span> : null}
                  </label>
                </div>
                {errors.deliveryAddress ? <span className="field-error">{errors.deliveryAddress}</span> : null}
              </fieldset>
            ) : null}
            {form.deliveryMethod === 'Delivery' && business?.deliveryEstimate ? (
              <DeliveryEstimate className="wide" estimate={business.deliveryEstimate} />
            ) : null}

            <div className="wide store-pay-section">
              <div className="store-pay-section-head">
                <strong>How will you pay {business?.name || 'the seller'}?</strong>
                <p className="muted">
                  Choose one method, then place the order. You will pay using the details shown on the
                  confirmation page — this button only places the order.
                </p>
              </div>
              {!paymentOptions.length ? (
                <div className="store-pay-pending">
                  <p>
                    This shop has not configured online payment details yet. You can still place the order —
                    payment will stay pending until the seller confirms how to pay.
                  </p>
                </div>
              ) : (
                <div className="store-pay-options" role="radiogroup" aria-label="Payment method">
                  {paymentOptions.map((option) => {
                    const Icon = paymentMethodIcon(option.value);
                    const selected = form.paymentMethod === option.value;
                    return (
                      <label
                        className={`store-pay-option ${selected ? 'selected' : ''}`}
                        key={option.value}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={option.value}
                          checked={selected}
                          onChange={update}
                        />
                        <span className="store-pay-option-icon" aria-hidden="true">
                          <Icon size={18} />
                        </span>
                        <span className="store-pay-option-copy">
                          <strong>{option.label}</strong>
                          <small>{option.hint}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {errors.paymentMethod ? <span className="field-error">{errors.paymentMethod}</span> : null}

              {selectedPayment ? (
                <StorePaymentDetails
                  method={form.paymentMethod}
                  payments={payments}
                  businessName={business?.name || 'the seller'}
                  amount={estimatedTotal}
                  currency={currency}
                  compact
                />
              ) : null}
            </div>

            <label className="wide">
              Notes <span className="hint-inline">(optional)</span>
              <textarea name="notes" value={form.notes} onChange={update} maxLength={500} placeholder="Colour, size, or anything the seller should know" />
            </label>
          </div>
        </section>

        <aside className="store-card store-checkout-summary">
          <h2>Order summary</h2>
          <p className="muted">Seller: {business?.name}</p>
          {cartChanges.length ? (
            <div className="form-notice" role="status">
              <strong>Your cart was updated to the shop&apos;s current details.</strong>
              {cartChanges.map((message) => <p key={message}>{message}</p>)}
            </div>
          ) : null}
          {items.map((item) => (
            <div className="store-summary-line" key={item.productId}>
              <span>{item.name} × {item.quantity}</span>
              <strong>{formatPrice(item.price * item.quantity, currency)}</strong>
            </div>
          ))}
          <div className="totals">
            <div><span>Subtotal</span><span>{formatPrice(subtotal, currency)}</span></div>
            <div>
              <span>Delivery fee</span>
              <span>{formatPrice(estimatedFee, currency)}</span>
            </div>
            <div className="totals-total"><span>Total to pay seller</span><strong>{formatPrice(estimatedTotal, currency)}</strong></div>
          </div>
          <p className="muted">
            After you place the order, you will see payment details on the next page. Payment stays
            pending until the seller confirms they received it.
          </p>
          <button className="primary" type="submit" disabled={submitting || checkingPrices}>
            {submitting ? 'Placing order...' : checkingPrices ? 'Checking prices...' : 'Place order'}
          </button>
          <p className="muted store-checkout-legal">
            Your order details will be shared with {business?.name || 'this shop'} so they can process and fulfil your
            order. For questions about this order, including returns or refunds, please contact the shop using the
            details shown on its storefront. By placing your order, you agree to Cove&apos;s{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a> and acknowledge the{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
          </p>
        </aside>
      </form>
    </div>
  );
}

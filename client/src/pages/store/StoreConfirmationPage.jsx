import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import { getStoreOrderConfirmation, submitStorePaymentReference } from '../../services/storeService';
import { formatOrderDate, formatPrice } from '../../utils/display';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { mediaUrl } from '../../utils/media';
import { paymentMethodLabel } from '../../utils/payments';
import { loadConfirmation, saveConfirmation } from '../../utils/storefront';
import { PAYMENT_TONE, STATUS_TONE } from '../../utils/orders';

export default function StoreConfirmationPage() {
  const { slug, orderNumber } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('c') || '';
  const [data, setData] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [reference, setReference] = useState('');
  const [refError, setRefError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [savingRef, setSavingRef] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const fromState = location.state?.confirmation;
      if (fromState?.order?.orderNumber === orderNumber) {
        if (!cancelled) {
          setData(fromState);
          setReference(fromState.order.paymentReference || '');
          setLoadState('ready');
        }
        return;
      }

      const cached = loadConfirmation(slug, orderNumber);
      if (cached?.order?.orderNumber === orderNumber && !token) {
        if (!cancelled) {
          setData(cached);
          setReference(cached.order.paymentReference || '');
          setLoadState('ready');
        }
        return;
      }

      if (!token) {
        if (!cancelled) {
          setData(null);
          setLoadState('missing');
        }
        return;
      }

      try {
        const result = await getStoreOrderConfirmation(slug, token);
        if (cancelled) return;
        if (result?.order?.orderNumber !== orderNumber) {
          setData(null);
          setLoadState('missing');
          return;
        }
        saveConfirmation(slug, result);
        setData(result);
        setReference(result.order.paymentReference || '');
        setLoadState('ready');
      } catch {
        if (cancelled) return;
        if (cached?.order?.orderNumber === orderNumber) {
          setData(cached);
          setReference(cached.order.paymentReference || '');
          setLoadState('ready');
          return;
        }
        setData(null);
        setLoadState('missing');
      }
    }

    setLoadState('loading');
    load();
    return () => {
      cancelled = true;
    };
  }, [slug, orderNumber, token, location.state]);

  async function handleReferenceSubmit(event) {
    event.preventDefault();
    if (!token) {
      setRefError('Open this page from your confirmation link to submit a payment reference.');
      return;
    }
    setSavingRef(true);
    setRefError('');
    setFieldErrors({});
    try {
      const result = await submitStorePaymentReference(slug, token, {
        paymentReference: reference.trim(),
      });
      saveConfirmation(slug, result);
      setData(result);
      setReference(result.order.paymentReference || '');
    } catch (err) {
      setFieldErrors(getFieldErrors(err));
      setRefError(getErrorMessage(err));
    } finally {
      setSavingRef(false);
    }
  }

  if (loadState === 'loading') {
    return <div className="store-status">Loading your order...</div>;
  }

  if (loadState === 'missing' || !data?.order || data.order.orderNumber !== orderNumber) {
    return (
      <div className="store-panel">
        <h1>Order confirmation</h1>
        <p>We could not find that confirmation. If you just placed an order, keep your order number and confirmation link safe.</p>
        <p><strong>{orderNumber}</strong></p>
        <Link className="primary" to={`/store/${slug}`}>Back to shop</Link>
      </div>
    );
  }

  const { order, business } = data;
  const currency = business?.currency || 'INR';
  const payments = business?.payments;
  const canSubmitReference = ['Payment Pending', 'Pending', 'Payment Submitted'].includes(order.paymentStatus)
    && order.status !== 'Cancelled'
    && Boolean(token);
  const hasConfigured = payments?.hasConfiguredMethod;

  return (
    <div className="store-confirm">
      <div className="store-confirm-banner">
        <CheckCircle2 size={28} />
        <div>
          <p className="eyebrow">ORDER PLACED</p>
          <h1>Thank you, {order.customer.name}!</h1>
          <p>Your order was received by <strong>{business?.name || 'the shop'}</strong>. Payment is not complete until the seller confirms it.</p>
        </div>
      </div>

      <section className="store-card">
        <div className="store-confirm-meta">
          <div>
            <span>Order</span>
            <strong>{order.orderNumber}</strong>
          </div>
          <div>
            <span>Placed</span>
            <strong>{formatOrderDate(order.createdAt)}</strong>
          </div>
          <div>
            <span>Payment</span>
            <Badge tone={PAYMENT_TONE[order.paymentStatus] || 'neutral'}>{order.paymentStatus}</Badge>
          </div>
          <div>
            <span>Status</span>
            <Badge tone={STATUS_TONE[order.status] || 'neutral'}>{order.status}</Badge>
          </div>
        </div>

        <h2>Amount due to {business?.name || 'the seller'}</h2>
        <div className="totals">
          <div><span>Subtotal</span><span>{formatPrice(order.subtotal, currency)}</span></div>
          <div><span>Delivery fee</span><span>{formatPrice(order.deliveryFee, currency)}</span></div>
          <div className="totals-total"><span>Total</span><strong>{formatPrice(order.total, currency)}</strong></div>
        </div>

        <h2>Pay {business?.name || 'the seller'}</h2>
        {!hasConfigured ? (
          <div className="store-pay-pending">
            <p>
              This shop has not published payment details yet. Message {business?.name || 'the seller'}
              {business?.phone ? ` at ${business.phone}` : ''} about how to pay.
              Your order remains payment pending.
            </p>
          </div>
        ) : null}

        {order.paymentMethod ? (
          <p><strong>Method:</strong> {paymentMethodLabel(order.paymentMethod, currency)}</p>
        ) : null}

        {order.paymentMethod === 'qr' && payments?.paymentQrImage ? (
          <div className="store-pay-panel">
            <p>Scan and pay <strong>{formatPrice(order.total, currency)}</strong>.</p>
            <img src={mediaUrl(payments.paymentQrImage)} alt={`${business?.name} payment QR`} />
          </div>
        ) : null}
        {order.paymentMethod === 'payment_link' && payments?.paymentLink ? (
          <div className="store-pay-panel">
            <p>Pay <strong>{formatPrice(order.total, currency)}</strong> with the seller&apos;s link.</p>
            <a className="secondary" href={payments.paymentLink} target="_blank" rel="noreferrer">
              Open payment link
            </a>
          </div>
        ) : null}
        {order.paymentMethod === 'instructions' && payments?.paymentInstructions ? (
          <div className="store-pay-panel">
            <p>Pay <strong>{formatPrice(order.total, currency)}</strong> using these instructions:</p>
            <p>{payments.paymentInstructions}</p>
          </div>
        ) : null}
        {order.paymentMethod === 'pay_on_pickup' ? (
          <div className="store-pay-panel">
            <p>Pay on pickup. Bring <strong>{formatPrice(order.total, currency)}</strong> when you collect your order.</p>
          </div>
        ) : null}

        <p className="muted">
          A payment reference helps the seller match your transfer. Submitting a reference does not mark the order as paid.
        </p>

        {canSubmitReference ? (
          <form className="form-grid" onSubmit={handleReferenceSubmit}>
            <label className="wide">
              Payment reference <span className="hint-inline">(optional)</span>
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={120}
                placeholder="UPI reference, UTR, or transaction ID"
              />
              {fieldErrors.paymentReference ? <span className="field-error">{fieldErrors.paymentReference}</span> : null}
            </label>
            {refError ? <p className="form-error wide">{refError}</p> : null}
            <button className="secondary" type="submit" disabled={savingRef}>
              {savingRef ? 'Saving...' : order.paymentStatus === 'Payment Submitted' ? 'Update reference' : 'I have paid / submit reference'}
            </button>
          </form>
        ) : null}

        {order.paymentReference ? (
          <p className="muted">
            Submitted reference: <strong>{order.paymentReference}</strong>
            {order.paymentReferenceSubmittedAt
              ? ` · ${formatOrderDate(order.paymentReferenceSubmittedAt)}`
              : ''}
          </p>
        ) : null}

        <h2>Items</h2>
        {order.items.map((item) => (
          <div className="store-summary-line" key={`${item.name}-${item.quantity}-${item.price}`}>
            <span>{item.name} × {item.quantity}</span>
            <strong>{formatPrice(item.subtotal, currency)}</strong>
          </div>
        ))}

        <h2>Fulfilment</h2>
        <p><strong>{order.deliveryMethod}</strong></p>
        {order.deliveryMethod === 'Delivery' ? <p>{order.deliveryAddress}</p> : <p>The seller will share pickup details with you.</p>}
        {order.notes ? <p className="muted">Notes: {order.notes}</p> : null}
      </section>

      <Link className="primary" to={`/store/${slug}`}>Continue shopping</Link>
    </div>
  );
}

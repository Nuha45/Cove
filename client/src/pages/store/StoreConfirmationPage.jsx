import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, CircleAlert, CircleCheck, Clock3 } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import { getStoreOrderConfirmation, submitStorePaymentReference } from '../../services/storeService';
import { formatOrderDate, formatPrice } from '../../utils/display';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { paymentMethodLabel, paymentStatusCustomerCopy } from '../../utils/payments';
import { loadConfirmation, saveConfirmation } from '../../utils/storefront';
import { PAYMENT_TONE, STATUS_TONE } from '../../utils/orders';
import StorePaymentDetails from './StorePaymentDetails';

function PaymentStatusCallout({ status }) {
  const copy = paymentStatusCustomerCopy(status);
  let Icon = Clock3;
  let tone = 'pending';
  if (status === 'Paid') {
    Icon = CircleCheck;
    tone = 'paid';
  } else if (status === 'Payment Submitted') {
    Icon = CircleAlert;
    tone = 'submitted';
  } else if (status === 'Payment Rejected') {
    Icon = CircleAlert;
    tone = 'rejected';
  }

  return (
    <div className={`store-pay-status store-pay-status-${tone}`}>
      <Icon size={20} aria-hidden="true" />
      <div>
        <strong>{status}</strong>
        <p>{copy}</p>
      </div>
    </div>
  );
}

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

    function show(result) {
      setData(result);
      setReference(result.order.paymentReference || '');
      setLoadState('ready');
    }

    async function load() {
      // Show what we already have straight away, then refresh from the server so a reload
      // never keeps showing an old payment or order status.
      const fromState = location.state?.confirmation;
      const cached = loadConfirmation(slug, orderNumber);
      const local = [fromState, cached].find((item) => item?.order?.orderNumber === orderNumber);
      if (local) show(local);
      else setLoadState('loading');

      if (!token) {
        if (!local) {
          setData(null);
          setLoadState('missing');
        }
        return;
      }

      try {
        const result = await getStoreOrderConfirmation(slug, token);
        if (cancelled) return;
        if (result?.order?.orderNumber !== orderNumber) {
          if (!local) {
            setData(null);
            setLoadState('missing');
          }
          return;
        }
        saveConfirmation(slug, result);
        show(result);
      } catch {
        if (cancelled || local) return;
        setData(null);
        setLoadState('missing');
      }
    }

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
  const isPaid = order.paymentStatus === 'Paid';
  const isCancelled = order.status === 'Cancelled';
  const showPayDetails = Boolean(order.paymentMethod) && !isPaid && !isCancelled;
  const shopName = business?.name || 'the shop';

  return (
    <div className="store-confirm">
      <div className="store-confirm-banner">
        {isCancelled ? <CircleAlert size={28} /> : <CheckCircle2 size={28} />}
        <div>
          <p className="eyebrow">{isCancelled ? 'ORDER CANCELLED' : 'ORDER PLACED'}</p>
          <h1>{isCancelled ? 'This order was cancelled' : order.customer?.name ? `Thank you, ${order.customer.name}!` : 'Thank you for your order!'}</h1>
          <p>
            {isCancelled ? (
              <>
                <strong>{shopName}</strong> cancelled this order, so there is nothing to pay.
                {' '}If you already paid, contact the shop{business?.phone ? ` at ${business.phone}` : ''} about a refund.
              </>
            ) : (
              <>
                Your order was received by <strong>{shopName}</strong>.
                {' '}Next: pay the shop (if you have not already), then optionally share a payment reference.
              </>
            )}
          </p>
        </div>
      </div>

      <section className="store-card store-confirm-overview">
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

        {isCancelled ? null : (
          <>
            <div className="store-confirm-due">
              <span>Amount due to {shopName}</span>
              <strong>{formatPrice(order.total, currency)}</strong>
              {order.paymentMethod ? (
                <small>Method: {paymentMethodLabel(order.paymentMethod, currency)}</small>
              ) : (
                <small>Payment method not selected yet</small>
              )}
            </div>

            <PaymentStatusCallout status={order.paymentStatus} />
          </>
        )}
      </section>

      {isCancelled ? null : (
      <section className="store-card">
        <h2>Next step: pay {shopName}</h2>

        {!hasConfigured ? (
          <div className="store-pay-pending">
            <p>
              This shop has not published payment details yet. Message {shopName}
              {business?.phone ? ` at ${business.phone}` : ''} about how to pay.
              Your order remains payment pending until they confirm.
            </p>
          </div>
        ) : null}

        {showPayDetails ? (
          <StorePaymentDetails
            method={order.paymentMethod}
            payments={payments}
            businessName={business?.name || 'the seller'}
            amount={order.total}
            currency={currency}
            heading="Exact amount due"
            orderNumber={order.orderNumber}
          />
        ) : null}

        {isPaid ? (
          <p className="store-pay-note store-pay-note-success">
            No further payment action is needed. The seller marked this order as paid.
          </p>
        ) : null}

        {canSubmitReference ? (
          <form className="store-pay-reference" onSubmit={handleReferenceSubmit} id="payment-reference">
            <div className="store-pay-reference-head">
              <h3>I&apos;ve paid — share a reference</h3>
              <p>
                After you return from your UPI or banking app, paste the UPI reference, UTR, or
                transaction ID here. This helps {business?.name || 'the seller'} match your transfer —
                it does <strong>not</strong> mark the order as paid by itself, and Cove cannot verify
                the transfer.
              </p>
            </div>
            <label>
              Payment reference
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={120}
                placeholder="e.g. UPI Ref 123456789012"
                autoComplete="off"
              />
              {fieldErrors.paymentReference ? (
                <span className="field-error">{fieldErrors.paymentReference}</span>
              ) : null}
            </label>
            {refError ? <p className="form-error">{refError}</p> : null}
            <button className="secondary" type="submit" disabled={savingRef || !reference.trim()}>
              {savingRef
                ? 'Saving...'
                : order.paymentStatus === 'Payment Submitted'
                  ? 'Update reference'
                  : 'Submit payment reference'}
            </button>
          </form>
        ) : null}

        {order.paymentReference ? (
          <p className="store-pay-submitted-ref">
            Submitted reference: <strong>{order.paymentReference}</strong>
            {order.paymentReferenceSubmittedAt
              ? ` · ${formatOrderDate(order.paymentReferenceSubmittedAt)}`
              : ''}
          </p>
        ) : null}
      </section>
      )}

      <section className="store-card">
        <h2>Order details</h2>
        <div className="totals">
          <div><span>Subtotal</span><span>{formatPrice(order.subtotal, currency)}</span></div>
          <div><span>Delivery fee</span><span>{formatPrice(order.deliveryFee, currency)}</span></div>
          <div className="totals-total"><span>Total</span><strong>{formatPrice(order.total, currency)}</strong></div>
        </div>

        <h3 className="store-confirm-subhead">Items</h3>
        {order.items.map((item) => (
          <div className="store-summary-line" key={`${item.name}-${item.quantity}-${item.price}`}>
            <span>{item.name} × {item.quantity}</span>
            <strong>{formatPrice(item.subtotal, currency)}</strong>
          </div>
        ))}

        <h3 className="store-confirm-subhead">Fulfilment</h3>
        <p><strong>{order.deliveryMethod}</strong></p>
        {order.deliveryMethod === 'Delivery'
          ? <p className="address-block">{order.deliveryAddress}</p>
          : <p>The seller will share pickup details with you.</p>}
        {order.notes ? <p className="muted">Notes: {order.notes}</p> : null}
      </section>

      <Link className="primary" to={`/store/${slug}`}>Continue shopping</Link>
    </div>
  );
}

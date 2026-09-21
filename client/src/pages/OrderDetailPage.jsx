import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import PageIntro from '../components/ui/PageIntro';
import Badge from '../components/ui/Badge';
import { getOrder, updateOrder } from '../services/orderService';
import { formatOrderDate, formatPrice } from '../utils/display';
import { getErrorMessage } from '../utils/errors';
import { NEXT_PAYMENT_STATUSES, NEXT_STATUSES, PAYMENT_TONE, STATUS_TONE } from '../utils/orders';
import { paymentMethodLabel } from '../utils/payments';

export default function OrderDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useOutletContext();
  const [order, setOrder] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [nextStatus, setNextStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rejectNote, setRejectNote] = useState('');

  useEffect(() => {
    if (!location.state?.created) return;
    notify('Order saved.');
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate, notify]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      setLoadError('');
      try {
        const result = await getOrder(id);
        if (cancelled) return;
        setOrder(result.order);
        setNextStatus('');
        setRejectNote('');
        setLoadState('ready');
      } catch (err) {
        if (cancelled) return;
        setLoadError(getErrorMessage(err));
        setLoadState('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function save(input, success) {
    setSaving(true);
    setActionError('');
    try {
      const result = await updateOrder(order.id, input);
      setOrder(result.order);
      setNextStatus('');
      setConfirmCancel(false);
      setRejectNote('');
      notify(success);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const allowed = order ? NEXT_STATUSES[order.status] || [] : [];
  const paymentActions = order ? NEXT_PAYMENT_STATUSES[order.paymentStatus] || [] : [];
  const canMarkPaid = paymentActions.includes('Paid');
  const canReject = paymentActions.includes('Payment Rejected');
  const canReopen = paymentActions.includes('Payment Pending');

  return (
    <>
      <Link className="back-link" to="/orders">
        <ArrowLeft size={16} /> Orders
      </Link>

      {loadState === 'loading' ? (
        <section className="card panel-state">Loading this order...</section>
      ) : null}

      {loadState === 'error' ? (
        <section className="card panel-state">
          <p className="form-error">{loadError}</p>
          <Link className="secondary" to="/orders">Back to orders</Link>
        </section>
      ) : null}

      {loadState === 'ready' && order ? (
        <>
          <PageIntro
            eyebrow={order.orderNumber}
            title={order.customer.name}
            subtitle={formatOrderDate(order.createdAt)}
          />

          <div className="detail-layout">
            <div className="detail-main">
              <section className="card detail-card">
                <h2>Customer</h2>
                <dl className="detail-list">
                  <div>
                    <dt>Name</dt>
                    <dd>
                      {order.customerId ? (
                        <Link className="text-button" to={`/customers/${order.customerId}`}>{order.customer.name}</Link>
                      ) : order.customer.name}
                    </dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{order.customer.phone || '—'}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{order.customer.email || '—'}</dd>
                  </div>
                  <div>
                    <dt>Delivery</dt>
                    <dd>{order.deliveryMethod}</dd>
                  </div>
                  {order.deliveryMethod === 'Delivery' ? (
                    <div className="wide">
                      <dt>Address</dt>
                      <dd>{order.deliveryAddress}</dd>
                    </div>
                  ) : null}
                  <div className="wide">
                    <dt>Notes</dt>
                    <dd>{order.notes || 'No notes'}</dd>
                  </div>
                </dl>
              </section>

              <section className="card detail-card">
                <h2>Payment</h2>
                <p className="muted">Customer payment is manual. A submitted reference is not verified payment.</p>
                <dl className="detail-list">
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <Badge tone={PAYMENT_TONE[order.paymentStatus] || 'neutral'}>{order.paymentStatus}</Badge>
                    </dd>
                  </div>
                  <div>
                    <dt>Method</dt>
                    <dd>{paymentMethodLabel(order.paymentMethod) || '—'}</dd>
                  </div>
                  <div className="wide">
                    <dt>Reference</dt>
                    <dd>{order.paymentReference || '—'}</dd>
                  </div>
                  <div>
                    <dt>Reference submitted</dt>
                    <dd>{order.paymentReferenceSubmittedAt ? formatOrderDate(order.paymentReferenceSubmittedAt) : '—'}</dd>
                  </div>
                  <div>
                    <dt>Verified</dt>
                    <dd>{order.paymentVerifiedAt ? formatOrderDate(order.paymentVerifiedAt) : '—'}</dd>
                  </div>
                  {order.paymentStatus === 'Payment Rejected' && order.paymentRejectionNote ? (
                    <div className="wide">
                      <dt>Rejection note</dt>
                      <dd>{order.paymentRejectionNote}</dd>
                    </div>
                  ) : null}
                </dl>
                {order.paymentEvents?.length ? (
                  <div className="payment-audit">
                    <h3>Payment history</h3>
                    <ul>
                      {order.paymentEvents.map((event, index) => (
                        <li key={`${event.at}-${index}`}>
                          <strong>{event.fromStatus} → {event.toStatus}</strong>
                          <small>
                            {formatOrderDate(event.at)} · {event.actorType}
                            {event.note ? ` · ${event.note}` : ''}
                          </small>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>

              <section className="card detail-card">
                <h2>Items</h2>
                <p className="muted">Prices are saved from when this order was placed.</p>
                <div className="item-list">
                  {order.items.map((item) => (
                    <div className="item-line" key={`${item.productId}-${item.name}`}>
                      <strong>{item.name}</strong>
                      <strong>{formatPrice(item.subtotal)}</strong>
                      <small>{item.quantity} × {formatPrice(item.price)}</small>
                    </div>
                  ))}
                </div>
                <div className="totals">
                  <div><span>Subtotal</span><span>{formatPrice(order.subtotal)}</span></div>
                  <div><span>Delivery fee</span><span>{formatPrice(order.deliveryFee)}</span></div>
                  <div className="totals-total"><span>Total</span><strong>{formatPrice(order.total)}</strong></div>
                </div>
              </section>
            </div>

            <aside className="card detail-card status-panel">
              <h2>Status</h2>
              <div className="status-badges">
                <Badge tone={STATUS_TONE[order.status] || 'neutral'}>{order.status}</Badge>
                <Badge tone={PAYMENT_TONE[order.paymentStatus] || 'neutral'}>{order.paymentStatus}</Badge>
              </div>

              {order.status === 'Cancelled' ? (
                <p className="muted">This order is cancelled. Stock was returned to your products.</p>
              ) : null}
              {order.status === 'Completed' ? (
                <p className="muted">This order is complete and can no longer change status.</p>
              ) : null}

              {allowed.length > 0 ? (
                <label>
                  Next status
                  <select
                    aria-label="Next status"
                    value={nextStatus}
                    onChange={(event) => setNextStatus(event.target.value)}
                    disabled={saving}
                  >
                    <option value="">Choose a status</option>
                    {allowed.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              {actionError ? <p className="form-error">{actionError}</p> : null}

              {allowed.length > 0 ? (
                <button
                  className={nextStatus === 'Cancelled' ? 'danger' : 'primary'}
                  type="button"
                  disabled={!nextStatus || saving}
                  onClick={() => {
                    if (nextStatus === 'Cancelled') {
                      setConfirmCancel(true);
                      return;
                    }
                    save({ status: nextStatus }, `Marked ${nextStatus}.`);
                  }}
                >
                  {saving ? 'Saving...' : 'Update status'}
                </button>
              ) : null}

              <h3>Payment actions</h3>
              <p className="muted">Only mark paid after you have verified the transfer yourself.</p>
              {canMarkPaid ? (
                <button
                  className="primary"
                  type="button"
                  disabled={saving}
                  onClick={() => save({ paymentStatus: 'Paid' }, 'Marked as paid.')}
                >
                  Mark as paid
                </button>
              ) : null}
              {canReject ? (
                <>
                  <label>
                    Rejection note <span className="hint-inline">(optional)</span>
                    <input
                      value={rejectNote}
                      onChange={(event) => setRejectNote(event.target.value)}
                      maxLength={300}
                      placeholder="Wrong amount, missing UTR…"
                    />
                  </label>
                  <button
                    className="danger"
                    type="button"
                    disabled={saving}
                    onClick={() => save(
                      { paymentStatus: 'Payment Rejected', paymentRejectionNote: rejectNote.trim() },
                      'Payment rejected.'
                    )}
                  >
                    Reject payment
                  </button>
                </>
              ) : null}
              {canReopen ? (
                <button
                  className="secondary"
                  type="button"
                  disabled={saving}
                  onClick={() => save({ paymentStatus: 'Payment Pending' }, 'Payment reopened as pending.')}
                >
                  Reopen as pending
                </button>
              ) : null}
            </aside>
          </div>
        </>
      ) : null}

      {confirmCancel && order ? (
        <div className="modal-backdrop">
          <div className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-order-title">
            <p className="eyebrow">CANCEL ORDER</p>
            <h2 id="cancel-order-title">Cancel {order.orderNumber}?</h2>
            <p className="muted">Stock for these items will be returned once. You cannot cancel the same order twice to add extra stock.</p>
            {actionError ? <p className="form-error">{actionError}</p> : null}
            <div className="modal-actions">
              <button className="secondary" type="button" disabled={saving} onClick={() => setConfirmCancel(false)}>
                Keep order
              </button>
              <button className="danger" type="button" disabled={saving} onClick={() => save({ status: 'Cancelled' }, 'Order cancelled. Stock was returned.')}>
                {saving ? 'Cancelling...' : 'Cancel order'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

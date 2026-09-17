import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import PageIntro from '../components/ui/PageIntro';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { getCustomer, listCustomerOrders, updateCustomer } from '../services/customerService';
import { formatOrderDate, formatPrice } from '../utils/display';
import { getErrorMessage, getFieldErrors } from '../utils/errors';
import { PAYMENT_TONE, STATUS_TONE } from '../utils/orders';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const { notify } = useOutletContext();
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [notes, setNotes] = useState('');
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      setLoadError('');
      try {
        const [customerResult, orderResult] = await Promise.all([
          getCustomer(id),
          listCustomerOrders(id, { limit: 12 }),
        ]);
        if (cancelled) return;
        setCustomer(customerResult.customer);
        setNotes(customerResult.customer.notes || '');
        setOrders(orderResult.orders);
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

  async function saveNotes(event) {
    event.preventDefault();
    setSaving(true);
    setSaveError('');
    setFieldErrors({});
    try {
      const result = await updateCustomer(customer.id, { notes });
      setCustomer(result.customer);
      setNotes(result.customer.notes || '');
      notify('Customer note saved.');
    } catch (err) {
      setSaveError(getErrorMessage(err));
      setFieldErrors(getFieldErrors(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Link className="back-link" to="/customers">
        <ArrowLeft size={16} /> Customers
      </Link>

      {loadState === 'loading' ? <section className="card panel-state">Loading this customer...</section> : null}

      {loadState === 'error' ? (
        <section className="card panel-state">
          <p className="form-error">{loadError}</p>
          <Link className="secondary" to="/customers">Back to customers</Link>
        </section>
      ) : null}

      {loadState === 'ready' && customer ? (
        <>
          <PageIntro
            eyebrow="CUSTOMER"
            title={customer.name}
            subtitle={customer.phone || 'No phone on file'}
          />

          <div className="detail-layout">
            <div className="detail-main">
              <section className="card detail-card">
                <h2>Details</h2>
                <dl className="detail-list">
                  <div>
                    <dt>Name</dt>
                    <dd>{customer.name}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{customer.phone || '—'}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{customer.email || '—'}</dd>
                  </div>
                  <div>
                    <dt>Orders</dt>
                    <dd>{customer.totalOrders}</dd>
                  </div>
                  <div>
                    <dt>Total spent</dt>
                    <dd>{formatPrice(customer.totalSpent)}</dd>
                  </div>
                  <div>
                    <dt>Last order</dt>
                    <dd>{customer.lastOrderAt ? formatOrderDate(customer.lastOrderAt) : '—'}</dd>
                  </div>
                </dl>
              </section>

              <section className="card detail-card">
                <h2>Order history</h2>
                {orders.length === 0 ? (
                  <EmptyState title="No orders yet" text="Orders linked to this customer will appear here." />
                ) : (
                  <div className="customer-order-list">
                    {orders.map((order) => (
                      <Link className="customer-order-row" key={order.id} to={`/orders/${order.id}`}>
                        <div>
                          <strong>{order.orderNumber}</strong>
                          <small>{formatOrderDate(order.createdAt)}</small>
                        </div>
                        <Badge tone={STATUS_TONE[order.status] || 'neutral'}>{order.status}</Badge>
                        <Badge tone={PAYMENT_TONE[order.paymentStatus] || 'neutral'}>{order.paymentStatus}</Badge>
                        <strong>{formatPrice(order.total)}</strong>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="card detail-card">
              <h2>Private note</h2>
              <p className="muted">Only you can see this. It never appears on your public storefront.</p>
              <form onSubmit={saveNotes}>
                {saveError ? <p className="form-error">{saveError}</p> : null}
                <label>
                  Notes
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={500}
                    rows={6}
                    placeholder="Prefers gold finish, usually picks up on weekends..."
                  />
                  {fieldErrors.notes ? <span className="field-error">{fieldErrors.notes}</span> : null}
                </label>
                <button className="primary" type="submit" disabled={saving} style={{ marginTop: 12, width: '100%', minHeight: 44 }}>
                  {saving ? 'Saving...' : 'Save note'}
                </button>
              </form>
            </aside>
          </div>
        </>
      ) : null}
    </>
  );
}

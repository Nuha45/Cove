import { useEffect, useState } from 'react';
import { ClipboardList, Plus, Search, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageIntro from '../components/ui/PageIntro';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import StatCard from '../components/ui/StatCard';
import useFilterParam from '../hooks/useFilterParam';
import { listOrders } from '../services/orderService';
import { formatEyebrowDate, formatOrderDate, formatPrice } from '../utils/display';
import { getErrorMessage } from '../utils/errors';
import { itemSummary, ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_TONE, STATUS_TONE } from '../utils/orders';
import { paymentMethodLabel } from '../utils/payments';

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useFilterParam('status', ORDER_STATUSES);
  const [paymentStatus, setPaymentStatus] = useState('');
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      setLoadError('');
      try {
        const result = await listOrders({
          search: query || undefined,
          status: status || undefined,
          paymentStatus: paymentStatus || undefined,
          page,
          limit: 12,
        });
        if (cancelled) return;
        setOrders(result.orders);
        setSummary(result.summary);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        if (result.page !== page) setPage(result.page);
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
  }, [query, status, paymentStatus, page, reloadKey]);

  const emptyBecauseFilter = total === 0 && (query || status || paymentStatus);

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Orders"
        subtitle="Orders placed through your storefront appear here automatically."
        action={
          <Link className="primary" to="/orders/new" aria-label="New order">
            <Plus size={17} /> New order
          </Link>
        }
      />

      {loadState === 'ready' && summary ? (
        <div className="order-stats">
          <StatCard icon={ClipboardList} label="Orders" value={String(summary.total)} change="All time" color="#FFE4D4" />
          <StatCard icon={ClipboardList} label="New" value={String(summary.new)} change="Needs a look" color="#E7F2EC" />
          <StatCard
            icon={WalletCards}
            label="Awaiting payment"
            value={formatPrice(summary.pendingPaymentTotal)}
            change={`${summary.pendingPayment} open`}
            color="#FFF1E4"
          />
        </div>
      ) : null}

      <div className="order-review-filters" role="group" aria-label="Payment review shortcuts">
        <button
          type="button"
          className={`secondary tiny${paymentStatus === 'Payment Submitted' ? ' selected' : ''}`}
          onClick={() => {
            setPaymentStatus((current) => (current === 'Payment Submitted' ? '' : 'Payment Submitted'));
            setPage(1);
          }}
        >
          Needs payment review
        </button>
        <button
          type="button"
          className={`secondary tiny${paymentStatus === 'Payment Pending' ? ' selected' : ''}`}
          onClick={() => {
            setPaymentStatus((current) => (current === 'Payment Pending' ? '' : 'Payment Pending'));
            setPage(1);
          }}
        >
          Payment pending
        </button>
      </div>

      <section className="card table-card">
        <div className="table-tools">
          <div className="search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order, name, or phone"
              aria-label="Search orders"
            />
          </div>
          <div className="tool-filters">
            <select
              className="filter-select"
              aria-label="Filter by status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {ORDER_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select
              className="filter-select"
              aria-label="Filter by payment"
              value={paymentStatus}
              onChange={(event) => {
                setPaymentStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All payments</option>
              {PAYMENT_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>

        {loadState === 'loading' ? <div className="panel-state">Loading your orders...</div> : null}

        {loadState === 'error' ? (
          <div className="panel-state">
            <p className="form-error">{loadError}</p>
            <button className="secondary" type="button" onClick={() => setReloadKey((current) => current + 1)}>
              Try again
            </button>
          </div>
        ) : null}

        {loadState === 'ready' && orders.length === 0 ? (
          <div className="panel-state">
            <EmptyState
              title={emptyBecauseFilter ? 'No matching orders' : 'No orders yet'}
              text={emptyBecauseFilter
                ? 'Try a different search or filter.'
                : 'When customers order through your storefront, they’ll appear here automatically.'}
            />
            {!emptyBecauseFilter ? (
              <Link className="primary" to="/storefront">
                Share your storefront
              </Link>
            ) : null}
          </div>
        ) : null}

        {loadState === 'ready' && orders.length > 0 ? (
          <>
            <div className="list-summary">{total} {total === 1 ? 'order' : 'orders'}</div>
            <div className="order-table">
              <div className="table-head">
                <span>Order</span>
                <span>Customer</span>
                <span>Items</span>
                <span>Total</span>
                <span>Payment</span>
                <span>Status</span>
                <span />
              </div>
              {orders.map((order) => (
                <div className={`table-row${order.paymentStatus === 'Payment Submitted' ? ' order-row-review' : ''}`} key={order.id}>
                  <div className="product-cell">
                    <div>
                      <strong>{order.orderNumber}</strong>
                      <small>{formatOrderDate(order.createdAt)}</small>
                    </div>
                  </div>
                  <div className="product-cell">
                    <div>
                      <strong>{order.customer.name}</strong>
                      <small>{order.customer.phone || 'No phone'}</small>
                    </div>
                  </div>
                  <span className="clip">{itemSummary(order.items)}</span>
                  <strong>{formatPrice(order.total)}</strong>
                  <div className="product-cell order-payment-cell">
                    <Badge tone={PAYMENT_TONE[order.paymentStatus] || 'neutral'}>{order.paymentStatus}</Badge>
                    <small>
                      {paymentMethodLabel(order.paymentMethod) || 'No method'}
                      {order.paymentReference ? ` · Ref ${order.paymentReference}` : ''}
                    </small>
                  </div>
                  <Badge tone={STATUS_TONE[order.status] || 'neutral'}>{order.status}</Badge>
                  <Link className="secondary tiny" to={`/orders/${order.id}`}>View</Link>
                </div>
              ))}
            </div>

            <div className="order-cards">
              {orders.map((order) => (
                <article className={`order-card${order.paymentStatus === 'Payment Submitted' ? ' order-row-review' : ''}`} key={order.id}>
                  <div className="order-card-top">
                    <div>
                      <strong>{order.orderNumber}</strong>
                      <small>{formatOrderDate(order.createdAt)}</small>
                    </div>
                    <Badge tone={STATUS_TONE[order.status] || 'neutral'}>{order.status}</Badge>
                  </div>
                  <div>
                    <strong>{order.customer.name}</strong>
                    <small>{order.customer.phone || 'No phone'} · {itemSummary(order.items)}</small>
                  </div>
                  <div className="order-card-meta">
                    <div>
                      <strong>{formatPrice(order.total)}</strong>
                      <small>
                        {paymentMethodLabel(order.paymentMethod) || 'No method'}
                        {order.paymentReference ? ` · ${order.paymentReference}` : ''}
                      </small>
                    </div>
                    <Badge tone={PAYMENT_TONE[order.paymentStatus] || 'neutral'}>{order.paymentStatus}</Badge>
                  </div>
                  <Link className="secondary" to={`/orders/${order.id}`}>View order</Link>
                </article>
              ))}
            </div>

            {totalPages > 1 ? (
              <div className="pager">
                <button className="secondary" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                  Previous
                </button>
                <span>Page {page} of {totalPages}</span>
                <button className="secondary" type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
                  Next
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </>
  );
}

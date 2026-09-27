import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  CircleDollarSign,
  ClipboardList,
  Heart,
  Package,
  Plus,
  ShoppingBag,
  Store,
  WalletCards,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PageIntro from '../components/ui/PageIntro';
import SectionHead from '../components/ui/SectionHead';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/Badge';
import GettingStartedCard from '../components/onboarding/GettingStartedCard';
import { listOrders } from '../services/orderService';
import { listProducts } from '../services/productService';
import { listCustomerWants } from '../services/customerWantService';
import { formatEyebrowDate, formatPrice, greeting } from '../utils/display';
import { getErrorMessage } from '../utils/errors';
import { STATUS_TONE } from '../utils/orders';
import { WANT_STATUS_TONE } from '../utils/customerWants';
import { buildGettingStartedItems } from '../utils/onboarding';

const LOW_STOCK_MAX = 2;
const OPEN_WANT_STATUSES = ['New', 'In Progress'];
const CHECKLIST_HIDE_PREFIX = 'cove-checklist-hidden:';

function stockLabel(quantity) {
  const count = Number(quantity) || 0;
  if (count === 1) return '1 in stock';
  return `${count} in stock`;
}

function readChecklistHidden(businessId) {
  try {
    return window.localStorage.getItem(`${CHECKLIST_HIDE_PREFIX}${businessId}`) === '1';
  } catch {
    return false;
  }
}

export default function DashboardPage() {
  const { user, business } = useAuth();
  const { openOnboarding, activeProductCount } = useOutletContext();
  const navigate = useNavigate();
  const firstName = user?.name?.split(' ')[0] || 'there';
  const [summary, setSummary] = useState(null);
  const [attention, setAttention] = useState(null);
  const [wants, setWants] = useState(null);
  const [wantTotal, setWantTotal] = useState(null);
  const [wantError, setWantError] = useState('');
  const [lowStock, setLowStock] = useState(null);
  const [lowStockError, setLowStockError] = useState('');
  const [checklistHidden, setChecklistHidden] = useState(() => readChecklistHidden(business?.id));

  useEffect(() => {
    setChecklistHidden(readChecklistHidden(business?.id));
  }, [business?.id]);

  useEffect(() => {
    let cancelled = false;

    listOrders({ limit: 1 })
      .then((result) => {
        if (!cancelled) setSummary(result.summary);
      })
      .catch(() => {
        if (!cancelled) setSummary({ failed: true, todayPaidTotal: 0, new: 0, pendingPayment: 0, pendingPaymentTotal: 0 });
      });

    listOrders({ status: 'New', limit: 3 })
      .then((result) => {
        if (!cancelled) setAttention(result.orders);
      })
      .catch(() => {
        if (!cancelled) setAttention([]);
      });

    Promise.all(
      OPEN_WANT_STATUSES.map((status) => listCustomerWants({ status, limit: 3 })),
    )
      .then((results) => {
        if (cancelled) return;
        const merged = results
          .flatMap((result) => result.wants)
          .sort((a, b) => {
            const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            if (timeDiff !== 0) return timeDiff;
            return String(b.id).localeCompare(String(a.id));
          })
          .slice(0, 3);
        const total = results.reduce((sum, result) => sum + Number(result.total || 0), 0);
        setWants(merged);
        setWantTotal(total);
        setWantError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setWants([]);
        setWantTotal(0);
        setWantError(getErrorMessage(err));
      });

    listProducts({ limit: 24 })
      .then((result) => {
        if (cancelled) return;
        const items = (result.products || [])
          .filter((product) => product.status !== 'Archived' && Number(product.stockQuantity) <= LOW_STOCK_MAX)
          .sort((a, b) => Number(a.stockQuantity) - Number(b.stockQuantity))
          .slice(0, 5);
        setLowStock(items);
        setLowStockError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setLowStock([]);
        setLowStockError(getErrorMessage(err));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const gettingStartedItems = useMemo(
    () => buildGettingStartedItems({ business, activeProductCount: activeProductCount || 0 }),
    [business, activeProductCount],
  );

  const shopLive = business?.storefrontActive !== false && Boolean(business?.slug);

  function hideChecklist() {
    try {
      window.localStorage.setItem(`${CHECKLIST_HIDE_PREFIX}${business?.id}`, '1');
    } catch {
      // ignore
    }
    setChecklistHidden(true);
  }

  function startTour() {
    openOnboarding?.({ reset: true, step: 0 });
  }

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title={greeting(firstName)}
        subtitle={
          shopLive
            ? `${business?.name || 'Your shop'} is live. Here’s what needs your attention today.`
            : `${business?.name || 'Your shop'} is paused. Turn it back on in Settings when you’re ready.`
        }
        action={
          <button className="primary" type="button" onClick={() => navigate('/products', { state: { add: true } })}>
            <Plus size={17} /> Add product
          </button>
        }
      />

      <div className="dashboard-status-row">
        <div className={`dashboard-status-pill${shopLive ? ' live' : ''}`}>
          <span className="dashboard-status-dot" aria-hidden="true" />
          <span>{shopLive ? 'Storefront live' : 'Storefront paused'}</span>
          {!shopLive ? (
            <button type="button" onClick={() => navigate('/settings?tab=storefront')}>
              Open Settings
            </button>
          ) : null}
        </div>
        <button className="secondary tiny" type="button" onClick={() => navigate('/help')}>
          Need help?
        </button>
      </div>

      {!checklistHidden ? (
        <GettingStartedCard
          items={gettingStartedItems}
          onHide={hideChecklist}
          onOpenTour={startTour}
        />
      ) : null}

      <div className="stats-grid">
        <StatCard
          icon={CircleDollarSign}
          label="Today's sales"
          value={summary && !summary.failed ? formatPrice(summary.todayPaidTotal) : '—'}
          change={summary?.failed ? 'Unavailable' : summary?.todayPaidTotal ? 'Paid today' : summary ? 'No sales yet' : 'Loading'}
          color="#FFE4D4"
        />
        <StatCard
          icon={ShoppingBag}
          label="New orders"
          value={summary && !summary.failed ? String(summary.new) : '—'}
          change={summary?.failed ? 'Unavailable' : summary?.new ? 'Needs a look' : summary ? 'None waiting' : 'Loading'}
          color="#E7F2EC"
        />
        <StatCard
          icon={WalletCards}
          label="Pending payments"
          value={summary && !summary.failed ? formatPrice(summary.pendingPaymentTotal) : '—'}
          change={summary?.failed ? 'Unavailable' : summary ? `${summary.pendingPayment} orders` : 'Loading'}
          color="#FFF1E4"
        />
        <StatCard
          icon={Heart}
          label="Customer requests"
          value={wantTotal === null ? '—' : String(wantTotal)}
          change={
            wantError
              ? 'Unavailable'
              : wantTotal
                ? 'Needs a look'
                : wantTotal === 0
                  ? 'None waiting'
                  : 'Loading'
          }
          color="#FFE8DC"
        />
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <SectionHead title="Orders needing attention" action="View all orders" onAction={() => navigate('/orders')} />
          {attention === null ? <div className="skeleton-block" aria-hidden="true" /> : null}
          {attention?.length === 0 ? (
            <EmptyState
              title="No orders yet"
              text="When customers order through your storefront, they’ll appear here automatically."
              action={(
                <button className="secondary" type="button" onClick={() => navigate('/storefront')}>
                  Share your storefront
                </button>
              )}
            />
          ) : null}
          {attention?.length > 0 ? (
            <div className="attention-list">
              {attention.map((order) => (
                <button key={order.id} type="button" className="attention-row" onClick={() => navigate(`/orders/${order.id}`)}>
                  <strong>{order.orderNumber}</strong>
                  <span>{order.customer.name}</span>
                  <Badge tone={STATUS_TONE[order.status] || 'neutral'}>{order.status}</Badge>
                </button>
              ))}
            </div>
          ) : null}
        </section>
        <section className="card">
          <SectionHead title="Customer requests" action="See all" onAction={() => navigate('/customer-wants')} />
          {wants === null ? <div className="skeleton-block" aria-hidden="true" /> : null}
          {wantError ? <p className="form-error">{wantError}</p> : null}
          {!wantError && wants?.length === 0 ? (
            <EmptyState
              title="No open requests"
              text="Customer requests will appear here when shoppers tell you what they’re looking for."
              action={(
                <button className="secondary" type="button" onClick={() => navigate('/help')}>
                  How Customer Wants work
                </button>
              )}
            />
          ) : null}
          {!wantError && wants?.length > 0 ? (
            <div className="attention-list">
              {wants.map((want) => (
                <button key={want.id} type="button" className="attention-row" onClick={() => navigate(`/customer-wants/${want.id}`)}>
                  <strong>{want.name}</strong>
                  <span>{want.request}</span>
                  <Badge tone={WANT_STATUS_TONE[want.status] || 'neutral'}>{want.status}</Badge>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <div className="bottom-grid">
        <section className="card">
          <SectionHead title="Low stock" action="Manage products" onAction={() => navigate('/products')} />
          {lowStock === null ? <div className="skeleton-block" aria-hidden="true" /> : null}
          {lowStockError ? <p className="form-error">{lowStockError}</p> : null}
          {!lowStockError && lowStock?.length === 0 ? (
            <EmptyState title="Stock looks healthy" text="Products with 2 or fewer left will show up here." />
          ) : null}
          {!lowStockError && lowStock?.length > 0 ? (
            <div className="attention-list">
              {lowStock.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="attention-row"
                  onClick={() => navigate('/products')}
                >
                  <strong>{product.name}</strong>
                  <span>{stockLabel(product.stockQuantity)}</span>
                  <Badge tone={Number(product.stockQuantity) === 0 ? 'neutral' : 'yellow'}>
                    {Number(product.stockQuantity) === 0 ? 'Out of stock' : 'Low'}
                  </Badge>
                </button>
              ))}
            </div>
          ) : null}
        </section>
        <section className="card quick-card">
          <SectionHead title="Quick actions" />
          <div className="quick-actions">
            <button type="button" onClick={() => navigate('/products', { state: { add: true } })}><Package /> Add product</button>
            <button type="button" onClick={() => navigate('/storefront')}><Store /> Share storefront</button>
            <button type="button" onClick={() => navigate('/orders/new')}><ClipboardList /> New order</button>
            <button type="button" onClick={() => navigate('/orders')}><ClipboardList /> View orders</button>
            <button type="button" onClick={() => navigate('/customer-wants')}><Heart /> View customer wants</button>          </div>
        </section>
      </div>
    </>
  );
}

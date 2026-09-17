import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleDollarSign, ClipboardList, Heart, Package, Plus, ShoppingBag, Sparkles, WalletCards } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PageIntro from '../components/ui/PageIntro';
import SectionHead from '../components/ui/SectionHead';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/Badge';
import { listOrders } from '../services/orderService';
import { formatEyebrowDate, formatPrice, greeting } from '../utils/display';
import { STATUS_TONE } from '../utils/orders';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.name?.split(' ')[0] || 'there';
  const [summary, setSummary] = useState(null);
  const [attention, setAttention] = useState(null);

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
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title={greeting(firstName)}
        subtitle="Here is what is happening with your business today."
        action={
          <button className="primary" type="button" onClick={() => navigate('/products', { state: { add: true } })}>
            <Plus size={17} /> Add product
          </button>
        }
      />

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
        <StatCard icon={Heart} label="Customer requests" value="0" change="None this week" color="#FFE8DC" />
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <SectionHead title="Orders needing attention" action="View all orders" onAction={() => navigate('/orders')} />
          {attention === null ? <p className="muted">Loading orders...</p> : null}
          {attention?.length === 0 ? (
            <EmptyState title="No orders yet" text="When you record an order, it will show up here." />
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
          <EmptyState title="No requests yet" text="Requests from your storefront will appear here." />
        </section>
      </div>

      <div className="bottom-grid">
        <section className="card">
          <SectionHead title="Low stock" action="Manage products" onAction={() => navigate('/products')} />
          <EmptyState title="No products yet" text="Stock warnings will show up after you add products." />
        </section>
        <section className="card quick-card">
          <SectionHead title="Quick actions" />
          <div className="quick-actions">
            <button type="button" onClick={() => navigate('/products', { state: { add: true } })}><Package /> Add product</button>
            <button type="button" onClick={() => navigate('/orders/new')}><ClipboardList /> New order</button>
            <button type="button" onClick={() => navigate('/orders')}><ClipboardList /> View orders</button>
            <button type="button" onClick={() => navigate('/customer-wants')}><Heart /> Add customer want</button>
            <button type="button" onClick={() => navigate('/marketing')}><Sparkles /> Create marketing post</button>
          </div>
        </section>
      </div>
    </>
  );
}

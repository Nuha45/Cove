import { useNavigate } from 'react-router-dom';
import { CircleDollarSign, ClipboardList, Heart, Package, Plus, ShoppingBag, Sparkles, WalletCards } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PageIntro from '../components/ui/PageIntro';
import SectionHead from '../components/ui/SectionHead';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import { formatEyebrowDate, greeting } from '../utils/display';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.name?.split(' ')[0] || 'there';

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
        <StatCard icon={CircleDollarSign} label="Today's sales" value="₹0" change="No sales yet" color="#FFE4D4" />
        <StatCard icon={ShoppingBag} label="New orders" value="0" change="None today" color="#E7F2EC" />
        <StatCard icon={WalletCards} label="Pending payments" value="₹0" change="0 orders" color="#FFF1E4" />
        <StatCard icon={Heart} label="Customer requests" value="0" change="None this week" color="#FFE8DC" />
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <SectionHead title="Orders needing attention" action="View all orders" onAction={() => navigate('/orders')} />
          <EmptyState title="No orders yet" text="When a customer places an order, it will show up here." />
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
            <button type="button" onClick={() => navigate('/orders')}><ClipboardList /> View orders</button>
            <button type="button" onClick={() => navigate('/customer-wants')}><Heart /> Add customer want</button>
            <button type="button" onClick={() => navigate('/marketing')}><Sparkles /> Create marketing post</button>
          </div>
        </section>
      </div>
    </>
  );
}

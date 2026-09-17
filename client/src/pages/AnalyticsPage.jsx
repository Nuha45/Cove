import { useEffect, useState } from 'react';
import {
  CircleDollarSign,
  ClipboardList,
  Heart,
  Package,
  TrendingUp,
  Users,
} from 'lucide-react';
import PageIntro from '../components/ui/PageIntro';
import SectionHead from '../components/ui/SectionHead';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import { getAnalytics } from '../services/analyticsService';
import { formatEyebrowDate, formatPrice } from '../utils/display';
import { getErrorMessage } from '../utils/errors';

const ORDER_STATUSES = ['New', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
const WANT_STATUSES = ['New', 'In Progress', 'Fulfilled', 'Closed'];

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      setLoadError('');
      try {
        const result = await getAnalytics();
        if (cancelled) return;
        setAnalytics(result.analytics);
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
  }, []);

  if (loadState === 'loading') {
    return <div className="panel-state">Loading analytics...</div>;
  }

  if (loadState === 'error') {
    return (
      <div className="panel-state">
        <p className="form-error">{loadError}</p>
      </div>
    );
  }

  const summary = analytics.summary;
  const maxTrend = Math.max(...analytics.salesTrend.map((day) => day.sales), 1);

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Analytics"
        subtitle="Simple numbers from your real orders, customers, and requests."
      />

      <div className="stats-grid analytics-stats">
        <StatCard
          icon={CircleDollarSign}
          label="Total sales"
          value={formatPrice(summary.totalSales)}
          change="All time"
          color="#FFE4D4"
        />
        <StatCard
          icon={ClipboardList}
          label="Total orders"
          value={String(summary.totalOrders)}
          change="Including cancelled"
          color="#E7F2EC"
        />
        <StatCard
          icon={Users}
          label="Total customers"
          value={String(summary.totalCustomers)}
          change="Your shop"
          color="#FFF1E4"
        />
        <StatCard
          icon={Heart}
          label="Customer wants"
          value={String(summary.customerWants)}
          change="All requests"
          color="#FFE8DC"
        />
        <StatCard
          icon={TrendingUp}
          label="Sales today"
          value={formatPrice(summary.salesToday)}
          change="Excludes cancelled"
          color="#E8F0FF"
        />
        <StatCard
          icon={TrendingUp}
          label="Sales this week"
          value={formatPrice(summary.salesThisWeek)}
          change="Last 7 days"
          color="#F3EAF8"
        />
        <StatCard
          icon={TrendingUp}
          label="Sales this month"
          value={formatPrice(summary.salesThisMonth)}
          change="This calendar month"
          color="#EAF7F2"
        />
      </div>

      <div className="analytics-grid analytics-main">
        <section className="card">
          <SectionHead title="Sales trend" />
          <p className="muted analytics-hint">Last 7 days · cancelled orders are excluded</p>
          <div className="trend-chart" role="img" aria-label="Sales for the last 7 days">
            {analytics.salesTrend.map((day) => {
              const height = Math.max(6, Math.round((day.sales / maxTrend) * 100));
              return (
                <div key={day.date} className="trend-col">
                  <div className="trend-bar-wrap">
                    <div className="trend-bar" style={{ height: `${height}%` }} title={formatPrice(day.sales)} />
                  </div>
                  <strong>{formatPrice(day.sales)}</strong>
                  <span>{day.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <SectionHead title="Top products" />
          {analytics.topProducts.length === 0 ? (
            <EmptyState title="No sales yet" text="Products appear here after non-cancelled orders." />
          ) : (
            <ul className="analytics-list">
              {analytics.topProducts.map((item) => (
                <li key={`${item.productId}-${item.name}`}>
                  <div>
                    <Package size={16} />
                    <strong>{item.name}</strong>
                  </div>
                  <span>{item.quantitySold} sold</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="analytics-grid analytics-side">
        <section className="card">
          <SectionHead title="Order status" />
          <div className="status-grid">
            {ORDER_STATUSES.map((status) => (
              <div key={status} className="status-chip">
                <span>{status}</span>
                <strong>{analytics.orderStatus[status] || 0}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <SectionHead title="Customer insights" />
          <div className="status-grid customer-insights">
            <div className="status-chip">
              <span>New customers</span>
              <strong>{analytics.customers.new}</strong>
            </div>
            <div className="status-chip">
              <span>Returning customers</span>
              <strong>{analytics.customers.returning}</strong>
            </div>
            <div className="status-chip">
              <span>Total customers</span>
              <strong>{analytics.customers.total}</strong>
            </div>
          </div>
        </section>

        <section className="card">
          <SectionHead title="Customer wants" />
          <div className="status-grid">
            <div className="status-chip">
              <span>Total requests</span>
              <strong>{analytics.customerWants.total}</strong>
            </div>
            {WANT_STATUSES.map((status) => (
              <div key={status} className="status-chip">
                <span>{status}</span>
                <strong>{analytics.customerWants[status] || 0}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

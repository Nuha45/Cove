import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight,
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

function filteredPath(path, key, value) {
  return `${path}?${new URLSearchParams({ [key]: value }).toString()}`;
}

function MetricLink({ label, value, to, description }) {
  return (
    <Link className="status-chip status-chip-link" to={to} aria-label={`${label}: ${value}. View ${description}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <ChevronRight className="status-chip-arrow" size={16} aria-hidden="true" />
    </Link>
  );
}

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
        subtitle="See how your shop is performing over time."
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
            <EmptyState
              title="No sales yet"
              text="Your insights will appear once your shop starts receiving activity."
            />
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
              <MetricLink
                key={status}
                label={status}
                value={analytics.orderStatus[status] || 0}
                to={filteredPath('/orders', 'status', status)}
                description={`${status.toLowerCase()} orders`}
              />
            ))}
          </div>
        </section>

        <section className="card">
          <SectionHead title="Customer insights" />
          <div className="status-grid customer-insights">
            <MetricLink
              label="New customers"
              value={analytics.customers.new}
              to={filteredPath('/customers', 'type', 'new')}
              description="new customers"
            />
            <MetricLink
              label="Returning customers"
              value={analytics.customers.returning}
              to={filteredPath('/customers', 'type', 'returning')}
              description="returning customers"
            />
            <MetricLink
              label="Total customers"
              value={analytics.customers.total}
              to="/customers"
              description="all customers"
            />
          </div>
        </section>

        <section className="card">
          <SectionHead title="Customer wants" />
          <div className="status-grid">
            <MetricLink
              label="Total requests"
              value={analytics.customerWants.total}
              to="/customer-wants"
              description="all customer requests"
            />
            {WANT_STATUSES.map((status) => (
              <MetricLink
                key={status}
                label={status}
                value={analytics.customerWants[status] || 0}
                to={filteredPath('/customer-wants', 'status', status)}
                description={`${status.toLowerCase()} customer requests`}
              />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

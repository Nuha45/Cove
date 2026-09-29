import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Download,
  Eye,
  Heart,
  MousePointerClick,
  Package,
  Percent,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react';
import PageIntro from '../components/ui/PageIntro';
import SectionHead from '../components/ui/SectionHead';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/Badge';
import AdvancedLock from '../components/ui/AdvancedLock';
import RangePicker from '../components/analytics/RangePicker';
import TrendBars from '../components/analytics/TrendBars';
import Funnel from '../components/analytics/Funnel';
import DataTable from '../components/analytics/DataTable';
import {
  downloadOrdersCsv,
  downloadProductSalesCsv,
  getAnalytics,
  getInsights,
  getPerformance,
  getProductPerformance,
  getSalesReport,
} from '../services/analyticsService';
import { formatEyebrowDate, formatPrice } from '../utils/display';
import { getErrorMessage } from '../utils/errors';

const ORDER_STATUSES = ['New', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
const WANT_STATUSES = ['New', 'In Progress', 'Fulfilled', 'Closed'];

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'performance', label: 'Store performance' },
  { key: 'products', label: 'Products' },
  { key: 'sales', label: 'Sales report' },
];

function filteredPath(path, key, value) {
  return `${path}?${new URLSearchParams({ [key]: value }).toString()}`;
}

function formatPercent(value) {
  return value === null || value === undefined ? '—' : `${value.toFixed(2)}%`;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('en-IN');
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

// Loads one Advanced endpoint for the current range and exposes a consistent state object.
function useRangeData(loader, params, enabled) {
  const [state, setState] = useState({ status: 'idle', data: null, error: '' });
  const key = JSON.stringify(params);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setState((current) => ({ status: 'loading', data: current.data, error: '' }));
    loader(params)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data, error: '' });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', data: null, error: getErrorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return state;
}

function PanelStatus({ state, children }) {
  if (state.status === 'error') {
    return <section className="card panel-state"><p className="form-error">{state.error}</p></section>;
  }
  if (!state.data) {
    return <section className="card panel-state">Loading...</section>;
  }
  return children;
}

export default function AnalyticsPage() {
  const { plan, notify } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((item) => item.key === searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
  const rangeValue = useMemo(() => ({
    range: searchParams.get('range') || '7d',
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
  }), [searchParams]);
  const rangeParams = useMemo(() => (
    rangeValue.range === 'custom'
      ? { range: 'custom', from: rangeValue.from, to: rangeValue.to }
      : { range: rangeValue.range }
  ), [rangeValue]);

  function setTab(next) {
    const params = new URLSearchParams(searchParams);
    if (next === 'overview') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  }

  function setRange(next) {
    const params = new URLSearchParams(searchParams);
    params.set('range', next.range);
    if (next.range === 'custom') {
      params.set('from', next.from);
      params.set('to', next.to);
    } else {
      params.delete('from');
      params.delete('to');
    }
    setSearchParams(params, { replace: true });
  }

  const advanced = Boolean(plan?.advanced);
  const showRange = tab !== 'overview' && advanced;

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Analytics"
        subtitle="See how your shop is performing over time."
      />

      <div className="analytics-toolbar">
        <div className="segmented" role="tablist" aria-label="Analytics sections">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              className={tab === item.key ? 'selected' : ''}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {showRange ? <RangePicker value={rangeValue} onChange={setRange} /> : null}
      </div>

      {tab === 'overview' ? <BasicOverview /> : null}

      {tab !== 'overview' && plan?.loading ? <section className="card panel-state">Loading...</section> : null}

      {tab !== 'overview' && !plan?.loading && !advanced ? (
        <AdvancedLock
          title="Understand how shoppers use your store"
          text="Cove Plus adds visitor, product view and add-to-cart tracking, a conversion funnel, product performance and exportable sales reports."
        />
      ) : null}

      {tab === 'performance' && advanced ? <PerformancePanel params={rangeParams} /> : null}
      {tab === 'products' && advanced ? <ProductsPanel params={rangeParams} notify={notify} /> : null}
      {tab === 'sales' && advanced ? <SalesPanel params={rangeParams} notify={notify} /> : null}
    </>
  );
}

function PerformancePanel({ params }) {
  const performance = useRangeData(getPerformance, params, true);
  const insights = useRangeData(getInsights, params, true);
  const [series, setSeries] = useState('revenue');

  return (
    <PanelStatus state={performance}>
      {performance.data ? (
        <PerformanceContent
          data={performance.data}
          insights={insights}
          series={series}
          onSeries={setSeries}
          refreshing={performance.status === 'loading'}
        />
      ) : null}
    </PanelStatus>
  );
}

function PerformanceContent({ data, insights, series, onSeries, refreshing }) {
  const { metrics, funnel, trend, range } = data;
  const noVisits = metrics.uniqueVisitors === 0;
  const points = trend.map((point) => ({ key: point.key, label: point.label, value: point[series] }));
  const seriesFormat = series === 'revenue' ? (value) => formatPrice(value) : formatCount;

  return (
    <div className={refreshing ? 'is-refreshing' : ''}>
      <p className="muted analytics-hint">{range.label} · visitors are counted anonymously</p>
      <div className="stats-grid analytics-stats">
        <StatCard icon={Users} label="Store visitors" value={formatCount(metrics.uniqueVisitors)} change={`${formatCount(metrics.visits)} visits`} color="#FFE4D4" />
        <StatCard icon={Eye} label="Product views" value={formatCount(metrics.productViews)} change="All products" color="#E8F0FF" />
        <StatCard icon={ShoppingCart} label="Added to cart" value={formatCount(metrics.addToCart)} change={`${formatPercent(metrics.addToCartRate)} of visitors`} color="#FFF1E4" />
        <StatCard icon={ClipboardList} label="Orders" value={formatCount(metrics.orders)} change={metrics.cancelledOrders ? `${metrics.cancelledOrders} cancelled excluded` : 'Excludes cancelled'} color="#E7F2EC" />
        <StatCard icon={CircleDollarSign} label="Revenue" value={formatPrice(metrics.revenue)} change="Excludes cancelled" color="#FFE8DC" />
        <StatCard icon={Percent} label="Conversion rate" value={formatPercent(metrics.conversionRate)} change="Storefront orders ÷ visitors" color="#F3EAF8" />
        <StatCard icon={TrendingUp} label="Average order value" value={formatPrice(metrics.averageOrderValue)} change="Revenue ÷ orders" color="#EAF7F2" />
        <StatCard icon={MousePointerClick} label="Add-to-cart rate" value={formatPercent(metrics.addToCartRate)} change="Visitors who added to cart" color="#FFF4DD" />
      </div>

      <div className="analytics-grid analytics-main">
        <section className="card">
          <div className="section-head">
            <h2>Activity over time</h2>
            <select className="filter-select" aria-label="Chart metric" value={series} onChange={(event) => onSeries(event.target.value)}>
              <option value="revenue">Revenue</option>
              <option value="orders">Orders</option>
              <option value="visitors">Visitors</option>
            </select>
          </div>
          {points.every((point) => point.value === 0) ? (
            <EmptyState title="No activity in this range" text="Try a longer date range, or share your storefront link to bring in visitors." />
          ) : (
            <TrendBars points={points} format={seriesFormat} ariaLabel={`${series} for ${range.label}`} />
          )}
        </section>

        <section className="card">
          <SectionHead title="Customer funnel" />
          {noVisits ? (
            <EmptyState title="No visitors yet" text="The funnel fills in as people visit your storefront. Your own visits while logged in are not counted." />
          ) : (
            <Funnel steps={funnel} />
          )}
        </section>
      </div>

      <InsightsSection state={insights} />
    </div>
  );
}

function InsightItem({ label, insight, render }) {
  return (
    <div className="insight-item">
      <span>{label}</span>
      {insight?.available ? (
        <>
          <strong>{render(insight)}</strong>
          {insight.share !== undefined ? <small>{insight.share.toFixed(0)}% of {formatCount(insight.sample)}</small> : null}
        </>
      ) : (
        <small className="insight-empty">Not enough activity yet</small>
      )}
    </div>
  );
}

function InsightsSection({ state }) {
  if (state.status === 'error') {
    return <section className="card panel-state"><p className="form-error">{state.error}</p></section>;
  }
  if (!state.data) return <section className="card panel-state">Loading insights...</section>;
  const { insights } = state.data;
  const anyAvailable = Object.values(insights).some((item) => item.available);

  return (
    <div className="analytics-grid analytics-main">
      <section className="card">
        <SectionHead title="Customer insights" />
        {!anyAvailable ? (
          <EmptyState
            title="Not enough activity yet"
            text="More insights will appear as customers interact with your store."
          />
        ) : (
          <div className="insight-grid">
            <InsightItem label="Most viewed category" insight={insights.topViewedCategory} render={(item) => item.value} />
            <InsightItem label="Most added-to-cart category" insight={insights.topCartCategory} render={(item) => item.value} />
            <InsightItem label="Popular price range" insight={insights.popularPriceRange} render={(item) => item.value} />
            <InsightItem label="Most active shopping period" insight={insights.activity} render={(item) => `${item.mostActivePeriod} · ${item.mostActiveDay}`} />
          </div>
        )}
      </section>
      <section className="card">
        <SectionHead title="Visits by day" />
        {insights.activity.available ? (
          <TrendBars
            points={insights.activity.byDay.map((day) => ({ key: day.label, label: day.label, value: day.visits }))}
            format={formatCount}
            ariaLabel="Store visits by day of week"
          />
        ) : (
          <EmptyState
            title="Not enough activity yet"
            text={`Shopping patterns appear after ${insights.activity.minimum} visits in the selected range.`}
          />
        )}
      </section>
    </div>
  );
}

function TopList({ title, items, unit }) {
  return (
    <section className="card">
      <SectionHead title={title} />
      {items.length === 0 ? (
        <EmptyState title="No activity yet" text="This list fills in as customers browse and buy." />
      ) : (
        <ol className="analytics-list ranked">
          {items.map((item) => (
            <li key={item.productId}>
              <div>
                <Package size={16} />
                <strong>{item.name}</strong>
              </div>
              <span>{formatCount(item.value)} {unit}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ProductsPanel({ params, notify }) {
  const state = useRangeData(getProductPerformance, params, true);
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    setExporting(true);
    try {
      await downloadProductSalesCsv(params);
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <PanelStatus state={state}>
      {state.data ? (
        <div className={state.status === 'loading' ? 'is-refreshing' : ''}>
          <p className="muted analytics-hint">{state.data.range.label}</p>
          <div className="analytics-top-lists">
            <TopList title="Most viewed" items={state.data.topViewed} unit="views" />
            <TopList title="Most added to cart" items={state.data.topAddedToCart} unit="adds" />
            <TopList title="Best sellers" items={state.data.bestSellers} unit="sold" />
          </div>

          <section className="card table-card">
            <div className="section-head padded">
              <h2>Product performance</h2>
              <button className="secondary tiny" type="button" onClick={exportCsv} disabled={exporting || state.data.products.length === 0}>
                <Download size={14} /> {exporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
            {state.data.products.length === 0 ? (
              <div className="panel-state">
                <EmptyState title="No product activity in this range" text="Views, carts and sales per product appear here as customers shop." />
              </div>
            ) : (
              <>
                <p className="muted table-note">
                  Products marked “Needs attention” had at least {state.data.attentionThreshold} views but no orders in this range.
                </p>
                <DataTable
                  caption="Product performance"
                  rowKey={(row) => row.productId}
                  rows={state.data.products}
                  columns={[
                    {
                      key: 'name',
                      label: 'Product',
                      render: (row) => (
                        <div className="table-product">
                          <strong>{row.name}</strong>
                          {row.needsAttention ? <Badge tone="yellow">Needs attention</Badge> : null}
                          {row.status === 'Removed' ? <Badge tone="neutral">Removed</Badge> : null}
                        </div>
                      ),
                    },
                    { key: 'views', label: 'Views', align: 'right', render: (row) => formatCount(row.views) },
                    { key: 'addToCart', label: 'Cart', align: 'right', render: (row) => formatCount(row.addToCart) },
                    { key: 'orders', label: 'Orders', align: 'right', render: (row) => formatCount(row.orders) },
                    { key: 'units', label: 'Units', align: 'right', render: (row) => formatCount(row.units) },
                    { key: 'revenue', label: 'Revenue', align: 'right', render: (row) => formatPrice(row.revenue) },
                    { key: 'viewToOrderRate', label: 'View → order', align: 'right', render: (row) => formatPercent(row.viewToOrderRate) },
                  ]}
                />
              </>
            )}
          </section>
        </div>
      ) : null}
    </PanelStatus>
  );
}

function SalesPanel({ params, notify }) {
  const state = useRangeData(getSalesReport, params, true);
  const [exporting, setExporting] = useState('');

  async function exportFile(kind) {
    setExporting(kind);
    try {
      if (kind === 'orders') await downloadOrdersCsv(params);
      else await downloadProductSalesCsv(params);
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setExporting('');
    }
  }

  return (
    <PanelStatus state={state}>
      {state.data ? (
        <div className={state.status === 'loading' ? 'is-refreshing' : ''}>
          <div className="report-head">
            <p className="muted analytics-hint">{state.data.range.label} · cancelled orders are excluded</p>
            <div className="report-actions">
              <button className="secondary tiny" type="button" onClick={() => exportFile('orders')} disabled={Boolean(exporting)}>
                <Download size={14} /> {exporting === 'orders' ? 'Exporting...' : 'Orders CSV'}
              </button>
              <button className="secondary tiny" type="button" onClick={() => exportFile('products')} disabled={Boolean(exporting)}>
                <Download size={14} /> {exporting === 'products' ? 'Exporting...' : 'Product sales CSV'}
              </button>
            </div>
          </div>
          <div className="stats-grid">
            <StatCard icon={ClipboardList} label="Orders" value={formatCount(state.data.summary.orders)} change={state.data.summary.cancelledOrders ? `${state.data.summary.cancelledOrders} cancelled` : 'None cancelled'} color="#E7F2EC" />
            <StatCard icon={CircleDollarSign} label="Revenue" value={formatPrice(state.data.summary.revenue)} change="Order totals" color="#FFE4D4" />
            <StatCard icon={TrendingUp} label="Average order value" value={formatPrice(state.data.summary.averageOrderValue)} change="Revenue ÷ orders" color="#EAF7F2" />
            <StatCard icon={Package} label="Units sold" value={formatCount(state.data.summary.unitsSold)} change="All products" color="#FFF1E4" />
          </div>

          <div className="analytics-grid analytics-main">
            <section className="card">
              <SectionHead title="Revenue" />
              {state.data.summary.orders === 0 ? (
                <EmptyState title="No sales in this range" text="Choose another date range to see earlier sales." />
              ) : (
                <TrendBars
                  points={state.data.trend.map((point) => ({ key: point.key, label: point.label, value: point.revenue }))}
                  format={(value) => formatPrice(value)}
                  ariaLabel={`Revenue for ${state.data.range.label}`}
                />
              )}
            </section>
            <TopList title="Best sellers" items={state.data.bestSellers.map((item) => ({ ...item, value: item.units }))} unit="sold" />
          </div>

          <section className="card table-card">
            <div className="section-head padded"><h2>Product sales</h2></div>
            {state.data.products.length === 0 ? (
              <div className="panel-state">
                <EmptyState title="No product sales in this range" text="Sold products and their revenue appear here." />
              </div>
            ) : (
              <DataTable
                caption="Product sales"
                rowKey={(row) => row.productId}
                rows={state.data.products}
                columns={[
                  { key: 'name', label: 'Product', render: (row) => <strong>{row.name}</strong> },
                  { key: 'units', label: 'Units', align: 'right', render: (row) => formatCount(row.units) },
                  { key: 'orders', label: 'Orders', align: 'right', render: (row) => formatCount(row.orders) },
                  { key: 'revenue', label: 'Revenue', align: 'right', render: (row) => formatPrice(row.revenue) },
                ]}
              />
            )}
          </section>
        </div>
      ) : null}
    </PanelStatus>
  );
}

function BasicOverview() {
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
      <div className="stats-grid analytics-stats">
        <StatCard icon={CircleDollarSign} label="Total sales" value={formatPrice(summary.totalSales)} change="All time" color="#FFE4D4" />
        <StatCard icon={ClipboardList} label="Total orders" value={String(summary.totalOrders)} change="Including cancelled" color="#E7F2EC" />
        <StatCard icon={Users} label="Total customers" value={String(summary.totalCustomers)} change="Your shop" color="#FFF1E4" />
        <StatCard icon={Heart} label="Customer wants" value={String(summary.customerWants)} change="All requests" color="#FFE8DC" />
        <StatCard icon={TrendingUp} label="Sales today" value={formatPrice(summary.salesToday)} change="Excludes cancelled" color="#E8F0FF" />
        <StatCard icon={TrendingUp} label="Sales this week" value={formatPrice(summary.salesThisWeek)} change="Last 7 days" color="#F3EAF8" />
        <StatCard icon={TrendingUp} label="Sales this month" value={formatPrice(summary.salesThisMonth)} change="This calendar month" color="#EAF7F2" />
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

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Building2, CheckCircle2, Clock, Lock } from 'lucide-react';
import PageIntro from '../../components/ui/PageIntro';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { getAdminOverview } from '../../services/adminService';
import { formatEyebrowDate, formatPrice } from '../../utils/display';
import { getErrorMessage } from '../../utils/errors';
import { ACCOUNT_STATUS_TONE, daysUntil, formatShortDate } from '../../utils/adminDisplay';

export default function AdminOverviewPage() {
  const [overview, setOverview] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    setLoadError('');
    getAdminOverview()
      .then((result) => {
        if (cancelled) return;
        setOverview(result.overview);
        setLoadState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(getErrorMessage(err));
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Platform overview"
        subtitle="Every business on Cove at a glance. Only platform admins can see this."
      />

      {loadState === 'loading' ? <section className="card panel-state">Loading platform overview...</section> : null}

      {loadState === 'error' ? (
        <section className="card panel-state">
          <p className="form-error">{loadError}</p>
          <button className="secondary" type="button" onClick={() => setReloadKey((key) => key + 1)}>
            Try again
          </button>
        </section>
      ) : null}

      {loadState === 'ready' && overview ? (
        <>
          <div className="stats-grid admin-stats-grid">
            <StatCard icon={Building2} label="Total businesses" value={overview.totals.businesses} change="All time" color="#fff0e5" />
            <StatCard icon={CheckCircle2} label="Active" value={overview.totals.active} change="Paying" color="#e7f6ee" />
            <StatCard icon={Clock} label="On trial" value={overview.totals.trial} change="Trial" color="#eaf0fa" />
            <StatCard icon={AlertTriangle} label="Payment required" value={overview.totals.paymentRequired} change="Needs billing" color="#fff5d9" />
            <StatCard icon={Lock} label="Restricted" value={overview.totals.restricted} change="Halted / cancelled" color="#f9e9e7" />
          </div>

          <div className="admin-overview-grid">
            <section className="card detail-card">
              <h2>Subscription summary</h2>
              <dl className="detail-list">
                <div>
                  <dt>Estimated MRR</dt>
                  <dd className="admin-mrr">{formatPrice(overview.revenue.estimatedMrr, overview.revenue.currency)}</dd>
                </div>
                <div>
                  <dt>Active subscriptions</dt>
                  <dd>{overview.revenue.activeSubscriptions}</dd>
                </div>
                <div className="wide">
                  <dt>How this is calculated</dt>
                  <dd className="muted">
                    Active subscriptions × {overview.revenue.plan} price ({formatPrice(overview.revenue.pricePerMonth, overview.revenue.currency)}/month).
                    Trials and payment-required accounts are excluded.
                  </dd>
                </div>
              </dl>
            </section>

            <section className="card detail-card">
              <h2>Trials ending in {overview.trialsEndingSoon.windowDays} days</h2>
              {overview.trialsEndingSoon.count === 0 ? (
                <EmptyState title="No trials ending soon" text="Trials ending in the next week will appear here." />
              ) : (
                <div className="admin-list">
                  {overview.trialsEndingSoon.items.map((item) => {
                    const days = daysUntil(item.trialEndAt);
                    return (
                      <Link className="admin-list-row" key={item.id} to={`/admin/businesses/${item.id}`}>
                        <strong>{item.name}</strong>
                        <small>{days === 0 ? 'Ends today' : `${days} day${days === 1 ? '' : 's'} left`} · {formatShortDate(item.trialEndAt)}</small>
                      </Link>
                    );
                  })}
                  {overview.trialsEndingSoon.count > overview.trialsEndingSoon.items.length ? (
                    <p className="muted admin-list-more">
                      +{overview.trialsEndingSoon.count - overview.trialsEndingSoon.items.length} more
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          </div>

          <section className="card detail-card admin-recent">
            <div className="admin-section-head">
              <h2>Recent signups</h2>
              <Link className="secondary tiny" to="/admin/businesses">View all</Link>
            </div>
            {overview.recentSignups.length === 0 ? (
              <EmptyState title="No businesses yet" text="New signups will appear here." />
            ) : (
              <div className="admin-list">
                {overview.recentSignups.map((item) => (
                  <Link className="admin-list-row admin-list-row-status" key={item.id} to={`/admin/businesses/${item.id}`}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.owner?.email || 'No owner'} · {formatShortDate(item.createdAt)}</small>
                    </div>
                    <Badge tone={ACCOUNT_STATUS_TONE[item.subscription.accountStatus] || 'neutral'}>
                      {item.subscription.accountStatusLabel}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

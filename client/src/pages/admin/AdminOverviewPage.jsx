import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Building2, CheckCircle2, Clock, Lock } from 'lucide-react';
import PageIntro from '../../components/ui/PageIntro';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { getAdminOverview } from '../../services/adminService';
import { formatEyebrowDate, formatOrderDate, formatPrice } from '../../utils/display';
import { getErrorMessage } from '../../utils/errors';
import {
  ACCOUNT_STATUS_TONE,
  STORE_STATE_TONE,
  TRIAL_PAYMENT_LABELS,
  TRIAL_PAYMENT_TONE,
  daysUntil,
  formatPaise,
  formatShortDate,
} from '../../utils/adminDisplay';

const STATUS_ROWS = [
  ['active', 'Paying (renewing)'],
  ['cancelling', 'Cancelling at period end'],
  ['trial', 'On free trial'],
  ['past_due', 'Past due (Razorpay retrying)'],
  ['halted', 'Halted (Razorpay stopped retrying)'],
  ['trial_ended', 'Trial ended, never paid'],
  ['payment_required', 'Payment required (other)'],
  ['cancelled', 'Cancelled'],
  ['exempt', 'Admin shops (no plan needed)'],
];

const CLOSED_ROWS = [
  ['closed_unverified', 'Closed: email not verified'],
  ['closed_billing', 'Closed: no active plan'],
  ['off', 'Turned off by seller'],
];

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

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

  const totals = overview?.totals;
  const statuses = totals?.statuses || {};
  const collected = overview?.collected?.currencies || [];

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
            <StatCard
              icon={Building2}
              label="Businesses"
              value={totals.businesses}
              change={`${totals.archived} archived not counted`}
              color="#fff0e5"
            />
            <StatCard
              icon={CheckCircle2}
              label="Paying"
              value={statuses.active}
              change={`${statuses.cancelling} cancelling`}
              color="#e7f6ee"
            />
            <StatCard
              icon={Clock}
              label="On trial"
              value={statuses.trial}
              change={`${totals.trialPayment.autopay} with autopay`}
              color="#eaf0fa"
            />
            <StatCard
              icon={AlertTriangle}
              label="Payment problems"
              value={statuses.past_due + statuses.halted}
              change={`${statuses.past_due} past due · ${statuses.halted} halted`}
              color="#fff5d9"
            />
            <StatCard
              icon={Lock}
              label="Not paying"
              value={statuses.trial_ended + statuses.payment_required + statuses.cancelled}
              change={`${statuses.trial_ended} trial ended · ${statuses.cancelled} cancelled`}
              color="#f9e9e7"
            />
          </div>

          <div className="admin-overview-grid">
            <section className="card detail-card" aria-labelledby="admin-collected-title">
              <h2 id="admin-collected-title">Collected subscription payments</h2>
              {collected.length === 0 ? (
                <p className="muted">No subscription payments have been recorded yet.</p>
              ) : (
                <dl className="detail-list">
                  {collected.map((row) => (
                    <div className="wide" key={row.currency}>
                      <dt>Last {overview.collected.windowDays} days{collected.length > 1 ? ` (${row.currency})` : ''}</dt>
                      <dd className="admin-mrr">{formatPaise(row.windowPaise, row.currency)}</dd>
                      <small className="muted">
                        {plural(row.windowPayments, 'payment')} · {formatPaise(row.totalPaise, row.currency)} from{' '}
                        {plural(row.payments, 'payment')} recorded since {formatShortDate(row.firstPaidAt)}
                      </small>
                    </div>
                  ))}
                </dl>
              )}
              <p className="muted admin-note">
                Money Razorpay reported as captured, from Cove&apos;s payment receipts, before any refunds. Payments
                made before receipts existed are only included once the receipt backfill has been run.
              </p>
            </section>

            <section className="card detail-card" aria-labelledby="admin-mrr-title">
              <h2 id="admin-mrr-title">Estimated MRR</h2>
              <dl className="detail-list">
                <div>
                  <dt>Estimate (list price)</dt>
                  <dd className="admin-mrr">{formatPrice(overview.revenue.estimatedMrr, overview.revenue.currency)}</dd>
                </div>
                <div>
                  <dt>Renewing subscriptions</dt>
                  <dd>{overview.revenue.activeSubscriptions}</dd>
                </div>
                <div className="wide">
                  <dt>How this is calculated</dt>
                  <dd className="muted">
                    {(overview.revenue.plans || []).map((plan) => (
                      `${plan.activeSubscriptions} × ${plan.name} (${formatPrice(plan.pricePerMonth, overview.revenue.currency)}/month)`
                    )).join(' + ')}.
                    {' '}Not money received. Excludes {overview.revenue.cancellingSubscriptions} cancelling, trials,
                    past-due, and admin shops without a paid plan.
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
                  <p className="muted admin-list-more">
                    {overview.trialsEndingSoon.withoutAutopay} of {overview.trialsEndingSoon.count} without autopay
                  </p>
                  {overview.trialsEndingSoon.items.map((item) => {
                    const days = daysUntil(item.trialEndAt);
                    return (
                      <Link className="admin-list-row admin-list-row-status" key={item.id} to={`/admin/businesses/${item.id}`}>
                        <div>
                          <strong>{item.name}</strong>
                          <small>{days === 0 ? 'Ends today' : `${days} day${days === 1 ? '' : 's'} left`} · {formatShortDate(item.trialEndAt)}</small>
                        </div>
                        <Badge tone={TRIAL_PAYMENT_TONE[item.paymentMethod] || 'neutral'}>
                          {TRIAL_PAYMENT_LABELS[item.paymentMethod] || 'Unknown'}
                        </Badge>
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

            <section className="card detail-card" aria-labelledby="admin-status-title">
              <h2 id="admin-status-title">Accounts by status</h2>
              <dl className="detail-list admin-status-list">
                {STATUS_ROWS.map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{statuses[key] || 0}</dd>
                  </div>
                ))}
                {CLOSED_ROWS.map(([key, label]) => (
                  <div key={key}>
                    <dt>Storefront {label.charAt(0).toLowerCase() + label.slice(1)}</dt>
                    <dd>{totals.closedStores[key] || 0}</dd>
                  </div>
                ))}
              </dl>
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
                      <small>
                        {item.owner?.email || 'No owner'}
                        {item.owner && !item.owner.emailVerified ? ' (not verified)' : ''} · {formatShortDate(item.createdAt)}
                      </small>
                    </div>
                    <span className="admin-badges">
                      {item.store.state !== 'live' ? (
                        <Badge tone={STORE_STATE_TONE[item.store.state] || 'neutral'}>{item.store.label}</Badge>
                      ) : null}
                      <Badge tone={ACCOUNT_STATUS_TONE[item.subscription.accountStatus] || 'neutral'}>
                        {item.subscription.accountStatusLabel}
                      </Badge>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="card detail-card admin-recent" aria-labelledby="admin-activity-title">
            <h2 id="admin-activity-title">Recent admin actions</h2>
            {overview.recentAdminActions.length === 0 ? (
              <p className="muted">No admin has archived, restored, deleted, or changed admin access yet.</p>
            ) : (
              <div className="admin-list">
                {overview.recentAdminActions.map((entry) => {
                  const body = (
                    <>
                      <strong>{entry.label}: {entry.businessName || entry.businessSlug || 'Unknown shop'}</strong>
                      <small>
                        {entry.adminEmail || 'Unknown admin'} · {formatOrderDate(entry.at)}
                        {entry.targetEmail ? ` · ${entry.targetEmail}` : ''}
                        {entry.summary ? ` · ${entry.summary}` : ''}
                      </small>
                    </>
                  );
                  return entry.businessExists ? (
                    <Link className="admin-list-row" key={entry.id} to={`/admin/businesses/${entry.businessId}`}>{body}</Link>
                  ) : (
                    <div className="admin-list-row" key={entry.id}>{body}</div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

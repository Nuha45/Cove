import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PageIntro from '../../components/ui/PageIntro';
import Badge from '../../components/ui/Badge';
import { getAdminBusiness } from '../../services/adminService';
import { formatOrderDate } from '../../utils/display';
import { getErrorMessage } from '../../utils/errors';
import { ACCOUNT_STATUS_TONE, daysUntil, formatShortDate } from '../../utils/adminDisplay';

const BILLING_LABELS = {
  none: 'No subscription record',
  incomplete: 'Incomplete',
  trialing: 'Trialing',
  active: 'Active',
  past_due: 'Past due',
  halted: 'Halted',
  cancelled: 'Cancelled',
};

export default function AdminBusinessDetailPage() {
  const { id } = useParams();
  const [business, setBusiness] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    setLoadError('');
    getAdminBusiness(id)
      .then((result) => {
        if (cancelled) return;
        setBusiness(result.business);
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
  }, [id]);

  const subscription = business?.subscription;
  const trialDays = subscription?.accountStatus === 'trial' ? daysUntil(subscription.trialEndAt) : null;

  return (
    <>
      <Link className="back-link" to="/admin/businesses">
        <ArrowLeft size={16} /> Businesses
      </Link>

      {loadState === 'loading' ? <section className="card panel-state">Loading this business...</section> : null}

      {loadState === 'error' ? (
        <section className="card panel-state">
          <p className="form-error">{loadError}</p>
          <Link className="secondary" to="/admin/businesses">Back to businesses</Link>
        </section>
      ) : null}

      {loadState === 'ready' && business ? (
        <>
          <PageIntro
            eyebrow="BUSINESS"
            title={business.name}
            subtitle={`${business.category}${business.city ? ` · ${business.city}` : ''} · Joined ${formatShortDate(business.createdAt)}`}
          />

          <div className="stats-grid admin-count-grid">
            {[
              ['Products', business.counts.products, `${business.counts.activeProducts} active`],
              ['Orders', business.counts.orders, 'All time'],
              ['Customers', business.counts.customers, 'All time'],
              ['Customer requests', business.counts.customerRequests, 'All time'],
            ].map(([label, value, hint]) => (
              <div className="stat-card" key={label}>
                <div className="stat-value">{value}</div>
                <div className="stat-label">{label}</div>
                <small className="muted admin-count-hint">{hint}</small>
              </div>
            ))}
          </div>

          <div className="admin-overview-grid">
            <section className="card detail-card">
              <h2>Business</h2>
              <dl className="detail-list">
                <div>
                  <dt>Owner</dt>
                  <dd>{business.owner?.name || '—'}</dd>
                </div>
                <div>
                  <dt>Owner email</dt>
                  <dd>{business.owner?.email || '—'}</dd>
                </div>
                <div>
                  <dt>Storefront</dt>
                  <dd>{business.storefrontActive ? 'Live' : 'Paused'} · /store/{business.slug}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatShortDate(business.createdAt)}</dd>
                </div>
                <div className="wide">
                  <dt>Last activity</dt>
                  <dd>
                    {business.lastActivity
                      ? `${business.lastActivity.label} · ${formatOrderDate(business.lastActivity.at)}`
                      : 'No products, orders, or requests yet'}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="card detail-card">
              <div className="admin-section-head">
                <h2>Subscription</h2>
                <Badge tone={ACCOUNT_STATUS_TONE[subscription.accountStatus] || 'neutral'}>
                  {subscription.accountStatusLabel}
                </Badge>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Billing status</dt>
                  <dd>{BILLING_LABELS[subscription.billingStatus] || subscription.billingStatus}</dd>
                </div>
                <div>
                  <dt>Trial</dt>
                  <dd>
                    {subscription.trialEndAt
                      ? `${formatShortDate(subscription.trialStartAt)} – ${formatShortDate(subscription.trialEndAt)}`
                      : '—'}
                    {trialDays !== null ? ` (${trialDays} day${trialDays === 1 ? '' : 's'} left)` : ''}
                  </dd>
                </div>
                <div>
                  <dt>Current period ends</dt>
                  <dd>{formatShortDate(subscription.currentPeriodEndAt)}</dd>
                </div>
                <div>
                  <dt>Cancellation</dt>
                  <dd>
                    {subscription.cancelledAt
                      ? `Cancelled ${formatShortDate(subscription.cancelledAt)}`
                      : subscription.cancelAtPeriodEnd ? 'Cancels at period end' : '—'}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </>
      ) : null}
    </>
  );
}

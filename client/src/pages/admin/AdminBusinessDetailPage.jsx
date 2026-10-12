import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, ArrowLeft, RotateCcw, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import PageIntro from '../../components/ui/PageIntro';
import Badge from '../../components/ui/Badge';
import BusinessActionDialog from '../../components/admin/BusinessActionDialog';
import { getAdminBusiness } from '../../services/adminService';
import { formatOrderDate } from '../../utils/display';
import { getErrorMessage } from '../../utils/errors';
import {
  ACCOUNT_STATUS_TONE,
  SETUP_STEP_LABELS,
  STORE_STATE_TONE,
  TRIAL_PAYMENT_LABELS,
  daysUntil,
  formatPaise,
  formatShortDate,
} from '../../utils/adminDisplay';

const BILLING_LABELS = {
  none: 'No subscription record',
  incomplete: 'Incomplete',
  trialing: 'Trialing',
  active: 'Active',
  past_due: 'Past due',
  halted: 'Halted',
  cancelled: 'Cancelled',
};

function razorpayLabel(subscription) {
  if (subscription.unfinishedCheckout) return 'Unfinished checkout: cannot charge unless the seller completes it';
  if (!subscription.liveProviderSubscription) return 'None that can charge';
  if (subscription.billingStatus === 'active' && subscription.cancelAtPeriodEnd) {
    return 'Paid until the period ends, then cancels: will not charge again';
  }
  return 'Not cancelled: can still charge';
}

export default function AdminBusinessDetailPage() {
  const { id } = useParams();
  const [business, setBusiness] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [actionMode, setActionMode] = useState(null);
  const navigate = useNavigate();

  function handleActionDone(mode, result) {
    setActionMode(null);
    if (mode === 'delete') {
      navigate('/admin/businesses', { replace: true });
      return;
    }
    setBusiness(result.business);
  }

  // The shop may have changed since this page loaded (e.g. a new link), so show what the server has now.
  function handleActionFailed() {
    getAdminBusiness(id)
      .then((result) => setBusiness(result.business))
      .catch(() => {});
  }

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
  const receipts = business?.receipts || { items: [], totals: [] };
  const history = business?.adminHistory || [];

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
              ['Orders', business.counts.orders, `${business.counts.storefrontOrders} from storefront`],
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
                  <dd>
                    {business.owner?.email || '—'}
                    {business.owner ? (
                      <>
                        {' '}
                        <Badge tone={business.owner.emailVerified ? 'green' : 'yellow'}>
                          {business.owner.emailVerified ? 'Verified' : 'Not verified'}
                        </Badge>
                      </>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{business.phone || '—'}</dd>
                </div>
                <div>
                  <dt>Storefront</dt>
                  <dd>
                    <Badge tone={STORE_STATE_TONE[business.store.state] || 'neutral'}>{business.store.label}</Badge>
                    {' '}/store/{business.slug}
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatShortDate(business.createdAt)}</dd>
                </div>
                <div>
                  <dt>First storefront order</dt>
                  <dd>{business.firstStorefrontOrderAt ? formatShortDate(business.firstStorefrontOrderAt) : 'None yet'}</dd>
                </div>
                <div className="wide">
                  <dt>Setup ({business.setup.done}/{business.setup.total})</dt>
                  <dd>
                    <ul className="admin-setup-list">
                      {Object.entries(SETUP_STEP_LABELS).map(([key, label]) => (
                        <li key={key} className={business.setup[key] ? 'done' : 'missing'}>
                          {business.setup[key] ? '✓' : '✗'} {label}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div className="wide">
                  <dt>Last seller action</dt>
                  <dd>
                    {business.lastSellerActivity
                      ? `${business.lastSellerActivity.label} · ${formatOrderDate(business.lastSellerActivity.at)}`
                      : 'No seller actions recorded yet'}
                    <small className="muted admin-dd-note">
                      Counts products added, orders the seller recorded, and payments they updated. Logins and
                      settings changes are not tracked.
                    </small>
                  </dd>
                </div>
                <div className="wide">
                  <dt>Last store activity</dt>
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
                  <dt>Plan</dt>
                  <dd>{subscription.planName || '—'}</dd>
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
                {subscription.trialPaymentMethod ? (
                  <div>
                    <dt>After the trial</dt>
                    <dd>{TRIAL_PAYMENT_LABELS[subscription.trialPaymentMethod]}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Current period ends</dt>
                  <dd>{formatShortDate(subscription.currentPeriodEndAt)}</dd>
                </div>
                {subscription.pastDueSince ? (
                  <div>
                    <dt>Payment failing since</dt>
                    <dd>{formatShortDate(subscription.pastDueSince)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Cancellation</dt>
                  <dd>
                    {subscription.cancelledAt
                      ? `Cancelled ${formatShortDate(subscription.cancelledAt)}`
                      : subscription.cancelAtPeriodEnd ? 'Cancels at period end' : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Razorpay subscription</dt>
                  <dd>{razorpayLabel(subscription)}</dd>
                </div>
              </dl>
            </section>
          </div>

          <div className="admin-overview-grid">
            <section className="card detail-card" aria-labelledby="admin-receipts-title">
              <div className="admin-section-head">
                <h2 id="admin-receipts-title">Payments received</h2>
                {receipts.totals.map((row) => (
                  <Badge tone="green" key={row.currency}>
                    {formatPaise(row.totalPaise, row.currency)} · {row.payments} payment{row.payments === 1 ? '' : 's'}
                  </Badge>
                ))}
              </div>
              <p className="muted admin-note admin-note-top">Captured by Razorpay, before any refunds.</p>
              {receipts.items.length === 0 ? (
                <p className="muted">No Cove subscription payments recorded for this shop.</p>
              ) : (
                <div className="admin-list">
                  {receipts.items.map((receipt) => (
                    <div className="admin-list-row" key={receipt.id}>
                      <strong>{formatPaise(receipt.amountPaise, receipt.currency)} · {receipt.planName}</strong>
                      <small>
                        {receipt.receiptNumber} · Paid {formatShortDate(receipt.paidAt)}
                        {receipt.periodEndAt ? ` · Covers to ${formatShortDate(receipt.periodEndAt)}` : ''}
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card detail-card" aria-labelledby="admin-history-title">
              <h2 id="admin-history-title">Admin history</h2>
              {history.length === 0 ? (
                <p className="muted">No admin actions on this shop yet.</p>
              ) : (
                <div className="admin-list">
                  {history.map((entry) => (
                    <div className="admin-list-row" key={entry.id}>
                      <strong>{entry.label}{entry.targetEmail ? ` · ${entry.targetEmail}` : ''}</strong>
                      <small>{entry.adminEmail || 'Unknown admin'} · {formatOrderDate(entry.at)}</small>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {business.owner ? (
            <section className="card detail-card">
              <div className="admin-section-head">
                <h2>Admin access</h2>
                <Badge tone={business.owner.isPlatformAdmin ? 'blue' : 'neutral'}>
                  {business.owner.isPlatformAdmin ? 'Platform admin' : 'Seller'}
                </Badge>
              </div>
              {business.owner.isYou ? (
                <p className="muted">This is your account. Another platform admin has to change your admin access.</p>
              ) : business.owner.isPlatformAdmin ? (
                <>
                  <p className="muted">
                    The owner can open the Admin panel, and this shop does not need a Cove plan. Removing access
                    takes effect immediately.
                  </p>
                  <div className="admin-danger-actions">
                    <button className="secondary" type="button" onClick={() => setActionMode('revokeAdmin')}>
                      <ShieldOff size={15} aria-hidden="true" /> Remove admin access
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted">
                    {business.archivedAt
                      ? 'Restore this shop before granting its owner admin access.'
                      : 'Give the owner of this shop access to the Admin panel. Their shop will no longer need a Cove plan.'}
                  </p>
                  <div className="admin-danger-actions">
                    <button
                      className="secondary"
                      type="button"
                      disabled={Boolean(business.archivedAt)}
                      onClick={() => setActionMode('grantAdmin')}
                    >
                      <ShieldCheck size={15} aria-hidden="true" /> Make platform admin
                    </button>
                  </div>
                </>
              )}
            </section>
          ) : null}

          <section className="card detail-card admin-danger-card">
            <div className="admin-section-head">
              <h2>Shop actions</h2>
              {business.archivedAt ? <Badge tone="neutral">Archived {formatShortDate(business.archivedAt)}</Badge> : null}
            </div>
            {business.archivedAt ? (
              <>
                <p className="muted">
                  This shop is offline and its owner cannot log in. Restore it to bring it back, or permanently
                  delete the seller account with all of its shop data and uploaded files.
                </p>
                <div className="admin-danger-actions">
                  <button className="secondary" type="button" onClick={() => setActionMode('restore')}>
                    <RotateCcw size={15} aria-hidden="true" /> Restore shop
                  </button>
                  <button className="danger" type="button" onClick={() => setActionMode('delete')}>
                    <Trash2 size={15} aria-hidden="true" /> Delete seller account
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">
                  Archiving takes the storefront offline and signs the owner out. Nothing is deleted, and you can
                  restore it later. A shop must be archived before the seller account can be deleted. A shop whose
                  Razorpay subscription can still charge cannot be archived; an unfinished checkout is cancelled in
                  Razorpay first.
                </p>
                <div className="admin-danger-actions">
                  <button className="danger" type="button" onClick={() => setActionMode('archive')}>
                    <Archive size={15} aria-hidden="true" /> Archive shop
                  </button>
                </div>
              </>
            )}
          </section>

          {actionMode ? (
            <BusinessActionDialog
              business={business}
              mode={actionMode}
              onClose={() => setActionMode(null)}
              onDone={handleActionDone}
              onFailed={handleActionFailed}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

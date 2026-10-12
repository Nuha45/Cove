import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, RotateCcw, Search, Trash2 } from 'lucide-react';
import PageIntro from '../../components/ui/PageIntro';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import BusinessActionDialog from '../../components/admin/BusinessActionDialog';
import { listAdminBusinesses } from '../../services/adminService';
import { formatEyebrowDate } from '../../utils/display';
import { getErrorMessage } from '../../utils/errors';
import {
  ACCOUNT_STATUS_TONE,
  BUSINESS_FILTERS,
  STORE_STATE_TONE,
  TRIAL_PAYMENT_LABELS,
  formatShortDate,
  missingSetupSteps,
} from '../../utils/adminDisplay';

const PAGE_SIZE = 20;

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function activityText(business) {
  const activity = business.lastSellerActivity;
  return activity ? `${activity.label} · ${formatShortDate(activity.at)}` : 'No seller activity yet';
}

function countsText(business) {
  const { counts } = business;
  return `${plural(counts.activeProducts, 'active product')} · ${plural(counts.orders, 'order')}`;
}

function setupText(business) {
  const missing = missingSetupSteps(business.setup);
  return missing.length ? `Missing: ${missing.join(', ')}` : 'Setup complete';
}

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [action, setAction] = useState(null);
  const [notice, setNotice] = useState('');

  function handleActionDone(mode, result) {
    const name = action?.business.name || 'Shop';
    setAction(null);
    setNotice(
      mode === 'delete' ? `${result.name || name} was permanently deleted.`
        : mode === 'archive' ? `${name} was archived.`
          : `${name} was restored.`
    );
    setReloadKey((key) => key + 1);
  }

  function statusBadges(business) {
    if (business.archivedAt) return <Badge tone="neutral">Archived</Badge>;
    const { subscription, store } = business;
    return (
      <span className="admin-badges">
        <Badge tone={ACCOUNT_STATUS_TONE[subscription.accountStatus] || 'neutral'}>
          {subscription.accountStatusLabel}
        </Badge>
        {store.state !== 'live' ? (
          <Badge tone={STORE_STATE_TONE[store.state] || 'neutral'}>{store.label}</Badge>
        ) : null}
        {subscription.trialPaymentMethod ? (
          <small className="muted">{TRIAL_PAYMENT_LABELS[subscription.trialPaymentMethod]}</small>
        ) : null}
      </span>
    );
  }

  function rowActions(business, { labels = false } = {}) {
    return (
      <>
        {business.archivedAt ? (
          <>
            <button
              className="secondary tiny"
              type="button"
              title="Restore shop"
              aria-label={`Restore ${business.name}`}
              onClick={() => setAction({ business, mode: 'restore' })}
            >
              <RotateCcw size={14} aria-hidden="true" />{labels ? ' Restore' : null}
            </button>
            <button
              className="secondary tiny admin-delete-button"
              type="button"
              title="Delete permanently"
              aria-label={`Delete ${business.name} permanently`}
              onClick={() => setAction({ business, mode: 'delete' })}
            >
              <Trash2 size={14} aria-hidden="true" />{labels ? ' Delete' : null}
            </button>
          </>
        ) : (
          <button
            className="secondary tiny"
            type="button"
            title="Archive shop"
            aria-label={`Archive ${business.name}`}
            onClick={() => setAction({ business, mode: 'archive' })}
          >
            <Archive size={14} aria-hidden="true" />{labels ? ' Archive' : null}
          </button>
        )}
      </>
    );
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    setLoadError('');
    listAdminBusinesses({
      search: query || undefined,
      filter: filter === 'all' ? undefined : filter,
      page,
      limit: PAGE_SIZE,
    })
      .then((result) => {
        if (cancelled) return;
        setBusinesses(result.businesses);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        if (result.page !== page && result.totalPages > 0) setPage(result.page);
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
  }, [query, filter, page, reloadKey]);

  const emptyBecauseFilter = total === 0 && (query || filter !== 'all');

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Businesses"
        subtitle="Search every shop on Cove by business name, link, owner name, or owner email."
      />

      {notice ? <p className="form-success admin-notice" role="status">{notice}</p> : null}

      <section className="card table-card">
        <div className="table-tools">
          <div className="search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search business, owner, or email"
              aria-label="Search businesses"
              maxLength={80}
            />
          </div>
          <select
            className="filter-select"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(1);
            }}
            aria-label="Show businesses"
          >
            {BUSINESS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {loadState === 'loading' ? <div className="panel-state">Loading businesses...</div> : null}

        {loadState === 'error' ? (
          <div className="panel-state">
            <p className="form-error">{loadError}</p>
            <button className="secondary" type="button" onClick={() => setReloadKey((key) => key + 1)}>
              Try again
            </button>
          </div>
        ) : null}

        {loadState === 'ready' && businesses.length === 0 ? (
          <div className="panel-state">
            <EmptyState
              title={emptyBecauseFilter ? 'No matching businesses' : 'No businesses yet'}
              text={emptyBecauseFilter ? 'Try a different search or filter.' : 'Businesses appear here as sellers sign up.'}
            />
          </div>
        ) : null}

        {loadState === 'ready' && businesses.length > 0 ? (
          <>
            <div className="list-summary">{total} {total === 1 ? 'business' : 'businesses'}</div>
            <div className="admin-table">
              <div className="table-head">
                <span>Business</span>
                <span>Owner</span>
                <span>Status</span>
                <span>Setup</span>
                <span>Seller activity</span>
                <span className="col-center">Joined</span>
                <span className="col-action" aria-hidden="true" />
              </div>
              {businesses.map((business) => (
                <div className="table-row" key={business.id}>
                  <div className="admin-cell">
                    <strong>{business.name}</strong>
                    <small>{business.category}</small>
                  </div>
                  <div className="admin-cell">
                    <strong>{business.owner?.name || '—'}</strong>
                    <small>
                      {business.owner?.email || 'No owner on file'}
                      {business.owner && !business.owner.emailVerified ? ' · Not verified' : ''}
                    </small>
                  </div>
                  <div>{statusBadges(business)}</div>
                  <div className="admin-cell">
                    <strong>{business.setup.done}/{business.setup.total}</strong>
                    <small title={setupText(business)}>{setupText(business)}</small>
                  </div>
                  <div className="admin-cell">
                    <strong>{countsText(business)}</strong>
                    <small title={activityText(business)}>{activityText(business)}</small>
                  </div>
                  <span className="col-center">{formatShortDate(business.createdAt)}</span>
                  <span className="col-action admin-row-actions">
                    <Link className="secondary tiny" to={`/admin/businesses/${business.id}`}>View</Link>
                    {rowActions(business)}
                  </span>
                </div>
              ))}
            </div>

            <div className="admin-cards">
              {businesses.map((business) => (
                <article className="customer-card" key={business.id}>
                  <div className="customer-card-meta">
                    <div className="admin-cell">
                      <strong>{business.name}</strong>
                      <small>{business.category}</small>
                    </div>
                    {statusBadges(business)}
                  </div>
                  <small>
                    {business.owner?.email || 'No owner on file'}
                    {business.owner && !business.owner.emailVerified ? ' (not verified)' : ''} · Joined {formatShortDate(business.createdAt)}
                  </small>
                  <small>Setup {business.setup.done}/{business.setup.total} · {setupText(business)}</small>
                  <small>{countsText(business)} · {activityText(business)}</small>
                  <div className="admin-card-actions">
                    <Link className="secondary" to={`/admin/businesses/${business.id}`}>View business</Link>
                    {rowActions(business, { labels: true })}
                  </div>
                </article>
              ))}
            </div>

            {totalPages > 1 ? (
              <div className="pager">
                <button className="secondary" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                  Previous
                </button>
                <span>Page {page} of {totalPages}</span>
                <button className="secondary" type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
                  Next
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {action ? (
        <BusinessActionDialog
          business={action.business}
          mode={action.mode}
          onClose={() => setAction(null)}
          onDone={handleActionDone}
        />
      ) : null}
    </>
  );
}

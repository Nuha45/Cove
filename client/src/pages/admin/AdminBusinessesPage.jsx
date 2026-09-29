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
import { ACCOUNT_STATUS_TONE, formatShortDate } from '../../utils/adminDisplay';

const PAGE_SIZE = 20;

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
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

  function statusBadge(business) {
    if (business.archivedAt) return <Badge tone="neutral">Archived</Badge>;
    return (
      <Badge tone={ACCOUNT_STATUS_TONE[business.subscription.accountStatus] || 'neutral'}>
        {business.subscription.accountStatusLabel}
      </Badge>
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
    listAdminBusinesses({ search: query || undefined, page, limit: PAGE_SIZE })
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
  }, [query, page, reloadKey]);

  const emptyBecauseFilter = total === 0 && query;

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
              text={emptyBecauseFilter ? 'Try a different name or email.' : 'Businesses appear here as sellers sign up.'}
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
                <span className="col-center">Status</span>
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
                    <small>{business.owner?.email || 'No owner on file'}</small>
                  </div>
                  <span className="col-center">{statusBadge(business)}</span>
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
                    {statusBadge(business)}
                  </div>
                  <small>{business.owner?.email || 'No owner on file'} · Joined {formatShortDate(business.createdAt)}</small>
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

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Search } from 'lucide-react';
import PageIntro from '../components/ui/PageIntro';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { listCustomerWants } from '../services/customerWantService';
import { formatEyebrowDate, formatOrderDate } from '../utils/display';
import { getErrorMessage } from '../utils/errors';
import { WANT_STATUSES, WANT_STATUS_TONE } from '../utils/customerWants';

export default function CustomerWantsPage() {
  const [wants, setWants] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      setLoadError('');
      try {
        const result = await listCustomerWants({
          search: query || undefined,
          status: status || undefined,
          page,
          limit: 12,
        });
        if (cancelled) return;
        setWants(result.wants);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        if (result.page !== page) setPage(result.page);
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
  }, [query, status, page, reloadKey]);

  const emptyBecauseFilter = total === 0 && (query || status);

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Customer Wants"
        subtitle="Requests from people who could not find what they needed in your shop."
      />

      <section className="card table-card">
        <div className="table-tools">
          <div className="search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search request, name, or phone"
              aria-label="Search customer wants"
            />
          </div>
          <div className="tool-filters">
            <select
              className="filter-select"
              aria-label="Filter by status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {WANT_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>

        {loadState === 'loading' ? <div className="panel-state">Loading requests...</div> : null}

        {loadState === 'error' ? (
          <div className="panel-state">
            <p className="form-error">{loadError}</p>
            <button className="secondary" type="button" onClick={() => setReloadKey((current) => current + 1)}>
              Try again
            </button>
          </div>
        ) : null}

        {loadState === 'ready' && wants.length === 0 ? (
          <div className="panel-state">
            <EmptyState
              title={emptyBecauseFilter ? 'No matching requests' : 'No requests yet'}
              text={emptyBecauseFilter
                ? 'Try a different search or filter.'
                : 'When a customer asks for something from your storefront, it will show up here.'}
            />
            {!emptyBecauseFilter ? (
              <p className="muted customer-hint">
                <Heart size={16} /> Share your shop link so customers can request what they cannot find.
              </p>
            ) : null}
          </div>
        ) : null}

        {loadState === 'ready' && wants.length > 0 ? (
          <>
            <div className="list-summary">{total} {total === 1 ? 'request' : 'requests'}</div>
            <div className="want-table">
              <div className="table-head">
                <span>Request</span>
                <span>Customer</span>
                <span>Qty</span>
                <span>Status</span>
                <span>Date</span>
                <span />
              </div>
              {wants.map((want) => (
                <div className="table-row" key={want.id}>
                  <div className="product-cell">
                    <div>
                      <strong className="clip">{want.request}</strong>
                      {want.notes ? <small className="clip">{want.notes}</small> : null}
                    </div>
                  </div>
                  <div className="product-cell">
                    <div>
                      <strong>{want.name}</strong>
                      <small>{want.phone || 'No phone'}</small>
                    </div>
                  </div>
                  <span>{want.quantity || '—'}</span>
                  <Badge tone={WANT_STATUS_TONE[want.status] || 'neutral'}>{want.status}</Badge>
                  <span>{formatOrderDate(want.createdAt)}</span>
                  <Link className="secondary tiny" to={`/customer-wants/${want.id}`}>View</Link>
                </div>
              ))}
            </div>

            <div className="want-cards">
              {wants.map((want) => (
                <article className="want-card" key={want.id}>
                  <div className="want-card-top">
                    <strong className="clip">{want.request}</strong>
                    <Badge tone={WANT_STATUS_TONE[want.status] || 'neutral'}>{want.status}</Badge>
                  </div>
                  <small>{want.name} · {want.phone || 'No phone'}</small>
                  <div className="want-card-meta">
                    <span>{want.quantity ? `Qty ${want.quantity}` : 'No quantity'}</span>
                    <span>{formatOrderDate(want.createdAt)}</span>
                  </div>
                  <Link className="secondary" to={`/customer-wants/${want.id}`}>View request</Link>
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
    </>
  );
}

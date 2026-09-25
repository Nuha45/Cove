import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users } from 'lucide-react';
import PageIntro from '../components/ui/PageIntro';
import EmptyState from '../components/ui/EmptyState';
import { listCustomers } from '../services/customerService';
import { formatEyebrowDate, formatOrderDate, formatPrice } from '../utils/display';
import { getErrorMessage } from '../utils/errors';

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
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
        const result = await listCustomers({
          search: query || undefined,
          page,
          limit: 12,
        });
        if (cancelled) return;
        setCustomers(result.customers);
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
  }, [query, page, reloadKey]);

  const emptyBecauseFilter = total === 0 && query;

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Customers"
        subtitle="People who order from your storefront appear here automatically."
      />

      <section className="card table-card">
        <div className="table-tools">
          <div className="search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, or email"
              aria-label="Search customers"
            />
          </div>
        </div>

        {loadState === 'loading' ? <div className="panel-state">Loading your customers...</div> : null}

        {loadState === 'error' ? (
          <div className="panel-state">
            <p className="form-error">{loadError}</p>
            <button className="secondary" type="button" onClick={() => setReloadKey((current) => current + 1)}>
              Try again
            </button>
          </div>
        ) : null}

        {loadState === 'ready' && customers.length === 0 ? (
          <div className="panel-state">
            <EmptyState
              title={emptyBecauseFilter ? 'No matching customers' : 'No customers yet'}
              text={emptyBecauseFilter
                ? 'Try a different search.'
                : 'When someone orders from your storefront, they will show up here.'}
            />
            {!emptyBecauseFilter ? (
              <p className="muted customer-hint">
                <Users size={16} /> Share your storefront link so customers can order without messaging you for every detail.
              </p>
            ) : null}
          </div>
        ) : null}

        {loadState === 'ready' && customers.length > 0 ? (
          <>
            <div className="list-summary">{total} {total === 1 ? 'customer' : 'customers'}</div>
            <div className="customer-table">
              <div className="table-head">
                <span>Customer</span>
                <span className="col-center">Phone</span>
                <span className="col-center">Orders</span>
                <span className="col-center">Spent</span>
                <span className="col-center">Last order</span>
                <span className="col-action" aria-hidden="true" />
              </div>
              {customers.map((customer) => (
                <div className="table-row" key={customer.id}>
                  <div className="product-cell">
                    <div>
                      <strong>{customer.name}</strong>
                      <small>{customer.email || 'No email'}</small>
                    </div>
                  </div>
                  <span className="col-center">{customer.phone || '—'}</span>
                  <span className="col-center">{customer.totalOrders}</span>
                  <strong className="col-center">{formatPrice(customer.totalSpent)}</strong>
                  <span className="col-center">{customer.lastOrderAt ? formatOrderDate(customer.lastOrderAt) : '—'}</span>
                  <span className="col-action">
                    <Link className="secondary tiny" to={`/customers/${customer.id}`}>View</Link>
                  </span>
                </div>
              ))}
            </div>

            <div className="customer-cards">
              {customers.map((customer) => (
                <article className="customer-card" key={customer.id}>
                  <div>
                    <strong>{customer.name}</strong>
                    <small>{customer.phone || 'No phone'}{customer.email ? ` · ${customer.email}` : ''}</small>
                  </div>
                  <div className="customer-card-meta">
                    <span>{customer.totalOrders} orders</span>
                    <strong>{formatPrice(customer.totalSpent)}</strong>
                  </div>
                  <small>Last order {customer.lastOrderAt ? formatOrderDate(customer.lastOrderAt) : '—'}</small>
                  <Link className="secondary" to={`/customers/${customer.id}`}>View customer</Link>
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

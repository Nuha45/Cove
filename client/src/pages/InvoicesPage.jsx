import { useEffect, useState } from 'react';
import { Download, Eye, Search } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import PageIntro from '../components/ui/PageIntro';
import EmptyState from '../components/ui/EmptyState';
import AdvancedLock from '../components/ui/AdvancedLock';
import { downloadInvoice, listInvoices, viewInvoice } from '../services/invoiceService';
import { formatEyebrowDate, formatOrderDate, formatPrice } from '../utils/display';
import { getErrorMessage } from '../utils/errors';

export default function InvoicesPage() {
  const { plan, notify } = useOutletContext();
  const advanced = Boolean(plan?.advanced);
  const [invoices, setInvoices] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!advanced) return undefined;
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      setLoadError('');
      try {
        const result = await listInvoices({ search: query || undefined, page, limit: 20 });
        if (cancelled) return;
        setInvoices(result.invoices);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        if (result.page !== page && result.totalPages > 0) setPage(result.page);
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
  }, [advanced, query, page, reloadKey]);

  async function run(invoice, action) {
    setBusy(`${invoice.id}:${action}`);
    try {
      if (action === 'view') await viewInvoice(invoice.id);
      else await downloadInvoice(invoice.id, invoice.invoiceNumber);
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusy('');
    }
  }

  const intro = (
    <PageIntro
      eyebrow={formatEyebrowDate()}
      title="Invoices"
      subtitle="PDF invoices for your orders, ready to view, download or share."
    />
  );

  if (plan?.loading) {
    return <>{intro}<section className="card panel-state">Loading...</section></>;
  }

  if (!advanced) {
    return (
      <>
        {intro}
        <AdvancedLock
          title="Professional PDF invoices for every order"
          text="Cove Plus creates a numbered invoice for each order automatically, keeps a searchable history, and lets you and your customers download it."
        />
      </>
    );
  }

  const emptyBecauseFilter = total === 0 && query;

  return (
    <>
      {intro}
      <section className="card table-card">
        <div className="table-tools">
          <div className="search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search invoice, order or customer"
              aria-label="Search invoices"
            />
          </div>
        </div>

        {loadState === 'loading' ? <div className="panel-state">Loading invoices...</div> : null}

        {loadState === 'error' ? (
          <div className="panel-state">
            <p className="form-error">{loadError}</p>
            <button className="secondary" type="button" onClick={() => setReloadKey((current) => current + 1)}>
              Try again
            </button>
          </div>
        ) : null}

        {loadState === 'ready' && invoices.length === 0 ? (
          <div className="panel-state">
            <EmptyState
              title={emptyBecauseFilter ? 'No matching invoices' : 'No invoices yet'}
              text={emptyBecauseFilter
                ? 'Try a different search.'
                : 'Invoices are created automatically for new orders. For an older order, open it and choose View invoice.'}
            />
            {!emptyBecauseFilter ? <Link className="secondary" to="/orders">Go to orders</Link> : null}
          </div>
        ) : null}

        {loadState === 'ready' && invoices.length > 0 ? (
          <>
            <div className="list-summary">{total} {total === 1 ? 'invoice' : 'invoices'}</div>
            <ul className="invoice-list">
              {invoices.map((invoice) => (
                <li className="invoice-row" key={invoice.id}>
                  <div className="invoice-main">
                    <strong>{invoice.invoiceNumber}</strong>
                    <small>
                      <Link to={`/orders/${invoice.orderId}`}>{invoice.orderNumber}</Link>
                      {' · '}
                      {invoice.customer?.name || 'Customer'}
                    </small>
                  </div>
                  <div className="invoice-meta">
                    <strong>{formatPrice(invoice.total, invoice.currency)}</strong>
                    <small>Issued {formatOrderDate(invoice.issuedAt)}</small>
                  </div>
                  <div className="invoice-actions">
                    <button
                      className="secondary tiny"
                      type="button"
                      onClick={() => run(invoice, 'view')}
                      disabled={Boolean(busy)}
                      aria-label={`View ${invoice.invoiceNumber}`}
                    >
                      <Eye size={14} /> {busy === `${invoice.id}:view` ? 'Opening...' : 'View'}
                    </button>
                    <button
                      className="secondary tiny"
                      type="button"
                      onClick={() => run(invoice, 'download')}
                      disabled={Boolean(busy)}
                      aria-label={`Download ${invoice.invoiceNumber}`}
                    >
                      <Download size={14} /> {busy === `${invoice.id}:download` ? 'Preparing...' : 'Download'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>

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

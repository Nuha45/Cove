import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import { getBillingReceiptInvoice, listBillingReceipts } from '../../services/billingService';
import { CURRENCIES } from '../../utils/currencies';
import { formatOrderDate, formatPrice } from '../../utils/display';
import { getErrorMessage } from '../../utils/errors';

const PAGE_SIZE = 10;
const OPEN_FEATURES = 'noopener,noreferrer';

function formatDay(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatAmount(amount, currency) {
  const code = String(currency || 'INR').toUpperCase();
  if (CURRENCIES.some((item) => item.code === code)) return formatPrice(amount, code);
  return `${code} ${Number(amount || 0).toFixed(2)}`;
}

function billingPeriod(receipt) {
  if (!receipt.periodStartAt || !receipt.periodEndAt) return '';
  return `${formatDay(receipt.periodStartAt)} – ${formatDay(receipt.periodEndAt)}`;
}

function safeInvoiceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

export default function PaymentHistory({ notify }) {
  const [receipts, setReceipts] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [opening, setOpening] = useState('');
  const [invoiceLinks, setInvoiceLinks] = useState({});
  const [invoiceMissing, setInvoiceMissing] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      setLoadError('');
      try {
        const result = await listBillingReceipts({ page, limit: PAGE_SIZE });
        if (cancelled) return;
        setReceipts(Array.isArray(result?.receipts) ? result.receipts : []);
        setTotal(Number(result?.total) || 0);
        setLimit(Number(result?.limit) || PAGE_SIZE);
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
  }, [page, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  async function openInvoice(receipt) {
    setOpening(receipt.id);
    try {
      const result = await getBillingReceiptInvoice(receipt.id);
      const url = safeInvoiceUrl(result?.url);
      if (!url) {
        notify('This invoice isn’t available right now. Please try again later.');
        return;
      }
      setInvoiceLinks((current) => ({ ...current, [receipt.id]: url }));
      const tab = window.open(url, '_blank', OPEN_FEATURES);
      if (tab) tab.opener = null;
    } catch (err) {
      if (err?.response?.status === 404) setInvoiceMissing((current) => ({ ...current, [receipt.id]: true }));
      notify(getErrorMessage(err));
    } finally {
      setOpening('');
    }
  }

  return (
    <section className="card table-card billing-history" aria-labelledby="billing-history-title">
      <div className="section-head padded">
        <h2 id="billing-history-title">Payment history</h2>
      </div>

      {loadState === 'loading' ? <div className="panel-state">Loading payments...</div> : null}

      {loadState === 'error' ? (
        <div className="panel-state">
          <p className="form-error">{loadError}</p>
          <button className="secondary" type="button" onClick={() => setReloadKey((current) => current + 1)}>
            Try again
          </button>
        </div>
      ) : null}

      {loadState === 'ready' && receipts.length === 0 ? (
        <div className="panel-state">
          <EmptyState
            title="No payments yet"
            text="Payments for your Cove plan appear here once Razorpay confirms them."
          />
        </div>
      ) : null}

      {loadState === 'ready' && receipts.length > 0 ? (
        <>
          <ul className="invoice-list">
            {receipts.map((receipt) => {
              const period = billingPeriod(receipt);
              const currency = String(receipt.currency || 'INR').toUpperCase();
              const link = invoiceLinks[receipt.id];
              const canView = (receipt.invoiceAvailable || receipt.invoiceLookupAvailable) && !invoiceMissing[receipt.id];
              return (
                <li className="invoice-row" key={receipt.id}>
                  <div className="invoice-main">
                    <strong>{receipt.planName || 'Cove plan'}</strong>
                    {period ? <small>Billing period {period}</small> : null}
                  </div>
                  <div className="invoice-meta">
                    <strong>{formatAmount(receipt.amount, currency)}</strong>
                    <small>{currency} · Paid {formatOrderDate(receipt.paidAt)}</small>
                  </div>
                  <div className="invoice-actions">
                    {link ? (
                      <a className="secondary tiny" href={link} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={14} /> View invoice
                      </a>
                    ) : !canView ? (
                      <small className="muted">Invoice not available yet</small>
                    ) : (
                      <button
                        className="secondary tiny"
                        type="button"
                        onClick={() => openInvoice(receipt)}
                        disabled={opening === receipt.id}
                      >
                        <ExternalLink size={14} /> {opening === receipt.id ? 'Opening...' : 'View invoice'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
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
  );
}

import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import PageIntro from '../components/ui/PageIntro';
import Badge from '../components/ui/Badge';
import { getCustomerWant, updateCustomerWant } from '../services/customerWantService';
import { formatOrderDate } from '../utils/display';
import { getErrorMessage, getFieldErrors } from '../utils/errors';
import { WANT_STATUSES, WANT_STATUS_TONE } from '../utils/customerWants';

export default function CustomerWantDetailPage() {
  const { id } = useParams();
  const { notify } = useOutletContext();
  const [want, setWant] = useState(null);
  const [status, setStatus] = useState('');
  const [sellerNotes, setSellerNotes] = useState('');
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      setLoadError('');
      try {
        const result = await getCustomerWant(id);
        if (cancelled) return;
        setWant(result.want);
        setStatus(result.want.status);
        setSellerNotes(result.want.sellerNotes || '');
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
  }, [id]);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setSaveError('');
    setFieldErrors({});
    try {
      const result = await updateCustomerWant(want.id, {
        status,
        sellerNotes,
      });
      setWant(result.want);
      setStatus(result.want.status);
      setSellerNotes(result.want.sellerNotes || '');
      notify('Request updated.');
    } catch (err) {
      setSaveError(getErrorMessage(err));
      setFieldErrors(getFieldErrors(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Link className="back-link" to="/customer-wants">
        <ArrowLeft size={16} /> Customer wants
      </Link>

      {loadState === 'loading' ? <section className="card panel-state">Loading this request...</section> : null}

      {loadState === 'error' ? (
        <section className="card panel-state">
          <p className="form-error">{loadError}</p>
          <Link className="secondary" to="/customer-wants">Back to requests</Link>
        </section>
      ) : null}

      {loadState === 'ready' && want ? (
        <>
          <PageIntro
            eyebrow="CUSTOMER WANT"
            title={want.name}
            subtitle={formatOrderDate(want.createdAt)}
          />

          <div className="detail-layout">
            <div className="detail-main">
              <section className="card detail-card">
                <h2>Request</h2>
                <p className="want-request-text">{want.request}</p>
                <dl className="detail-list">
                  <div>
                    <dt>Name</dt>
                    <dd>
                      {want.customerId ? (
                        <Link className="text-button" to={`/customers/${want.customerId}`}>{want.name}</Link>
                      ) : want.name}
                    </dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{want.phone || '—'}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{want.email || '—'}</dd>
                  </div>
                  <div>
                    <dt>Quantity</dt>
                    <dd>{want.quantity || '—'}</dd>
                  </div>
                  <div className="wide">
                    <dt>Customer notes</dt>
                    <dd>{want.notes || 'No notes'}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd><Badge tone={WANT_STATUS_TONE[want.status] || 'neutral'}>{want.status}</Badge></dd>
                  </div>
                </dl>
              </section>
            </div>

            <aside className="card detail-card">
              <h2>Manage</h2>
              <form onSubmit={save}>
                {saveError ? <p className="form-error">{saveError}</p> : null}
                <label>
                  Status
                  <select aria-label="Request status" value={status} onChange={(event) => setStatus(event.target.value)}>
                    {WANT_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  {fieldErrors.status ? <span className="field-error">{fieldErrors.status}</span> : null}
                </label>
                <label style={{ marginTop: 12, display: 'block' }}>
                  Private seller notes
                  <textarea
                    value={sellerNotes}
                    onChange={(event) => setSellerNotes(event.target.value)}
                    maxLength={500}
                    rows={6}
                    placeholder="Follow up on WhatsApp, check silver stock..."
                  />
                  {fieldErrors.sellerNotes ? <span className="field-error">{fieldErrors.sellerNotes}</span> : null}
                </label>
                <p className="muted">Only you can see these notes. They never appear on your public storefront.</p>
                <button className="primary" type="submit" disabled={saving} style={{ marginTop: 12, width: '100%', minHeight: 44 }}>
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
              </form>
            </aside>
          </div>
        </>
      ) : null}
    </>
  );
}

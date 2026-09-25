import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import PageIntro from '../components/ui/PageIntro';
import Badge from '../components/ui/Badge';
import { getCustomerWant, updateCustomerWant } from '../services/customerWantService';
import { formatOrderDate } from '../utils/display';
import { getErrorMessage, getFieldErrors } from '../utils/errors';
import {
  WANT_STATUSES,
  WANT_STATUS_TONE,
  boardVisibilityLabel,
  boardVisibilityTone,
} from '../utils/customerWants';

export default function CustomerWantDetailPage() {
  const { id } = useParams();
  const { notify } = useOutletContext();
  const [want, setWant] = useState(null);
  const [status, setStatus] = useState('');
  const [sellerNotes, setSellerNotes] = useState('');
  const [boardApproved, setBoardApproved] = useState(false);
  const [publicRequestText, setPublicRequestText] = useState('');
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [boardSaving, setBoardSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [boardError, setBoardError] = useState('');
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
        setBoardApproved(Boolean(result.want.boardApproved));
        setPublicRequestText(result.want.publicRequestText || result.want.request || '');
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
      applyWant(result.want);
      notify('Request updated.');
    } catch (err) {
      setSaveError(getErrorMessage(err));
      setFieldErrors(getFieldErrors(err));
    } finally {
      setSaving(false);
    }
  }

  function applyWant(next) {
    setWant(next);
    setStatus(next.status);
    setSellerNotes(next.sellerNotes || '');
    setBoardApproved(Boolean(next.boardApproved));
    setPublicRequestText(next.publicRequestText || next.request || '');
  }

  async function saveBoard(event) {
    event.preventDefault();
    if (!want.shareOnBoardOptIn) return;

    setBoardSaving(true);
    setBoardError('');
    setFieldErrors({});
    try {
      const result = await updateCustomerWant(want.id, {
        boardApproved,
        publicRequestText: publicRequestText.trim(),
      });
      applyWant(result.want);
      notify(result.want.boardApproved ? 'Request published to the board.' : 'Request unpublished from the board.');
    } catch (err) {
      setBoardError(getErrorMessage(err));
      setFieldErrors(getFieldErrors(err));
    } finally {
      setBoardSaving(false);
    }
  }

  async function unpublish() {
    setBoardSaving(true);
    setBoardError('');
    try {
      const result = await updateCustomerWant(want.id, { boardApproved: false });
      applyWant(result.want);
      notify('Request unpublished from the board.');
    } catch (err) {
      setBoardError(getErrorMessage(err));
    } finally {
      setBoardSaving(false);
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
                  <div>
                    <dt>Votes</dt>
                    <dd>{want.voteCount || 0}</dd>
                  </div>
                  <div>
                    <dt>Board</dt>
                    <dd>
                      <Badge tone={boardVisibilityTone(want)}>{boardVisibilityLabel(want)}</Badge>
                    </dd>
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

              <section className="card detail-card">
                <h2>Request board</h2>
                <p className="muted">
                  Board visibility is separate from New / In Progress / Fulfilled / Closed.
                  Only approved, opted-in requests appear anonymously on your public store.
                </p>

                {!want.shareOnBoardOptIn ? (
                  <div className="want-board-locked">
                    <Badge tone="neutral">Not publishable</Badge>
                    <p>
                      This customer did not opt in to share anonymously on the request board.
                      You cannot publish it.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={saveBoard}>
                    {boardError ? <p className="form-error">{boardError}</p> : null}
                    <label className="settings-toggle want-board-toggle">
                      <span>
                        <strong>Show on public request board</strong>
                        <small className="muted">Appears without the customer’s name or contact details.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={boardApproved}
                        onChange={(event) => setBoardApproved(event.target.checked)}
                      />
                    </label>
                    {fieldErrors.boardApproved ? (
                      <span className="field-error">{fieldErrors.boardApproved}</span>
                    ) : null}
                    <label style={{ marginTop: 12, display: 'block' }}>
                      Public request text
                      <textarea
                        value={publicRequestText}
                        onChange={(event) => setPublicRequestText(event.target.value)}
                        maxLength={500}
                        rows={4}
                        placeholder="What shoppers will see on the board"
                      />
                      {fieldErrors.publicRequestText ? (
                        <span className="field-error">{fieldErrors.publicRequestText}</span>
                      ) : null}
                    </label>
                    <p className="muted">
                      {want.voteCount || 0} {(want.voteCount || 0) === 1 ? 'vote' : 'votes'} so far.
                      Voting is interest only — not an order.
                    </p>
                    <div className="want-board-actions">
                      <button className="primary" type="submit" disabled={boardSaving}>
                        {boardSaving ? 'Saving…' : boardApproved ? 'Save & publish' : 'Save board settings'}
                      </button>
                      {want.boardApproved ? (
                        <button className="secondary" type="button" disabled={boardSaving} onClick={unpublish}>
                          Unpublish
                        </button>
                      ) : null}
                    </div>
                  </form>
                )}
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

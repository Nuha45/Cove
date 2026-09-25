import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Heart } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import Badge from '../../components/ui/Badge';
import { getWantBoard, voteWantBoard } from '../../services/storeService';
import { formatOrderDate } from '../../utils/display';
import { getErrorMessage } from '../../utils/errors';
import { WANT_STATUS_TONE } from '../../utils/customerWants';

const VOTED_KEY_PREFIX = 'cove-want-votes:';

function loadVotedIds(slug) {
  try {
    const raw = window.localStorage.getItem(`${VOTED_KEY_PREFIX}${slug}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveVotedIds(slug, ids) {
  try {
    window.localStorage.setItem(`${VOTED_KEY_PREFIX}${slug}`, JSON.stringify([...ids]));
  } catch {
    // Ignore storage failures — server still enforces uniqueness.
  }
}

export default function StoreWantBoardPage() {
  const { slug } = useParams();
  const { business } = useOutletContext();
  const shopName = business?.name || 'this shop';
  const [wants, setWants] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [votedIds, setVotedIds] = useState(() => loadVotedIds(slug));
  const [votingId, setVotingId] = useState('');
  const [voteMessage, setVoteMessage] = useState('');
  const [voteError, setVoteError] = useState('');

  useEffect(() => {
    setVotedIds(loadVotedIds(slug));
  }, [slug]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      setLoadError('');
      try {
        const result = await getWantBoard(slug, { page, limit: 24 });
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
  }, [slug, page, reloadKey]);

  async function handleVote(want) {
    setVoteError('');
    setVoteMessage('');
    if (votedIds.has(want.id)) {
      setVoteMessage('You already showed interest in this request.');
      return;
    }

    setVotingId(want.id);
    try {
      const result = await voteWantBoard(slug, want.id);
      setWants((current) => current.map((item) => (
        item.id === want.id ? result.want : item
      )));
      const nextVoted = new Set(votedIds);
      nextVoted.add(want.id);
      setVotedIds(nextVoted);
      saveVotedIds(slug, nextVoted);
      setVoteMessage(result.message || 'Thanks — your interest was recorded. This is not an order.');
    } catch (err) {
      if (err.response?.status === 409) {
        const nextVoted = new Set(votedIds);
        nextVoted.add(want.id);
        setVotedIds(nextVoted);
        saveVotedIds(slug, nextVoted);
      }
      setVoteError(getErrorMessage(err));
    } finally {
      setVotingId('');
    }
  }

  return (
    <div className="store-want-board">
      <Link className="back-link" to={`/store/${slug}`}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to shop
      </Link>

      <header className="store-want-board-intro">
        <p className="eyebrow">REQUEST BOARD</p>
        <h1>What should we stock next?</h1>
        <p>
          Anonymous ideas other shoppers shared with {shopName}.
          Showing interest is not an order, preorder, or commitment to buy.
        </p>
        <div className="store-want-board-actions">
          <Link className="primary" to={`/store/${slug}/want`}>Send your own request</Link>
        </div>
      </header>

      {voteMessage ? <p className="store-want-board-toast success" role="status">{voteMessage}</p> : null}
      {voteError ? <p className="store-want-board-toast form-error" role="alert">{voteError}</p> : null}

      {loadState === 'loading' ? (
        <div className="store-panel">Loading the request board...</div>
      ) : null}

      {loadState === 'error' ? (
        <div className="store-panel">
          <p className="form-error">{loadError}</p>
          <button className="secondary" type="button" onClick={() => setReloadKey((current) => current + 1)}>
            Try again
          </button>
        </div>
      ) : null}

      {loadState === 'ready' && wants.length === 0 ? (
        <div className="store-panel">
          <EmptyState
            title="No public requests yet"
            text="When the shop approves anonymous requests, they will show up here for others to support."
          />
          <Link className="secondary" to={`/store/${slug}/want`}>Request something</Link>
        </div>
      ) : null}

      {loadState === 'ready' && wants.length > 0 ? (
        <>
          <p className="muted store-want-board-count">
            {total} {total === 1 ? 'request' : 'requests'} on the board
          </p>
          <ul className="store-want-board-list">
            {wants.map((want) => {
              const alreadyVoted = votedIds.has(want.id);
              const voting = votingId === want.id;
              return (
                <li className="store-want-board-item" key={want.id}>
                  <div className="store-want-board-copy">
                    <p>{want.text}</p>
                    <div className="store-want-board-meta">
                      <span>{want.voteCount} {want.voteCount === 1 ? 'person interested' : 'people interested'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatOrderDate(want.publishedAt)}</span>
                      {want.status ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <Badge tone={WANT_STATUS_TONE[want.status] || 'neutral'}>{want.status}</Badge>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <button
                    className={alreadyVoted ? 'secondary' : 'primary'}
                    type="button"
                    disabled={voting || alreadyVoted}
                    aria-pressed={alreadyVoted}
                    onClick={() => handleVote(want)}
                  >
                    <Heart size={15} aria-hidden="true" />
                    {alreadyVoted ? 'Interest recorded' : voting ? 'Saving…' : 'I’m interested too'}
                  </button>
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
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getStorefront } from '../../services/storeService';
import { getErrorMessage } from '../../utils/errors';
import { mediaUrl } from '../../utils/media';
import { initials } from '../../utils/display';
import StoreLayout from './StoreLayout';

export default function StoreShell() {
  const { slug } = useParams();
  const [business, setBusiness] = useState(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState('loading');
      setError('');
      try {
        const result = await getStorefront(slug);
        if (cancelled) return;
        setBusiness(result.business);
        setState(result.business?.storefrontActive === false ? 'inactive' : 'ready');
      } catch (err) {
        if (cancelled) return;
        setBusiness(null);
        setError(getErrorMessage(err));
        setState(err.response?.status === 404 ? 'missing' : 'error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state === 'loading') {
    return <div className="store-status">Opening the shop...</div>;
  }

  if (state === 'missing') {
    return (
      <div className="store-status">
        <h1>Shop not found</h1>
        <p>That storefront link is not available. Check the link from the seller and try again.</p>
      </div>
    );
  }

  if (state === 'inactive') {
    return (
      <div className="store-status store-inactive">
        {business?.logo ? (
          <img className="store-inactive-logo" src={mediaUrl(business.logo)} alt="" />
        ) : (
          <span className="store-mark" aria-hidden="true">{initials(business?.name || 'S', 1)}</span>
        )}
        <h1>{business?.name || 'This shop'}</h1>
        <p>This shop is temporarily unavailable and is not accepting orders right now.</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="store-status">
        <h1>Something went wrong</h1>
        <p>{error}</p>
        <button className="primary" type="button" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }

  return <StoreLayout business={business} />;
}

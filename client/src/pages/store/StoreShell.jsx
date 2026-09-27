import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getStorefront } from '../../services/storeService';
import { getErrorMessage } from '../../utils/errors';
import { mediaUrl } from '../../utils/media';
import { initials } from '../../utils/display';
import { applySeo } from '../../utils/seo';
import StoreLayout from './StoreLayout';

const STATE_TITLES = {
  missing: 'Shop not found · Cove',
  error: 'Shop unavailable · Cove',
};

export default function StoreShell() {
  const { slug } = useParams();
  const [business, setBusiness] = useState(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  // The first unfiltered catalog is handed to the home page once so it does not fetch it again.
  const initialCatalog = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState('loading');
      setError('');
      initialCatalog.current = null;
      try {
        const result = await getStorefront(slug);
        if (cancelled) return;
        initialCatalog.current = {
          slug,
          products: result.products || [],
          categories: result.categories || [],
        };
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

  useEffect(() => {
    if (state === 'missing' || state === 'error' || state === 'inactive') {
      applySeo({
        title: state === 'inactive'
          ? `${business?.name || 'This shop'} is unavailable · Cove`
          : STATE_TITLES[state],
        robots: 'noindex, nofollow',
      });
    }
  }, [state, business?.name]);

  if (state === 'loading') {
    return <div className="store-status" role="status">Opening the shop...</div>;
  }

  if (state === 'missing') {
    return (
      <main className="store-status">
        <h1>Shop not found</h1>
        <p>That storefront link is not available. Check the link from the seller and try again.</p>
      </main>
    );
  }

  if (state === 'inactive') {
    return (
      <main className="store-status store-inactive">
        {business?.logo ? (
          <img className="store-inactive-logo" src={mediaUrl(business.logo)} alt="" />
        ) : (
          <span className="store-mark" aria-hidden="true">{initials(business?.name || 'S', 1)}</span>
        )}
        <h1>{business?.name || 'This shop'}</h1>
        <p>This shop is temporarily unavailable and is not accepting orders right now.</p>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="store-status">
        <h1>Something went wrong</h1>
        <p>{error}</p>
        <button className="primary" type="button" onClick={() => window.location.reload()}>Try again</button>
      </main>
    );
  }

  return <StoreLayout business={business} initialCatalog={initialCatalog} />;
}

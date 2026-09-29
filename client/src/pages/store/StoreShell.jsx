import { useEffect, useRef, useState } from 'react';
import { useMatch, useParams } from 'react-router-dom';
import { getStorefront } from '../../services/storeService';
import { getErrorMessage } from '../../utils/errors';
import { mediaUrl } from '../../utils/media';
import { initials } from '../../utils/display';
import { applySeo } from '../../utils/seo';
import { trackVisit } from '../../utils/tracking';
import StoreLayout from './StoreLayout';
import CoveLogo from '../../components/brand/CoveLogo';

const STATE_TITLES = {
  missing: 'Shop not found · Cove',
  error: 'Shop unavailable · Cove',
};

export default function StoreShell() {
  const { slug } = useParams();
  // Customers must still reach their order confirmation after a shop pauses or goes offline.
  const onOrderPage = Boolean(useMatch('/store/:slug/order/:orderNumber'));
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
        if (result.business?.paused) setState('paused');
        else setState(result.business?.storefrontActive === false ? 'inactive' : 'ready');
        if (result.business?.storefrontActive !== false && !result.business?.paused) trackVisit(slug);
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

  const closed = state === 'inactive' || state === 'paused';

  useEffect(() => {
    if (onOrderPage && closed) return;
    if (state === 'missing' || state === 'error' || closed) {
      let title = STATE_TITLES[state];
      if (state === 'inactive') title = `${business?.name || 'This shop'} is unavailable · Cove`;
      if (state === 'paused') title = `${business?.name || 'This store'} is paused · Cove`;
      applySeo({
        title,
        description: state === 'paused' ? 'This Cove store is paused and is not taking orders right now.' : undefined,
        robots: 'noindex, nofollow',
      });
    }
  }, [state, business?.name, onOrderPage, closed]);

  if (onOrderPage && closed) {
    return <StoreLayout business={business} initialCatalog={initialCatalog} />;
  }

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

  if (state === 'paused') {
    return (
      <main className="store-status store-paused">
        <section className="store-paused-card" aria-labelledby="store-paused-title">
          {business?.logo ? (
            <img className="store-inactive-logo" src={mediaUrl(business.logo)} alt="" />
          ) : (
            <span className="store-mark" aria-hidden="true">{initials(business?.name || 'S', 1)}</span>
          )}
          <p className="store-paused-name">{business?.name || 'This store'}</p>
          <h1 id="store-paused-title">This store is paused</h1>
          <p>It isn&apos;t taking orders on Cove right now. Please check back soon.</p>
          <p className="store-paused-owner">
            Own this store? <a href="/login">Log in</a> to reopen it.
          </p>
        </section>
        <p className="store-paused-brand">
          <span>Powered by</span> <CoveLogo size={20} />
        </p>
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

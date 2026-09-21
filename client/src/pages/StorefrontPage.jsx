import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Package } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageIntro from '../components/ui/PageIntro';
import EmptyState from '../components/ui/EmptyState';
import { listProducts } from '../services/productService';
import { formatEyebrowDate, formatPrice } from '../utils/display';
import { getErrorMessage } from '../utils/errors';
import { mediaUrl } from '../utils/media';
import { copyText, storefrontPath, storefrontUrl } from '../utils/storefront';

export default function StorefrontPage() {
  const { business } = useAuth();
  const { notify } = useOutletContext();
  const [copying, setCopying] = useState(false);
  const [products, setProducts] = useState([]);
  const [previewState, setPreviewState] = useState('loading');
  const [previewError, setPreviewError] = useState('');
  const slug = business?.slug || '';
  const url = storefrontUrl(slug);
  const path = storefrontPath(slug);
  const currency = business?.currency || 'INR';

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setPreviewState('loading');
      setPreviewError('');
      try {
        const result = await listProducts({ status: 'Active', limit: 6 });
        if (cancelled) return;
        setProducts(result.products);
        setPreviewState('ready');
      } catch (err) {
        if (cancelled) return;
        setPreviewError(getErrorMessage(err));
        setPreviewState('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCopy() {
    if (!url) return;
    setCopying(true);
    try {
      await copyText(url);
      notify('Storefront link copied.');
    } catch {
      notify('Could not copy the link. You can select it and copy manually.');
    } finally {
      setCopying(false);
    }
  }

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Storefront"
        subtitle="Share this link so customers can browse and order without messaging you for every detail."
        action={
          slug ? (
            <a className="primary" href={path} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Open store
            </a>
          ) : null
        }
      />

      <section className="card store-link-card">
        <p className="eyebrow">YOUR STOREFRONT</p>
        <h2>Share your shop link</h2>
        <p className="muted">Put this in your Instagram or WhatsApp bio. Orders land in your Orders page automatically.</p>
        <div className="store-link-row">
          <input readOnly value={url || path} aria-label="Storefront link" />
          <button className="secondary" type="button" onClick={handleCopy} disabled={!slug || copying}>
            <Copy size={15} /> {copying ? 'Copying...' : 'Copy link'}
          </button>
          <a className="secondary" href={path} target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> Open
          </a>
        </div>
      </section>

      <section className="store-preview card">
        <div className="store-preview-head">
          <div>
            <p className="eyebrow">LIVE PREVIEW</p>
            <h2>{business?.name || 'Your shop'}</h2>
            <p className="muted">
              This shows your real shop name, details, and active products — the same information customers see on your public store.
            </p>
          </div>
          {slug ? (
            <a className="secondary" href={path} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> Open full store
            </a>
          ) : null}
        </div>

        <div className="store-live-preview">
          <div className="store-live-preview-hero">
            <p className="eyebrow">{business?.category || 'SHOP'}</p>
            <h3>{business?.name || 'Your shop'}</h3>
            <p>
              {business?.description
                || (business?.storefrontActive === false
                  ? 'Your storefront is currently paused in Settings.'
                  : 'Add a short shop description in Settings so customers know what you sell.')}
            </p>
            <div className="store-live-preview-meta">
              {business?.pickupEnabled !== false ? <small>Pickup available</small> : null}
              {business?.deliveryEnabled !== false ? (
                <small>
                  Delivery
                  {Number(business?.deliveryFee) > 0
                    ? ` from ${formatPrice(business.deliveryFee, currency)}`
                    : ' available'}
                </small>
              ) : null}
              {business?.storefrontActive === false ? <small>Storefront paused</small> : null}
            </div>
          </div>

          {previewState === 'loading' ? <p className="muted">Loading your products...</p> : null}
          {previewState === 'error' ? <p className="form-error">{previewError}</p> : null}

          {previewState === 'ready' && products.length === 0 ? (
            <div className="store-live-preview-empty">
              <EmptyState
                title="No active products yet"
                text="Add an active product to see it here. Customers will see the same empty shop until you do."
              />
              <Link className="secondary" to="/products">Go to Products</Link>
            </div>
          ) : null}

          {previewState === 'ready' && products.length > 0 ? (
            <>
              <h4>Active products</h4>
              <div className="store-live-preview-grid">
                {products.map((product) => (
                  <div className="store-live-preview-card" key={product.id}>
                    <PreviewThumb product={product} />
                    <strong>{product.name}</strong>
                    <span>{formatPrice(product.price, currency)}</span>
                    <small>{product.stockQuantity > 0 ? `${product.stockQuantity} in stock` : 'Out of stock'}</small>
                  </div>
                ))}
              </div>
              <p className="muted">Showing up to 6 active products. Open the full store to browse everything.</p>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}

function PreviewThumb({ product }) {
  const src = product.images?.[0];
  if (!src) {
    return (
      <span className="store-live-preview-fallback" aria-hidden="true">
        <Package size={22} />
      </span>
    );
  }
  return <img src={mediaUrl(src)} alt="" />;
}

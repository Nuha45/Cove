import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Monitor, Package, Smartphone } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageIntro from '../components/ui/PageIntro';
import EmptyState from '../components/ui/EmptyState';
import { listProducts } from '../services/productService';
import { updateBusinessSettings } from '../services/businessService';
import { formatEyebrowDate, formatPrice, initials } from '../utils/display';
import { getErrorMessage, getFieldErrors } from '../utils/errors';
import { mediaUrl } from '../utils/media';
import { copyText, storefrontPath, storefrontUrl } from '../utils/storefront';
import {
  DEFAULT_APPEARANCE,
  STOREFRONT_ACCENTS,
  STOREFRONT_THEMES,
  appearanceFromBusiness,
  normalizeAppearance,
} from '../utils/storefrontAppearance';

export default function StorefrontPage() {
  const { business, refresh } = useAuth();
  const { notify } = useOutletContext();

  const [copying, setCopying] = useState(false);
  const [products, setProducts] = useState([]);
  const [previewState, setPreviewState] = useState('loading');
  const [previewError, setPreviewError] = useState('');
  const [viewport, setViewport] = useState('desktop');
  const [draft, setDraft] = useState(() => appearanceFromBusiness(business));
  const [saved, setSaved] = useState(() => appearanceFromBusiness(business));
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const slug = business?.slug || '';
  const url = storefrontUrl(slug);
  const path = storefrontPath(slug);
  const currency = business?.currency || 'INR';
  const dirty = draft.theme !== saved.theme || draft.accent !== saved.accent;

  useEffect(() => {
    const next = appearanceFromBusiness(business);
    setDraft(next);
    setSaved(next);
  }, [
    business?.storefrontTheme,
    business?.storefrontAccent,
    business?.appearance?.theme,
    business?.appearance?.accent,
  ]);

  useEffect(() => {
    if (window.location.hash === '#customize') {
      document.getElementById('customize')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

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

  async function saveAppearance() {
    setSaving(true);
    setFormError('');
    setFieldErrors({});
    try {
      const result = await updateBusinessSettings({
        storefrontTheme: draft.theme,
        storefrontAccent: draft.accent,
      });
      const next = appearanceFromBusiness(result.business);
      setDraft(next);
      setSaved(next);
      await refresh();
      notify(result.message || 'Storefront look published.');
    } catch (err) {
      const nextFields = getFieldErrors(err);
      setFieldErrors(nextFields);
      setFormError(getErrorMessage(err));
      notify(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function resetAppearance() {
    const next = normalizeAppearance(DEFAULT_APPEARANCE);
    setDraft(next);
    setFormError('');
    setFieldErrors({});
    setSaving(true);
    try {
      const result = await updateBusinessSettings({
        storefrontTheme: next.theme,
        storefrontAccent: next.accent,
      });
      const savedNext = appearanceFromBusiness(result.business);
      setDraft(savedNext);
      setSaved(savedNext);
      await refresh();
      notify('Storefront reset to the default look.');
    } catch (err) {
      setFormError(getErrorMessage(err));
      notify(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Storefront"
        subtitle="Share your shop link and customize how customers see your store."
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

      <section className="card storefront-customize" id="customize">
        <div className="storefront-customize-head">
          <div>
            <p className="eyebrow">CUSTOMIZE STOREFRONT</p>
            <h2>Theme and accent</h2>
            <p className="muted">
              Your logo, shop name, and profile details stay as set in Settings.
              Choose a curated look, then save to publish it on your public store.
            </p>
          </div>
          <div className="storefront-customize-actions">
            <button className="secondary" type="button" onClick={resetAppearance} disabled={saving}>
              Reset to default
            </button>
            <button className="primary" type="button" onClick={saveAppearance} disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save & publish'}
            </button>
          </div>
        </div>

        {formError ? <p className="form-error" role="alert">{formError}</p> : null}

        <div className="storefront-customize-layout">
          <div className="storefront-customize-controls">
            <fieldset className="storefront-theme-fieldset">
              <legend>Theme</legend>
              <div className="storefront-theme-grid" role="radiogroup" aria-label="Storefront theme">
                {STOREFRONT_THEMES.map((theme) => {
                  const selected = draft.theme === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      className={`storefront-theme-card${selected ? ' selected' : ''}`}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setDraft((current) => ({ ...current, theme: theme.id }))}
                    >
                      <span className={`storefront-theme-swatch theme-${theme.id}`} aria-hidden="true" />
                      <strong>{theme.label}</strong>
                      <small>{theme.blurb}</small>
                    </button>
                  );
                })}
              </div>
              {fieldErrors.storefrontTheme ? (
                <span className="field-error">{fieldErrors.storefrontTheme}</span>
              ) : null}
            </fieldset>

            <fieldset className="storefront-accent-fieldset">
              <legend>Accent color</legend>
              <div className="storefront-accent-row" role="radiogroup" aria-label="Accent color">
                {STOREFRONT_ACCENTS.map((accent) => {
                  const selected = draft.accent.toLowerCase() === accent.value.toLowerCase();
                  return (
                    <button
                      key={accent.id}
                      type="button"
                      className={`storefront-accent-swatch${selected ? ' selected' : ''}`}
                      style={{ '--swatch': accent.value }}
                      role="radio"
                      aria-checked={selected}
                      aria-label={accent.label}
                      title={accent.label}
                      onClick={() => setDraft((current) => ({ ...current, accent: accent.value }))}
                    />
                  );
                })}
              </div>
              {fieldErrors.storefrontAccent ? (
                <span className="field-error">{fieldErrors.storefrontAccent}</span>
              ) : null}
            </fieldset>
          </div>

          <div className="storefront-preview-pane">
            <div className="storefront-preview-toolbar">
              <p className="eyebrow">LIVE PREVIEW</p>
              <div className="storefront-viewport-toggle" role="group" aria-label="Preview size">
                <button
                  type="button"
                  className={viewport === 'desktop' ? 'selected' : ''}
                  aria-pressed={viewport === 'desktop'}
                  onClick={() => setViewport('desktop')}
                >
                  <Monitor size={15} /> Desktop
                </button>
                <button
                  type="button"
                  className={viewport === 'mobile' ? 'selected' : ''}
                  aria-pressed={viewport === 'mobile'}
                  onClick={() => setViewport('mobile')}
                >
                  <Smartphone size={15} /> Mobile
                </button>
              </div>
            </div>

            <StoreAppearancePreview
              business={business}
              appearance={draft}
              products={products}
              currency={currency}
              viewport={viewport}
              previewState={previewState}
              previewError={previewError}
            />
          </div>
        </div>
      </section>
    </>
  );
}

function StoreHeroBlock({ category, title, lead, metaBits }) {
  return (
    <section className="store-hero">
      <div className="store-hero-copy">
        <p className="eyebrow">{category || 'SHOP'}</p>
        <h1>{title}</h1>
        <p className="store-hero-lead">{lead}</p>
        {metaBits.length ? (
          <div className="store-hero-meta">
            {metaBits.map((bit) => (
              <small key={bit}>{bit}</small>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StoreAppearancePreview({
  business,
  appearance,
  products,
  currency,
  viewport,
  previewState,
  previewError,
}) {
  const shopName = business?.name || 'Your shop';
  const metaBits = [];
  if (business?.pickupEnabled !== false) metaBits.push('Pickup available');
  if (business?.deliveryEnabled !== false) {
    metaBits.push(
      Number(business?.deliveryFee) > 0
        ? `Delivery from ${formatPrice(business.deliveryFee, currency)}`
        : 'Delivery available'
    );
  }
  if (business?.storefrontActive === false) metaBits.push('Storefront paused');

  return (
    <div
      className={`store-appear-preview viewport-${viewport}`}
      data-theme={appearance.theme}
      style={{ '--store-accent': appearance.accent }}
    >
      <header className="store-top">
        <div className="store-top-inner">
          <div className="store-brand">
            {business?.logo ? (
              <img className="store-mark-img" src={mediaUrl(business.logo)} alt="" />
            ) : (
              <span className="store-mark" aria-hidden="true">{initials(shopName, 1)}</span>
            )}
            <div>
              <strong>{shopName}</strong>
              {business?.city ? <small>{business.city}</small> : null}
            </div>
          </div>
          <span className="store-cart-link" aria-hidden="true">
            <Package size={16} />
            <span>Cart</span>
            <em>2</em>
          </span>
        </div>
      </header>

      <div className="store-main">
        <StoreHeroBlock
          category={business?.category}
          title={shopName}
          lead={
            business?.description
              || (business?.storefrontActive === false
                ? 'Your storefront is currently paused in Settings.'
                : 'Add a short shop description in Settings so customers know what you sell.')
          }
          metaBits={metaBits}
        />

        <aside className="store-want-cta">
          <div className="store-want-cta-copy">
            <strong>Looking for something specific?</strong>
            <p>Tell {shopName} what you need — they will see your request in one place.</p>
          </div>
          <span className="primary" aria-hidden="true">Request something</span>
        </aside>

        {previewState === 'loading' ? <p className="muted store-panel">Loading your products...</p> : null}
        {previewState === 'error' ? <p className="form-error store-panel">{previewError}</p> : null}

        {previewState === 'ready' && products.length === 0 ? (
          <div className="store-panel store-live-preview-empty">
            <EmptyState
              title="No active products yet"
              text="Add an active product to see it here. Customers will see the same empty shop until you do."
            />
            <Link className="secondary" to="/products">Go to Products</Link>
          </div>
        ) : null}

        {previewState === 'ready' && products.length > 0 ? (
          <section className="store-catalog">
            <div className="store-catalog-head">
              <div>
                <h2>Collection</h2>
                <p className="muted">{Math.min(products.length, 6)} pieces</p>
              </div>
            </div>
            <div className="store-grid">
              {products.slice(0, 6).map((product) => (
                <div className="store-product-card" key={product.id}>
                  <PreviewThumb product={product} />
                  <div className="store-product-copy">
                    {product.category ? <span className="store-product-category">{product.category}</span> : null}
                    <strong>{product.name}</strong>
                    <div className="store-product-meta">
                      <span className="store-product-price">{formatPrice(product.price, currency)}</span>
                      <small className={product.stockQuantity > 0 ? 'in-stock' : 'out-stock'}>
                        {product.stockQuantity > 0 ? `${product.stockQuantity} in stock` : 'Out of stock'}
                      </small>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function PreviewThumb({ product }) {
  const src = product.images?.[0];
  if (!src) {
    return (
      <span className="store-thumb-fallback" aria-hidden="true">
        <Package size={22} />
      </span>
    );
  }
  return <img src={mediaUrl(src)} alt="" />;
}

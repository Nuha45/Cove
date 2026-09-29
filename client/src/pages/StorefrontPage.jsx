import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Lock, Monitor, Package, Smartphone } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageIntro from '../components/ui/PageIntro';
import EmptyState from '../components/ui/EmptyState';
import AdvancedLock from '../components/ui/AdvancedLock';
import PromotionsEditor from '../components/storefront/PromotionsEditor';
import {
  StoreAnnouncement,
  StoreBrandContent,
  StoreFeaturedCategories,
  StoreHero,
  StoreProductCard,
  StorePromo,
} from '../components/storefront/StoreSections';
import { getProduct, listProducts } from '../services/productService';
import { updateBusinessSettings } from '../services/businessService';
import { formatEyebrowDate, formatPrice } from '../utils/display';
import { getErrorMessage, getFieldErrors } from '../utils/errors';
import { copyText, storefrontPath, storefrontUrl } from '../utils/storefront';
import {
  DEFAULT_APPEARANCE,
  PLUS_STOREFRONT_ACCENTS,
  STOREFRONT_ACCENTS,
  STOREFRONT_BACKGROUNDS,
  STOREFRONT_THEMES,
  appearanceFromBusiness,
  effectiveAppearance,
  hasPlusAppearance,
  normalizeAppearance,
  storeThemeProps,
} from '../utils/storefrontAppearance';

const PREVIEW_PRODUCT_LIMIT = 6;

function sameAppearance(a, b) {
  return a.theme === b.theme && a.accent === b.accent && a.background === b.background;
}

// Seller product → the shape the public storefront receives.
function toStorefrontProduct(product) {
  const available = Number(product.stockQuantity) > 0;
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    images: product.images || [],
    category: product.category || '',
    available,
    stockAvailability: available ? 'In stock' : 'Out of stock',
  };
}

export default function StorefrontPage() {
  const { business, refresh } = useAuth();
  const { notify, plan } = useOutletContext();
  const plus = Boolean(plan?.advanced);
  const planLoading = Boolean(plan?.loading);

  const [copying, setCopying] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [extraProducts, setExtraProducts] = useState({});
  const [previewState, setPreviewState] = useState('loading');
  const [previewError, setPreviewError] = useState('');
  const [viewport, setViewport] = useState('desktop');
  const storedAppearance = appearanceFromBusiness(business);
  const [draft, setDraft] = useState(() => effectiveAppearance(storedAppearance, plus));
  const [saved, setSaved] = useState(() => effectiveAppearance(storedAppearance, plus));
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const slug = business?.slug || '';
  const url = storefrontUrl(slug);
  const path = storefrontPath(slug);
  const currency = business?.currency || 'INR';
  const dirty = !sameAppearance(draft, saved);
  const keptPlusLook = !plus && !planLoading && hasPlusAppearance(storedAppearance);
  const featuredIds = business?.storefrontFeaturedProductIds || [];

  useEffect(() => {
    const next = effectiveAppearance(appearanceFromBusiness(business), plus);
    setDraft(next);
    setSaved(next);
  }, [
    plus,
    business?.storefrontTheme,
    business?.storefrontAccent,
    business?.storefrontBackground,
    business?.appearance?.theme,
    business?.appearance?.accent,
    business?.appearance?.background,
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
        const result = await listProducts({ status: 'Active', limit: 24 });
        if (cancelled) return;
        setProducts(result.products);
        setCategories(result.categories || []);
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

  // Featured products outside the first page of active products are looked up once for the preview.
  useEffect(() => {
    if (!plus || previewState !== 'ready') return undefined;
    const known = new Set(products.map((product) => product.id));
    const missing = featuredIds.filter((id) => !known.has(id) && !(id in extraProducts));
    if (!missing.length) return undefined;
    let cancelled = false;
    Promise.all(missing.map((id) => getProduct(id).then((res) => res.product).catch(() => null)))
      .then((found) => {
        if (cancelled) return;
        setExtraProducts((current) => {
          const next = { ...current };
          missing.forEach((id, index) => { next[id] = found[index]; });
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plus, previewState, featuredIds.join(',')]);

  const previewPromotions = useMemo(() => {
    if (!plus || !business) return null;
    const byId = new Map(products.map((product) => [product.id, product]));
    const featuredProducts = featuredIds
      .map((id) => byId.get(id) || extraProducts[id])
      .filter((product) => product && product.status === 'Active')
      .map(toStorefrontProduct);
    return {
      announcement: business.storefrontAnnouncement || '',
      promoTitle: business.storefrontPromoTitle || '',
      promoText: business.storefrontPromoText || '',
      featuredCategories: (business.storefrontFeaturedCategories || []).filter((item) => categories.includes(item)),
      featuredProducts,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plus, business, products, categories, extraProducts]);

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

  async function publish(next, successMessage) {
    setSaving(true);
    setFormError('');
    setFieldErrors({});
    try {
      const result = await updateBusinessSettings({
        storefrontTheme: next.theme,
        storefrontAccent: next.accent,
        // Basic sellers never send the background, so a saved Cove Plus background is kept.
        ...(plus ? { storefrontBackground: next.background } : {}),
      });
      const savedNext = effectiveAppearance(appearanceFromBusiness(result.business), plus);
      setDraft(savedNext);
      setSaved(savedNext);
      await refresh();
      notify(successMessage || result.message || 'Storefront look published.');
    } catch (err) {
      setFieldErrors(getFieldErrors(err));
      setFormError(getErrorMessage(err));
      notify(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function saveAppearance() {
    publish(draft, 'Storefront look published.');
  }

  function resetAppearance() {
    const next = normalizeAppearance(DEFAULT_APPEARANCE);
    setDraft(next);
    publish(next, 'Storefront reset to the default look.');
  }

  function chooseTheme(theme) {
    if (theme.plus && !plus) return;
    setDraft((current) => ({ ...current, theme: theme.id }));
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
            <h2>Theme and colors</h2>
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
        {keptPlusLook ? (
          <p className="storefront-kept-note" role="status">
            Your Cove Plus theme and colors are saved. Until Cove Plus is active again, your store uses the standard theme and colors in their place.
          </p>
        ) : null}

        <div className="storefront-customize-layout">
          <div className="storefront-customize-controls">
            <fieldset className="storefront-theme-fieldset">
              <legend>Theme</legend>
              <div className="storefront-theme-grid" role="radiogroup" aria-label="Storefront theme">
                {STOREFRONT_THEMES.map((theme) => {
                  const selected = draft.theme === theme.id;
                  const locked = theme.plus && !plus;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      className={`storefront-theme-card${selected ? ' selected' : ''}${locked ? ' locked' : ''}`}
                      role="radio"
                      aria-checked={selected}
                      aria-disabled={locked || undefined}
                      disabled={locked}
                      onClick={() => chooseTheme(theme)}
                    >
                      <span className={`storefront-theme-swatch theme-${theme.id}`} aria-hidden="true" />
                      <strong>
                        {theme.label}
                        {theme.plus ? (
                          <span className="storefront-plus-tag">
                            {locked ? <Lock size={10} aria-hidden="true" /> : null} Plus
                          </span>
                        ) : null}
                      </strong>
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
              <legend>{plus ? 'Accent and button color' : 'Accent color'}</legend>
              <SwatchRow
                label="Accent color"
                options={STOREFRONT_ACCENTS}
                value={draft.accent}
                onChange={(accent) => setDraft((current) => ({ ...current, accent }))}
              />
              {plus ? (
                <>
                  <p className="storefront-swatch-caption">More Cove Plus colors</p>
                  <SwatchRow
                    label="Cove Plus accent colors"
                    options={PLUS_STOREFRONT_ACCENTS}
                    value={draft.accent}
                    onChange={(accent) => setDraft((current) => ({ ...current, accent }))}
                  />
                </>
              ) : null}
              {fieldErrors.storefrontAccent ? (
                <span className="field-error">{fieldErrors.storefrontAccent}</span>
              ) : null}
            </fieldset>

            {plus ? (
              <fieldset className="storefront-accent-fieldset">
                <legend>Page background</legend>
                <SwatchRow
                  label="Page background"
                  options={[{ id: 'theme', value: '', label: 'Theme default' }, ...STOREFRONT_BACKGROUNDS]}
                  value={draft.background}
                  onChange={(background) => setDraft((current) => ({ ...current, background }))}
                  light
                />
                {fieldErrors.storefrontBackground ? (
                  <span className="field-error">{fieldErrors.storefrontBackground}</span>
                ) : null}
              </fieldset>
            ) : null}

            {!plus && !planLoading ? (
              <AdvancedLock
                compact
                title="Premium themes and colors"
                text="Cove Plus adds the Atelier and Luxe themes, six more button colors and curated page backgrounds."
              />
            ) : null}
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
              promotions={previewPromotions}
              currency={currency}
              viewport={viewport}
              previewState={previewState}
              previewError={previewError}
            />
          </div>
        </div>
      </section>

      <PromotionsEditor
        business={business}
        advanced={plus}
        loading={planLoading}
        refresh={refresh}
        notify={notify}
      />
    </>
  );
}

function SwatchRow({ label, options, value, onChange, light = false }) {
  return (
    <div className="storefront-accent-row" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = String(value).toLowerCase() === option.value.toLowerCase();
        return (
          <button
            key={option.id}
            type="button"
            className={`storefront-accent-swatch${light ? ' light' : ''}${option.value ? '' : ' theme-default'}${selected ? ' selected' : ''}`}
            style={option.value ? { '--swatch': option.value } : undefined}
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
          />
        );
      })}
    </div>
  );
}

function StoreAppearancePreview({
  business,
  appearance,
  products,
  promotions,
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

  const catalog = products.slice(0, PREVIEW_PRODUCT_LIMIT).map(toStorefrontProduct);
  const featuredProducts = promotions?.featuredProducts || [];

  return (
    <div className={`store-appear-preview viewport-${viewport}`} {...storeThemeProps(appearance)}>
      <StoreAnnouncement text={promotions?.announcement} />
      <header className="store-top">
        <div className="store-top-inner">
          <div className="store-brand">
            <StoreBrandContent business={{ ...business, name: shopName }} />
          </div>
          <span className="store-cart-link" aria-hidden="true">
            <Package size={16} />
            <span>Cart</span>
            <em>2</em>
          </span>
        </div>
      </header>

      <div className="store-main">
        <StoreHero
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

        <StorePromo title={promotions?.promoTitle} text={promotions?.promoText} />
        <StoreFeaturedCategories categories={promotions?.featuredCategories || []} />

        {featuredProducts.length > 0 ? (
          <section className="store-catalog store-featured">
            <div className="store-catalog-head">
              <div>
                <h2>Featured</h2>
              </div>
            </div>
            <div className="store-grid">
              {featuredProducts.map((product) => (
                <StoreProductCard key={product.id} product={product} currency={currency} />
              ))}
            </div>
          </section>
        ) : null}

        <aside className="store-want-cta">
          <div className="store-want-cta-copy">
            <strong>Looking for something specific?</strong>
            <p>Tell {shopName} what you need — they will see your request in one place.</p>
          </div>
          <span className="primary" aria-hidden="true">Request something</span>
        </aside>

        {previewState === 'loading' ? <p className="muted store-panel">Loading your products...</p> : null}
        {previewState === 'error' ? <p className="form-error store-panel">{previewError}</p> : null}

        {previewState === 'ready' && catalog.length === 0 ? (
          <div className="store-panel store-live-preview-empty">
            <EmptyState
              title="No active products yet"
              text="Add an active product to see it here. Customers will see the same empty shop until you do."
            />
            <Link className="secondary" to="/products">Go to Products</Link>
          </div>
        ) : null}

        {previewState === 'ready' && catalog.length > 0 ? (
          <section className="store-catalog">
            <div className="store-catalog-head">
              <div>
                <h2>Collection</h2>
                <p className="muted">{catalog.length} pieces</p>
              </div>
            </div>
            <div className="store-grid">
              {catalog.map((product) => (
                <StoreProductCard key={product.id} product={product} currency={currency} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

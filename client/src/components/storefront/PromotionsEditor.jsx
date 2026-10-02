import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import AdvancedLock from '../ui/AdvancedLock';
import { getProduct, listProducts } from '../../services/productService';
import { updateBusinessSettings } from '../../services/businessService';
import { formatPrice } from '../../utils/display';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';

const MAX_FEATURED_PRODUCTS = 8;
const MAX_FEATURED_CATEGORIES = 6;

function fromBusiness(business) {
  return {
    storefrontAnnouncement: business?.storefrontAnnouncement || '',
    storefrontPromoTitle: business?.storefrontPromoTitle || '',
    storefrontPromoText: business?.storefrontPromoText || '',
    storefrontFeaturedProductIds: business?.storefrontFeaturedProductIds || [],
    storefrontFeaturedCategories: business?.storefrontFeaturedCategories || [],
  };
}

function sameList(a, b) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export default function PromotionsEditor({ business, advanced, loading, refresh, notify }) {
  const [saved, setSaved] = useState(() => fromBusiness(business));
  const [draft, setDraft] = useState(() => fromBusiness(business));
  const [names, setNames] = useState({});
  const [results, setResults] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    const next = fromBusiness(business);
    setSaved(next);
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    business?.storefrontAnnouncement,
    business?.storefrontPromoTitle,
    business?.storefrontPromoText,
    (business?.storefrontFeaturedProductIds || []).join(','),
    (business?.storefrontFeaturedCategories || []).join(','),
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!advanced) return undefined;
    let cancelled = false;
    listProducts({ status: 'Active', search: query || undefined, limit: 24 })
      .then((result) => {
        if (cancelled) return;
        setResults(result.products);
        setCategories(result.categories || []);
        setNames((current) => {
          const next = { ...current };
          result.products.forEach((product) => { next[product.id] = product.name; });
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [advanced, query]);

  // Saved featured products may not be in the current search results; look up their names once.
  useEffect(() => {
    if (!advanced) return;
    const missing = saved.storefrontFeaturedProductIds.filter((id) => !names[id]);
    if (!missing.length) return;
    Promise.all(missing.map((id) => getProduct(id).then((res) => res.product).catch(() => null)))
      .then((products) => {
        setNames((current) => {
          const next = { ...current };
          products.forEach((product, index) => {
            next[missing[index]] = product ? product.name : 'Unavailable product';
          });
          return next;
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanced, saved.storefrontFeaturedProductIds.join(',')]);

  const dirty = useMemo(() => (
    draft.storefrontAnnouncement !== saved.storefrontAnnouncement
    || draft.storefrontPromoTitle !== saved.storefrontPromoTitle
    || draft.storefrontPromoText !== saved.storefrontPromoText
    || !sameList(draft.storefrontFeaturedProductIds, saved.storefrontFeaturedProductIds)
    || !sameList(draft.storefrontFeaturedCategories, saved.storefrontFeaturedCategories)
  ), [draft, saved]);

  if (loading) return null;

  if (!advanced) {
    return (
      <AdvancedLock
        title="Promote products on your storefront"
        text="Cove Plus adds an announcement bar, a promotional banner, and featured products and categories on your public store."
      />
    );
  }

  function updateText(event) {
    const { name, value } = event.target;
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function toggleProduct(id) {
    setDraft((current) => {
      const list = current.storefrontFeaturedProductIds;
      if (list.includes(id)) return { ...current, storefrontFeaturedProductIds: list.filter((item) => item !== id) };
      if (list.length >= MAX_FEATURED_PRODUCTS) {
        notify(`You can feature up to ${MAX_FEATURED_PRODUCTS} products.`);
        return current;
      }
      return { ...current, storefrontFeaturedProductIds: [...list, id] };
    });
  }

  function toggleCategory(category) {
    setDraft((current) => {
      const list = current.storefrontFeaturedCategories;
      if (list.includes(category)) return { ...current, storefrontFeaturedCategories: list.filter((item) => item !== category) };
      if (list.length >= MAX_FEATURED_CATEGORIES) {
        notify(`You can feature up to ${MAX_FEATURED_CATEGORIES} categories.`);
        return current;
      }
      return { ...current, storefrontFeaturedCategories: [...list, category] };
    });
  }

  async function save() {
    setSaving(true);
    setFormError('');
    setFieldErrors({});
    try {
      const result = await updateBusinessSettings({
        storefrontAnnouncement: draft.storefrontAnnouncement.trim(),
        storefrontPromoTitle: draft.storefrontPromoTitle.trim(),
        storefrontPromoText: draft.storefrontPromoText.trim(),
        storefrontFeaturedProductIds: draft.storefrontFeaturedProductIds,
        storefrontFeaturedCategories: draft.storefrontFeaturedCategories,
      });
      const next = fromBusiness(result.business);
      setSaved(next);
      setDraft(next);
      await refresh();
      notify('Storefront promotions published.');
    } catch (err) {
      setFieldErrors(getFieldErrors(err));
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const allCategories = [...new Set([...draft.storefrontFeaturedCategories, ...categories])];

  return (
    <section className="card storefront-promotions" id="promotions">
      <div className="storefront-customize-head">
        <div>
          <p className="eyebrow">PROMOTIONS · COVE PLUS</p>
          <h2>Announcement, promotion and featured items</h2>
          <p className="muted">Everything here is optional. Empty fields are hidden on your storefront.</p>
        </div>
        <div className="storefront-customize-actions">
          <button className="secondary" type="button" onClick={() => setDraft(saved)} disabled={saving || !dirty}>
            Discard changes
          </button>
          <button className="primary" type="button" onClick={save} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save & publish'}
          </button>
        </div>
      </div>

      {formError ? <p className="form-error" role="alert">{formError}</p> : null}

      <div className="form-grid">
        <label className="wide">
          Announcement bar
          <input
            name="storefrontAnnouncement"
            value={draft.storefrontAnnouncement}
            onChange={updateText}
            maxLength={140}
            placeholder={`Free delivery on orders above ${formatPrice(999)} this week`}
          />
          <small className="muted">{draft.storefrontAnnouncement.length}/140 · shown at the top of every store page</small>
          {fieldErrors.storefrontAnnouncement ? <span className="field-error">{fieldErrors.storefrontAnnouncement}</span> : null}
        </label>
        <label>
          Promotion title
          <input
            name="storefrontPromoTitle"
            value={draft.storefrontPromoTitle}
            onChange={updateText}
            maxLength={60}
            placeholder="Festive collection"
          />
          <small className="muted">{draft.storefrontPromoTitle.length}/60</small>
          {fieldErrors.storefrontPromoTitle ? <span className="field-error">{fieldErrors.storefrontPromoTitle}</span> : null}
        </label>
        <label>
          Promotion text
          <input
            name="storefrontPromoText"
            value={draft.storefrontPromoText}
            onChange={updateText}
            maxLength={200}
            placeholder="Handmade pieces, ready to ship in 2 days."
          />
          <small className="muted">{draft.storefrontPromoText.length}/200</small>
          {fieldErrors.storefrontPromoText ? <span className="field-error">{fieldErrors.storefrontPromoText}</span> : null}
        </label>
      </div>

      <div className="promo-picker">
        <div className="promo-picker-head">
          <h3>Featured products</h3>
          <small className="muted">{draft.storefrontFeaturedProductIds.length}/{MAX_FEATURED_PRODUCTS} · only active products appear on your store</small>
        </div>
        {draft.storefrontFeaturedProductIds.length ? (
          <ul className="chip-list">
            {draft.storefrontFeaturedProductIds.map((id) => (
              <li key={id} className="chip">
                <span>{names[id] || 'Loading…'}</span>
                <button type="button" aria-label={`Remove ${names[id] || 'product'} from featured`} onClick={() => toggleProduct(id)}>
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search active products"
            aria-label="Search products to feature"
          />
        </div>
        {results.length === 0 ? (
          <p className="muted">{query ? 'No active products match that search.' : 'Add active products to feature them.'}</p>
        ) : (
          <div className="promo-options">
            {results.map((product) => {
              const checked = draft.storefrontFeaturedProductIds.includes(product.id);
              return (
                <label key={product.id} className={`promo-option${checked ? ' selected' : ''}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleProduct(product.id)} />
                  <span>{product.name}</span>
                </label>
              );
            })}
          </div>
        )}
        {fieldErrors.storefrontFeaturedProductIds ? <span className="field-error">{fieldErrors.storefrontFeaturedProductIds}</span> : null}
      </div>

      <div className="promo-picker">
        <div className="promo-picker-head">
          <h3>Featured categories</h3>
          <small className="muted">{draft.storefrontFeaturedCategories.length}/{MAX_FEATURED_CATEGORIES} · shoppers can tap these to filter your catalog</small>
        </div>
        {allCategories.length === 0 ? (
          <p className="muted">Give your products a category to feature it here.</p>
        ) : (
          <div className="promo-options">
            {allCategories.map((category) => {
              const checked = draft.storefrontFeaturedCategories.includes(category);
              return (
                <label key={category} className={`promo-option${checked ? ' selected' : ''}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleCategory(category)} />
                  <span>{category}</span>
                </label>
              );
            })}
          </div>
        )}
        {fieldErrors.storefrontFeaturedCategories ? <span className="field-error">{fieldErrors.storefrontFeaturedCategories}</span> : null}
      </div>
    </section>
  );
}

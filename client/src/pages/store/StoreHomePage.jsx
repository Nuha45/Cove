import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { Package, Search } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import { getStorefront } from '../../services/storeService';
import { formatPrice } from '../../utils/display';
import { getErrorMessage } from '../../utils/errors';
import { mediaUrl } from '../../utils/media';
import { absoluteAsset, absoluteUrl, storeJsonLd, truncate, useSeo } from '../../utils/seo';
import { appearanceFromBusiness, coverObjectPosition } from '../../utils/storefrontAppearance';

function peekInitialCatalog(ref, slug) {
  const catalog = ref?.current;
  return catalog && catalog.slug === slug ? catalog : null;
}

function storeSeo(business) {
  const canonical = absoluteUrl(`/store/${business.slug}`);
  const appearance = appearanceFromBusiness(business);
  const logo = business.logo ? absoluteAsset(mediaUrl(business.logo)) : '';
  const cover = appearance.coverImage ? absoluteAsset(mediaUrl(appearance.coverImage)) : '';
  const place = business.city ? ` in ${business.city}` : '';
  const tagline = business.category ? ` – ${business.category}${place}` : place;
  const description = truncate(
    business.description
      || `Shop ${business.name}${business.category ? `, ${business.category.toLowerCase()}` : ''}${place}. Browse products and order online.`
  );
  return {
    title: `${business.name}${tagline}`,
    description,
    canonical,
    image: cover || logo,
    imageAlt: business.name,
    siteName: business.name,
    jsonLd: storeJsonLd(business, { url: canonical, image: logo || cover }),
  };
}

export default function StoreHomePage() {
  const { slug } = useParams();
  const { business, initialCatalog } = useOutletContext();
  const appearance = appearanceFromBusiness(business);
  const coverUrl = appearance.coverImage ? mediaUrl(appearance.coverImage) : '';
  const [seeded] = useState(() => peekInitialCatalog(initialCatalog, slug));
  const [products, setProducts] = useState(seeded?.products || []);
  const [categories, setCategories] = useState(seeded?.categories || []);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [state, setState] = useState(seeded ? 'ready' : 'loading');
  const [error, setError] = useState('');
  const [skipFetch, setSkipFetch] = useState(Boolean(seeded));

  useSeo(storeSeo(business));

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (skipFetch) {
      // Later visits to the home page fetch fresh stock instead of reusing the shell's first load.
      if (initialCatalog) initialCatalog.current = null;
      setSkipFetch(false);
      return undefined;
    }
    let cancelled = false;

    async function load() {
      setState('loading');
      setError('');
      try {
        const result = await getStorefront(slug, {
          search: query || undefined,
          category: category || undefined,
        });
        if (cancelled) return;
        setProducts(result.products);
        setCategories(result.categories);
        setState('ready');
      } catch (err) {
        if (cancelled) return;
        setError(getErrorMessage(err));
        setState('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug, query, category]);

  const emptyBecauseFilter = state === 'ready' && products.length === 0 && (query || category);
  const metaBits = [];
  if (business.phone) metaBits.push(business.phone);
  if (business.pickupEnabled) metaBits.push('Pickup available');
  if (business.deliveryEnabled) {
    metaBits.push(
      Number(business.deliveryFee) > 0
        ? `Delivery from ${formatPrice(business.deliveryFee, business.currency)}`
        : 'Delivery available'
    );
  }

  return (
    <>
      <section className={`store-hero${coverUrl ? ' has-cover' : ''}`}>
        {coverUrl ? (
          <div className="store-hero-media" aria-hidden="true">
            <img
              src={coverUrl}
              alt=""
              style={{ objectPosition: coverObjectPosition(appearance) }}
            />
          </div>
        ) : null}
        <div className="store-hero-copy">
          <p className="eyebrow">{business.category || 'SHOP'}</p>
          <h1>{business.name}</h1>
          <p className="store-hero-lead">
            {business.description || 'Browse the collection and place your order here.'}
          </p>
          {metaBits.length ? (
            <div className="store-hero-meta">
              {metaBits.map((bit) => (
                <small key={bit}>{bit}</small>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <aside className="store-want-cta">
        <div className="store-want-cta-copy">
          <strong>Looking for something specific?</strong>
          <p>Tell {business.name} what you need — they will see your request in one place.</p>
        </div>
        <div className="store-want-cta-actions">
          <Link className="primary" to={`/store/${slug}/want`}>Request something</Link>
          <Link className="secondary" to={`/store/${slug}/want-board`}>What should we stock next?</Link>
        </div>
      </aside>

      <section className="store-catalog">
        <div className="store-catalog-head">
          <div>
            <h2>Collection</h2>
            {state === 'ready' && products.length > 0 ? (
              <p className="muted">
                {products.length} {products.length === 1 ? 'piece' : 'pieces'}
                {category ? ` in ${category}` : ''}
              </p>
            ) : null}
          </div>
          <div className="store-toolbar" aria-label="Browse products">
            <div className="search">
              <Search size={16} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search"
                aria-label="Search products"
              />
            </div>
            {categories.length > 0 ? (
              <select
                className="filter-select"
                aria-label="Filter by category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            ) : null}
          </div>
        </div>

        {state === 'loading' ? <div className="store-panel" role="status">Loading products...</div> : null}
        {state === 'error' ? <div className="store-panel form-error" role="alert">{error}</div> : null}

        {state === 'ready' && products.length === 0 ? (
          <div className="store-panel">
            <EmptyState
              title={emptyBecauseFilter ? 'No matching products' : 'Nothing for sale yet'}
              text={emptyBecauseFilter
                ? 'Try a different search or category.'
                : 'This shop has not listed any products yet. Check back soon.'}
            />
            {emptyBecauseFilter ? (
              <Link className="secondary" to={`/store/${slug}/want`}>Request something</Link>
            ) : null}
          </div>
        ) : null}

        {state === 'ready' && products.length > 0 ? (
          <div className="store-grid">
            {products.map((product) => (
              <Link
                className="store-product-card"
                key={product.id}
                to={`/store/${slug}/product/${product.id}`}
              >
                <ProductImage product={product} />
                <div className="store-product-copy">
                  {product.category ? <span className="store-product-category">{product.category}</span> : null}
                  <strong>{product.name}</strong>
                  <div className="store-product-meta">
                    <span className="store-product-price">{formatPrice(product.price, business.currency)}</span>
                    <small className={product.available ? 'in-stock' : 'out-stock'}>
                      {product.stockAvailability}
                    </small>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}

function ProductImage({ product }) {
  const src = product.images?.[0];
  if (!src) {
    return (
      <span className="store-thumb-fallback" aria-hidden="true">
        <Package size={28} />
      </span>
    );
  }
  // The card link already announces the product name.
  return <img src={mediaUrl(src)} alt="" loading="lazy" decoding="async" />;
}

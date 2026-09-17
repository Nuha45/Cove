import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { Package, Search } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import { getStorefront } from '../../services/storeService';
import { formatPrice } from '../../utils/display';
import { getErrorMessage } from '../../utils/errors';
import { mediaUrl } from '../../utils/media';

export default function StoreHomePage() {
  const { slug } = useParams();
  const { business } = useOutletContext();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
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

  return (
    <>
      <section className="store-hero">
        <p className="eyebrow">{business.category || 'SHOP'}</p>
        <h1>{business.name}</h1>
        <p>{business.description || 'Browse the collection and place your order here.'}</p>
        <div className="store-hero-meta">
          {business.phone ? <small>Questions? {business.phone}</small> : null}
          {business.email ? <small>{business.email}</small> : null}
          {business.deliveryEnabled ? (
            <small>Delivery {Number(business.deliveryFee) > 0 ? `from ${formatPrice(business.deliveryFee, business.currency)}` : 'available'}</small>
          ) : null}
          {business.pickupEnabled ? <small>Pickup available</small> : null}
        </div>
      </section>

      <section className="store-toolbar">
        <div className="search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products"
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
      </section>

      {state === 'loading' ? <div className="store-panel">Loading products...</div> : null}
      {state === 'error' ? <div className="store-panel form-error">{error}</div> : null}

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
            <Link className="store-product-card" key={product.id} to={`/store/${slug}/product/${product.id}`}>
              <ProductImage product={product} />
              <div>
                <strong>{product.name}</strong>
                <span>{formatPrice(product.price, business.currency)}</span>
                <small className={product.available ? 'in-stock' : 'out-stock'}>
                  {product.stockAvailability}
                </small>
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {state === 'ready' ? (
        <section className="store-want-cta">
          <div>
            <strong>Can&apos;t find what you&apos;re looking for?</strong>
            <p>Tell the shop what you need. They will see your request in one place.</p>
          </div>
          <Link className="secondary" to={`/store/${slug}/want`}>Request something</Link>
        </section>
      ) : null}
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
  return <img src={mediaUrl(src)} alt="" />;
}

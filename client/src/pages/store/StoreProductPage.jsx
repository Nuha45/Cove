import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Minus, Package, Plus } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { getStoreProduct } from '../../services/storeService';
import { formatPrice } from '../../utils/display';
import { getErrorMessage } from '../../utils/errors';
import { mediaUrl } from '../../utils/media';
import { absoluteAsset, absoluteUrl, productJsonLd, truncate, useSeo } from '../../utils/seo';
import { trackAddToCart, trackProductView } from '../../utils/tracking';

const LOW_STOCK_HINT = 5;

function productSeo(state, product, business, slug) {
  const shopName = business?.name || 'Shop';
  if (state === 'missing' || state === 'error') {
    return {
      title: `${state === 'missing' ? 'Product not found' : 'Product unavailable'} · ${shopName}`,
      robots: 'noindex, nofollow',
      siteName: shopName,
    };
  }
  if (state !== 'ready' || !product) return null;

  const canonical = absoluteUrl(`/store/${business?.slug || slug}/product/${product.id}`);
  const images = (product.images || []).map((src) => absoluteAsset(mediaUrl(src))).filter(Boolean);
  const description = truncate(
    product.description
      || `${product.name}${product.category ? ` (${product.category})` : ''} from ${shopName}. Order online.`
  );
  return {
    title: `${product.name} · ${shopName}`,
    description,
    canonical,
    image: images[0] || '',
    imageAlt: product.name,
    type: 'product',
    siteName: shopName,
    jsonLd: productJsonLd(product, business, { url: canonical, images }),
  };
}

export default function StoreProductPage() {
  const { slug, productId } = useParams();
  const navigate = useNavigate();
  const { business } = useOutletContext();
  const currency = business?.currency || 'INR';
  const { addItem } = useCart();
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [activeImage, setActiveImage] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useSeo(productSeo(state, product, business, slug));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState('loading');
      setError('');
      try {
        const result = await getStoreProduct(slug, productId);
        if (cancelled) return;
        setProduct(result.product);
        setQuantity(1);
        setActiveImage(0);
        setState('ready');
        trackProductView(slug, result.product?.id);
      } catch (err) {
        if (cancelled) return;
        setError(getErrorMessage(err));
        setState(err.response?.status === 404 ? 'missing' : 'error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug, productId, attempt]);

  function handleAdd() {
    if (!product?.available) return;
    const ok = addItem(product, quantity);
    if (!ok) {
      setNote('That quantity is not available.');
      return;
    }
    trackAddToCart(slug, product.id, quantity);
    setNote('Added to cart.');
  }

  if (state === 'loading') return <div className="store-panel" role="status">Loading product...</div>;
  if (state === 'missing') {
    return (
      <div className="store-panel">
        <h1>Product not found</h1>
        <p>This product is not available in this shop.</p>
        <Link className="secondary" to={`/store/${slug}`}>Back to shop</Link>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="store-panel">
        <p className="form-error" role="alert">{error}</p>
        <button className="secondary" type="button" onClick={() => setAttempt((count) => count + 1)}>Try again</button>
      </div>
    );
  }

  const images = product.images?.length ? product.images : [];
  const max = Math.max(1, product.stockQuantity || 0);
  const lowStock = product.available && product.stockQuantity > 0 && product.stockQuantity <= LOW_STOCK_HINT;

  return (
    <div className="store-detail">
      <Link className="store-detail-back" to={`/store/${slug}`}>
        <ArrowLeft size={14} aria-hidden="true" /> Back to {business?.name || 'shop'}
      </Link>

      <div className="store-detail-grid">
        <div className="store-gallery">
          {images.length ? (
            <img
              className="store-gallery-main"
              src={mediaUrl(images[activeImage] || images[0])}
              alt={images.length > 1
                ? `${product.name}, image ${activeImage + 1} of ${images.length}`
                : product.name}
            />
          ) : (
            <span className="store-thumb-fallback large" aria-hidden="true"><Package size={32} /></span>
          )}
          {images.length > 1 ? (
            <div className="store-thumbs" role="group" aria-label="Product images">
              {images.map((image, index) => (
                <button
                  key={image}
                  type="button"
                  className={index === activeImage ? 'selected' : ''}
                  onClick={() => setActiveImage(index)}
                  aria-label={`Show image ${index + 1} of ${images.length}`}
                  aria-pressed={index === activeImage}
                >
                  <img src={mediaUrl(image)} alt="" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="store-detail-copy">
          {product.category ? <p className="eyebrow">{product.category}</p> : null}
          <h1>{product.name}</h1>
          <p className="store-price">{formatPrice(product.price, currency)}</p>
          <p className={`store-stock ${product.available ? 'is-available' : 'is-unavailable'}`}>
            <span className="store-stock-dot" aria-hidden="true" />
            {product.stockAvailability}
            {lowStock ? <span className="store-low-stock"> · Only {product.stockQuantity} left</span> : null}
          </p>
          {product.description ? <p className="store-description">{product.description}</p> : null}

          {product.available ? (
            <div className="store-buy">
              <div className="store-buy-qty">
                <label className="store-qty-label" htmlFor={`qty-${product.id}`}>Quantity</label>
                <div className="qty-control">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    disabled={quantity <= 1}
                    onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    id={`qty-${product.id}`}
                    aria-label="Quantity"
                    inputMode="numeric"
                    value={quantity}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!Number.isFinite(next)) return;
                      setQuantity(Math.min(max, Math.max(1, next)));
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={quantity >= max}
                    onClick={() => setQuantity((current) => Math.min(max, current + 1))}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {quantity > 1 ? (
                  <p className="store-buy-total">
                    Total <strong>{formatPrice(product.price * quantity, currency)}</strong>
                  </p>
                ) : null}
              </div>
              <div className="store-buy-actions">
                <button className="primary" type="button" onClick={handleAdd}>Add to cart</button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    if (!product?.available) return;
                    const ok = addItem(product, quantity);
                    if (!ok) {
                      setNote('That quantity is not available.');
                      return;
                    }
                    trackAddToCart(slug, product.id, quantity);
                    navigate(`/store/${slug}/cart`);
                  }}
                >
                  Buy now
                </button>
              </div>
            </div>
          ) : (
            <button className="primary store-buy-unavailable" type="button" disabled>Sold out</button>
          )}
          {note ? <p className="inline-note" role="status">{note}</p> : null}
        </div>
      </div>
    </div>
  );
}

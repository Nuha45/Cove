import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';
import { formatPrice, initials } from '../../utils/display';
import { mediaUrl } from '../../utils/media';

// Shared by the public storefront and the dashboard preview so the two stay in step.

export function StoreAnnouncement({ text }) {
  if (!text) return null;
  // Two identical halves loop seamlessly; each half must outlast a ~2600px screen, scrolling ~50px/s.
  const itemWidth = text.length * 8 + 72;
  const repeats = Math.max(3, Math.ceil(2600 / itemWidth));
  const duration = Math.max(16, Math.round((repeats * itemWidth) / 50));
  return (
    <div className="store-announcement" role="note">
      <span className="sr-only">{text}</span>
      <div className="store-announcement-track" aria-hidden="true" style={{ '--marquee-duration': `${duration}s` }}>
        {[0, 1].map((half) => (
          <div className="store-announcement-group" key={half}>
            {Array.from({ length: repeats }, (_, index) => (
              <span key={index}>{text}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StoreBrandContent({ business }) {
  const shopName = business?.name || 'Shop';
  return (
    <>
      {business?.logo ? (
        <img className="store-mark-img" src={mediaUrl(business.logo)} alt="" />
      ) : (
        <span className="store-mark" aria-hidden="true">{initials(shopName, 1)}</span>
      )}
      <div>
        <strong>{shopName}</strong>
        {business?.city ? <small>{business.city}</small> : null}
      </div>
    </>
  );
}

export function StoreHero({ category, title, lead, metaBits = [] }) {
  return (
    <section className="store-hero" data-mark={(title || '').trim().charAt(0).toUpperCase()}>
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

export function StorePromo({ title, text }) {
  if (!title && !text) return null;
  return (
    <section className="store-promo" aria-label="Shop promotion">
      {title ? <strong>{title}</strong> : null}
      {text ? <p>{text}</p> : null}
    </section>
  );
}

export function StoreFeaturedCategories({ categories, selected = '', onSelect }) {
  if (!categories.length) return null;
  return (
    <nav className="store-featured-categories" aria-label="Featured categories">
      {categories.map((item) => (
        <button
          key={item}
          type="button"
          className={selected === item ? 'selected' : ''}
          aria-pressed={selected === item}
          tabIndex={onSelect ? undefined : -1}
          onClick={onSelect ? () => onSelect(item) : undefined}
        >
          {item}
        </button>
      ))}
    </nav>
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

export function StoreProductCard({ product, currency, to }) {
  const body = (
    <>
      <ProductImage product={product} />
      <div className="store-product-copy">
        {product.category ? <span className="store-product-category">{product.category}</span> : null}
        <strong>{product.name}</strong>
        <div className="store-product-meta">
          <span className="store-product-price">{formatPrice(product.price, currency)}</span>
          <small className={product.available ? 'in-stock' : 'out-stock'}>
            {product.stockAvailability}
          </small>
        </div>
      </div>
    </>
  );
  if (to) return <Link className="store-product-card" to={to}>{body}</Link>;
  return <div className="store-product-card">{body}</div>;
}

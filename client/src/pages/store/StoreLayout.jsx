import { Link, Outlet, useParams } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import CoveLogo from '../../components/brand/CoveLogo';
import { CartProvider, useCart } from '../../context/CartContext';
import { initials } from '../../utils/display';
import { mediaUrl } from '../../utils/media';
import { appearanceFromBusiness } from '../../utils/storefrontAppearance';

function StoreChrome({ business }) {
  const { slug } = useParams();
  const { count } = useCart();
  const shopName = business?.name || 'Shop';
  const appearance = appearanceFromBusiness(business);

  return (
    <div
      className="public-store"
      data-theme={appearance.theme}
      style={{ '--store-accent': appearance.accent }}
    >
      <header className="store-top">
        <div className="store-top-inner">
          <Link className="store-brand" to={`/store/${slug}`}>
            {business?.logo ? (
              <img className="store-mark-img" src={mediaUrl(business.logo)} alt="" />
            ) : (
              <span className="store-mark" aria-hidden="true">{initials(shopName, 1)}</span>
            )}
            <div>
              <strong>{shopName}</strong>
              {business?.city ? <small>{business.city}</small> : null}
            </div>
          </Link>
          <Link className="store-cart-link" to={`/store/${slug}/cart`} aria-label={`Cart, ${count} items`}>
            <ShoppingBag size={18} aria-hidden="true" />
            <span>Cart</span>
            {count > 0 ? <em aria-hidden="true">{count}</em> : null}
          </Link>
        </div>
      </header>
      <main className="store-main">
        <Outlet context={{ business }} />
      </main>
      <footer className="store-foot">
        <CoveLogo size={22} />
        <span>Powered by Cove</span>
      </footer>
    </div>
  );
}

export default function StoreLayout({ business }) {
  const { slug } = useParams();
  return (
    <CartProvider slug={slug}>
      <StoreChrome business={business} />
    </CartProvider>
  );
}

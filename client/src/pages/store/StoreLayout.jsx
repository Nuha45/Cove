import { Link, Outlet, useParams } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import CoveLogo from '../../components/brand/CoveLogo';
import { CartProvider, useCart } from '../../context/CartContext';
import { initials } from '../../utils/display';
import { mediaUrl } from '../../utils/media';

function StoreChrome({ business }) {
  const { slug } = useParams();
  const { count } = useCart();

  return (
    <div className="public-store">
      <header className="store-top">
        <Link className="store-brand" to={`/store/${slug}`}>
          {business?.logo ? (
            <img className="store-mark-img" src={mediaUrl(business.logo)} alt="" />
          ) : (
            <span className="store-mark" aria-hidden="true">{initials(business?.name || 'S', 1)}</span>
          )}
          <div>
            <strong>{business?.name || 'Shop'}</strong>
            {business?.city ? <small>{business.city}</small> : null}
          </div>
        </Link>
        <Link className="store-cart-link" to={`/store/${slug}/cart`} aria-label={`Cart, ${count} items`}>
          <ShoppingBag size={18} />
          <span>Cart</span>
          {count > 0 ? <em>{count}</em> : null}
        </Link>
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

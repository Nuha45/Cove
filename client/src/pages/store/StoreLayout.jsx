import { Link, Outlet, useParams } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import CoveLogo from '../../components/brand/CoveLogo';
import { StoreAnnouncement, StoreBrandContent } from '../../components/storefront/StoreSections';
import { CartProvider, useCart } from '../../context/CartContext';
import { appearanceFromBusiness, storeThemeProps } from '../../utils/storefrontAppearance';

function StoreChrome({ business, initialCatalog }) {
  const { slug } = useParams();
  const { count } = useCart();
  // The server already replaced Cove Plus choices with Basic defaults when the shop lacks Cove Plus.
  const appearance = appearanceFromBusiness(business);

  return (
    <div className="public-store" {...storeThemeProps(appearance)}>
      <a className="skip-link" href="#store-content">Skip to content</a>
      <StoreAnnouncement text={business?.promotions?.announcement} />
      <header className="store-top">
        <div className="store-top-inner">
          <Link className="store-brand" to={`/store/${slug}`}>
            <StoreBrandContent business={business} />
          </Link>
          <Link className="store-cart-link" to={`/store/${slug}/cart`} aria-label={`Cart, ${count} items`}>
            <ShoppingBag size={18} aria-hidden="true" />
            <span>Cart</span>
            {count > 0 ? <em aria-hidden="true">{count}</em> : null}
          </Link>
        </div>
      </header>
      <main className="store-main" id="store-content" tabIndex={-1}>
        <Outlet context={{ business, initialCatalog }} />
      </main>
      <footer className="store-foot">
        <CoveLogo size={22} />
        <span>Powered by Cove</span>
        <span aria-hidden="true">·</span>
        <Link to="/privacy">Privacy</Link>
      </footer>
    </div>
  );
}

export default function StoreLayout({ business, initialCatalog }) {
  const { slug } = useParams();
  return (
    <CartProvider slug={slug}>
      <StoreChrome business={business} initialCatalog={initialCatalog} />
    </CartProvider>
  );
}

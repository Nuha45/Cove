import { Link, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Minus, Package, Plus } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import { useCart } from '../../context/CartContext';
import { formatPrice } from '../../utils/display';
import { mediaUrl } from '../../utils/media';

export default function StoreCartPage() {
  const { slug } = useParams();
  const { business } = useOutletContext();
  const currency = business?.currency || 'INR';
  const { items, subtotal, setQuantity, removeItem, clear } = useCart();

  return (
    <div className="store-cart">
      <Link className="back-link" to={`/store/${slug}`}>
        <ArrowLeft size={16} aria-hidden="true" /> Continue shopping
      </Link>
      <h1>Your cart</h1>

      {items.length === 0 ? (
        <div className="store-panel">
          <EmptyState title="Your cart is empty" text="Add something you like, then come back here to check out." />
          <Link className="primary" to={`/store/${slug}`}>Browse products</Link>
        </div>
      ) : (
        <div className="store-cart-layout">
          <div className="store-cart-list">
            {items.map((item) => (
              <article className="store-cart-row" key={item.productId}>
                {item.image ? (
                  <img src={mediaUrl(item.image)} alt={item.name} />
                ) : (
                  <span className="store-thumb-fallback" aria-hidden="true">
                    <Package size={22} />
                  </span>
                )}
                <div className="store-cart-info">
                  <strong>{item.name}</strong>
                  <small>{formatPrice(item.price, currency)} each</small>
                  <div className="qty-control">
                    <button
                      type="button"
                      aria-label={`Decrease ${item.name}`}
                      disabled={item.quantity <= 1}
                      onClick={() => setQuantity(item.productId, item.quantity - 1)}
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      aria-label={`Quantity for ${item.name}`}
                      inputMode="numeric"
                      value={item.quantity}
                      onChange={(event) => setQuantity(item.productId, Number(event.target.value))}
                    />
                    <button
                      type="button"
                      aria-label={`Increase ${item.name}`}
                      disabled={item.quantity >= item.stockQuantity}
                      onClick={() => setQuantity(item.productId, item.quantity + 1)}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                <div className="store-cart-side">
                  <strong>{formatPrice(item.price * item.quantity, currency)}</strong>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => removeItem(item.productId)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>

          <aside className="store-cart-summary">
            <h2>Order summary</h2>
            <div className="store-cart-subtotal">
              <span>Subtotal</span>
              <strong>{formatPrice(subtotal, currency)}</strong>
            </div>
            <p className="muted">
              {business?.deliveryEnabled
                ? `Delivery fee ${formatPrice(business.deliveryFee || 0, currency)} is added at checkout if you choose delivery.`
                : 'Final price is confirmed when you place the order.'}
            </p>
            <div className="store-cart-actions">
              <Link className="primary" to={`/store/${slug}/checkout`}>Checkout</Link>
              <button className="secondary" type="button" onClick={clear}>Clear cart</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

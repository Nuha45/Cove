import { useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import { formatOrderDate, formatPrice } from '../../utils/display';
import { loadConfirmation } from '../../utils/storefront';
import { PAYMENT_TONE, STATUS_TONE } from '../../utils/orders';

export default function StoreConfirmationPage() {
  const { slug, orderNumber } = useParams();
  const location = useLocation();
  const data = useMemo(() => {
    const fromState = location.state?.confirmation;
    if (fromState?.order?.orderNumber === orderNumber) return fromState;
    return loadConfirmation(slug, orderNumber);
  }, [location.state, slug, orderNumber]);

  if (!data?.order || data.order.orderNumber !== orderNumber) {
    return (
      <div className="store-panel">
        <h1>Order confirmation</h1>
        <p>We could not find that confirmation on this device. If you just placed an order, keep your order number safe.</p>
        <p><strong>{orderNumber}</strong></p>
        <Link className="primary" to={`/store/${slug}`}>Back to shop</Link>
      </div>
    );
  }

  const { order, business } = data;
  const currency = business?.currency || 'INR';

  return (
    <div className="store-confirm">
      <div className="store-confirm-banner">
        <CheckCircle2 size={28} />
        <div>
          <p className="eyebrow">ORDER PLACED</p>
          <h1>Thank you, {order.customer.name}!</h1>
          <p>Your order has been received by {business?.name || 'the shop'}.</p>
        </div>
      </div>

      <section className="store-card">
        <div className="store-confirm-meta">
          <div>
            <span>Order</span>
            <strong>{order.orderNumber}</strong>
          </div>
          <div>
            <span>Placed</span>
            <strong>{formatOrderDate(order.createdAt)}</strong>
          </div>
          <div>
            <span>Payment</span>
            <Badge tone={PAYMENT_TONE[order.paymentStatus] || 'neutral'}>{order.paymentStatus}</Badge>
          </div>
          <div>
            <span>Status</span>
            <Badge tone={STATUS_TONE[order.status] || 'neutral'}>{order.status}</Badge>
          </div>
        </div>

        <h2>Items</h2>
        {order.items.map((item) => (
          <div className="store-summary-line" key={`${item.name}-${item.quantity}-${item.price}`}>
            <span>{item.name} × {item.quantity}</span>
            <strong>{formatPrice(item.subtotal, currency)}</strong>
          </div>
        ))}
        <div className="totals">
          <div><span>Subtotal</span><span>{formatPrice(order.subtotal, currency)}</span></div>
          <div><span>Delivery fee</span><span>{formatPrice(order.deliveryFee, currency)}</span></div>
          <div className="totals-total"><span>Total</span><strong>{formatPrice(order.total, currency)}</strong></div>
        </div>

        <h2>Fulfilment</h2>
        <p><strong>{order.deliveryMethod}</strong></p>
        {order.deliveryMethod === 'Delivery' ? <p>{order.deliveryAddress}</p> : <p>The seller will share pickup details with you.</p>}
        {order.notes ? <p className="muted">Notes: {order.notes}</p> : null}
        <p className="muted">Payment is pending. The seller will confirm payment separately. Keep your order number handy if you message them.</p>
      </section>

      <Link className="primary" to={`/store/${slug}`}>Continue shopping</Link>
    </div>
  );
}

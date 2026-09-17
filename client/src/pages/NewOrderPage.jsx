import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Minus, Plus, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import PageIntro from '../components/ui/PageIntro';
import { listProducts } from '../services/productService';
import { createOrder } from '../services/orderService';
import { formatPrice } from '../utils/display';
import { getErrorMessage, getFieldErrors } from '../utils/errors';

const emptyCustomer = {
  name: '',
  phone: '',
  email: '',
  deliveryMethod: 'Pickup',
  deliveryAddress: '',
  deliveryFee: '',
  notes: '',
};

export default function NewOrderPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [productState, setProductState] = useState('loading');
  const [productError, setProductError] = useState('');
  const [lines, setLines] = useState([]);
  const [form, setForm] = useState(emptyCustomer);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setProductState('loading');
      setProductError('');
      try {
        const result = await listProducts({
          search: query || undefined,
          status: 'Active',
          limit: 24,
        });
        if (cancelled) return;
        setProducts(result.products);
        setProductState('ready');
      } catch (err) {
        if (cancelled) return;
        setProductError(getErrorMessage(err));
        setProductState('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const estimate = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const fee = form.deliveryMethod === 'Delivery' ? Number(form.deliveryFee || 0) : 0;
    const deliveryFee = Number.isFinite(fee) && fee > 0 ? fee : 0;
    return { subtotal, deliveryFee, total: subtotal + deliveryFee };
  }, [lines, form.deliveryMethod, form.deliveryFee]);

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function addProduct(product) {
    if (product.stockQuantity < 1) return;
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (!existing) {
        return [...current, {
          productId: product.id,
          name: product.name,
          price: product.price,
          stockQuantity: product.stockQuantity,
          quantity: 1,
        }];
      }
      if (existing.quantity >= product.stockQuantity) return current;
      return current.map((line) => (
        line.productId === product.id
          ? { ...line, quantity: line.quantity + 1, price: product.price, stockQuantity: product.stockQuantity }
          : line
      ));
    });
  }

  function setQuantity(productId, quantity) {
    setLines((current) => current.map((line) => {
      if (line.productId !== productId) return line;
      const next = Math.min(line.stockQuantity, Math.max(1, quantity));
      return { ...line, quantity: next };
    }));
  }

  function clientErrors() {
    const next = {};
    if (form.name.trim().length < 2) next['customer.name'] = 'Please enter the customer name.';
    if (form.phone.trim() && !/^[+0-9][0-9\s()-]{6,19}$/.test(form.phone.trim())) {
      next['customer.phone'] = 'Please enter a valid phone number.';
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next['customer.email'] = 'Please enter a valid email.';
    }
    if (!lines.length) next.items = 'Select at least one product.';
    if (form.deliveryMethod === 'Delivery' && form.deliveryAddress.trim().length < 5) {
      next.deliveryAddress = 'Please enter a delivery address.';
    }
    if (form.deliveryMethod === 'Delivery' && form.deliveryFee !== '') {
      const fee = Number(form.deliveryFee);
      if (!Number.isFinite(fee) || fee < 0) next.deliveryFee = 'Please enter a valid delivery fee.';
    }
    return next;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = clientErrors();
    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const result = await createOrder({
        customer: {
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
        },
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
        deliveryMethod: form.deliveryMethod,
        deliveryAddress: form.deliveryMethod === 'Delivery' ? form.deliveryAddress.trim() : undefined,
        deliveryFee: form.deliveryMethod === 'Delivery' ? Number(form.deliveryFee || 0) : 0,
        notes: form.notes.trim(),
      });
      navigate(`/orders/${result.order.id}`, { state: { created: true } });
    } catch (err) {
      setErrors(getFieldErrors(err));
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Link className="back-link" to="/orders">
        <ArrowLeft size={16} /> Orders
      </Link>
      <PageIntro
        eyebrow="MANUAL ORDER"
        title="New order"
        subtitle="Record an order a customer placed with you, for example on WhatsApp."
      />

      <form className="order-builder" onSubmit={handleSubmit}>
        <section className="card detail-card picker">
          <h2>Products</h2>
          <div className="search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search your products"
              aria-label="Search products to add"
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
            />
          </div>
          {productState === 'loading' ? <p className="muted">Loading products...</p> : null}
          {productState === 'error' ? <p className="form-error">{productError}</p> : null}
          {productState === 'ready' && products.length === 0 ? (
            <p className="muted">No active products match that search. Add a product before taking this order.</p>
          ) : null}
          <div className="pick-list">
            {products.map((product) => {
              const selected = lines.find((line) => line.productId === product.id);
              const out = product.stockQuantity < 1;
              return (
                <div className="pick-row" key={product.id}>
                  <div>
                    <strong>{product.name}</strong>
                    <small>
                      {formatPrice(product.price)} · {product.stockQuantity} in stock
                      {selected ? ` · ${selected.quantity} selected` : ''}
                    </small>
                  </div>
                  <button
                    className="secondary"
                    type="button"
                    disabled={out || (selected && selected.quantity >= product.stockQuantity)}
                    onClick={() => addProduct(product)}
                  >
                    <Plus size={15} /> {out ? 'Out' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
          {errors.items ? <span className="field-error">{errors.items}</span> : null}
        </section>

        <section className="card detail-card customer-fields">
          <h2>Customer</h2>
          {formError ? <p className="form-error">{formError}</p> : null}
          <div className="form-grid">
            <label className="wide">
              Name
              <input name="name" value={form.name} onChange={update} autoComplete="name" required minLength={2} maxLength={80} />
              {errors['customer.name'] ? <span className="field-error">{errors['customer.name']}</span> : null}
            </label>
            <label>
              Phone
              <input name="phone" value={form.phone} onChange={update} autoComplete="tel" inputMode="tel" placeholder="98765 43210" />
              {errors['customer.phone'] ? <span className="field-error">{errors['customer.phone']}</span> : null}
            </label>
            <label>
              Email
              <input name="email" type="email" value={form.email} onChange={update} autoComplete="email" inputMode="email" />
              {errors['customer.email'] ? <span className="field-error">{errors['customer.email']}</span> : null}
            </label>
            <label>
              Delivery
              <select name="deliveryMethod" value={form.deliveryMethod} onChange={update}>
                <option value="Pickup">Pickup</option>
                <option value="Delivery">Delivery</option>
              </select>
            </label>
            {form.deliveryMethod === 'Delivery' ? (
              <label>
                Delivery fee
                <input
                  name="deliveryFee"
                  value={form.deliveryFee}
                  onChange={update}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Delivery fee"
                />
                {errors.deliveryFee ? <span className="field-error">{errors.deliveryFee}</span> : null}
              </label>
            ) : null}
            {form.deliveryMethod === 'Delivery' ? (
              <label className="wide">
                Address
                <textarea
                  name="deliveryAddress"
                  value={form.deliveryAddress}
                  onChange={update}
                  autoComplete="street-address"
                  maxLength={200}
                />
                {errors.deliveryAddress ? <span className="field-error">{errors.deliveryAddress}</span> : null}
              </label>
            ) : null}
            <label className="wide">
              Notes
              <textarea name="notes" value={form.notes} onChange={update} maxLength={500} />
            </label>
          </div>
        </section>

        <aside className="card detail-card order-summary">
          <h2>This order</h2>
          {lines.length === 0 ? <p className="muted">Select products to start this order.</p> : null}
          {lines.map((line) => (
            <div className="line-row" key={line.productId}>
              <div>
                <strong>{line.name}</strong>
                <small>{formatPrice(line.price)} each · {line.stockQuantity} in stock</small>
                <div className="qty-control">
                  <button type="button" aria-label={`Decrease ${line.name}`} onClick={() => setQuantity(line.productId, line.quantity - 1)} disabled={line.quantity <= 1}>
                    <Minus size={14} />
                  </button>
                  <input
                    aria-label={`Quantity for ${line.name}`}
                    inputMode="numeric"
                    value={line.quantity}
                    onChange={(event) => setQuantity(line.productId, Number(event.target.value))}
                  />
                  <button type="button" aria-label={`Increase ${line.name}`} onClick={() => setQuantity(line.productId, line.quantity + 1)} disabled={line.quantity >= line.stockQuantity}>
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <div className="line-side">
                <strong>{formatPrice(line.price * line.quantity)}</strong>
                <button type="button" className="text-button" onClick={() => setLines((current) => current.filter((item) => item.productId !== line.productId))}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          <div className="totals">
            <div><span>Subtotal</span><span>{formatPrice(estimate.subtotal)}</span></div>
            <div><span>Delivery fee</span><span>{formatPrice(estimate.deliveryFee)}</span></div>
            <div className="totals-total"><span>Estimated total</span><strong>{formatPrice(estimate.total)}</strong></div>
          </div>
          <p className="muted">Cove saves the product price when you place the order. A later price change will not change this order.</p>
          <button className="primary" type="submit" disabled={submitting || lines.length === 0}>
            {submitting ? 'Saving order...' : 'Place order'}
          </button>
        </aside>
      </form>
    </>
  );
}

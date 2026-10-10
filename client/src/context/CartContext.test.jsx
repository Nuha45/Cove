import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { CartProvider, useCart } from './CartContext';

const PRODUCT = { id: 'p1', name: 'Mug', price: 300, available: true, stockQuantity: 10, images: [] };

function renderCart(slug = 'cart-test') {
  const cart = {};
  function Probe() {
    Object.assign(cart, useCart());
    return null;
  }
  render(<CartProvider slug={slug}><Probe /></CartProvider>);
  return cart;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('CartContext quantities', () => {
  it('keeps whole-number quantities the server accepts', () => {
    const cart = renderCart();
    act(() => { cart.addItem(PRODUCT, 2.5); });
    expect(cart.items[0].quantity).toBe(2);
    act(() => { cart.setQuantity('p1', 3.7); });
    expect(cart.items[0].quantity).toBe(3);
  });

  it('repairs fractional quantities saved by an older version', () => {
    window.localStorage.setItem('cove-cart:old-cart', JSON.stringify([
      { productId: 'p1', name: 'Mug', price: 300, quantity: 1.5, stockQuantity: 10 },
    ]));
    const cart = renderCart('old-cart');
    expect(cart.items[0].quantity).toBe(1);
  });
});

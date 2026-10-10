import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import StoreCheckoutPage from './StoreCheckoutPage';
import { CartProvider } from '../../context/CartContext';
import { createStoreOrder, getStoreProduct } from '../../services/storeService';

vi.mock('../../services/storeService', () => ({
  createStoreOrder: vi.fn(),
  getStoreProduct: vi.fn(),
}));

const BUSINESS = {
  name: 'Clay Studio',
  currency: 'INR',
  pickupEnabled: true,
  deliveryEnabled: false,
  payments: { hasConfiguredMethod: true, cashOnDeliveryEnabled: false },
};

function seedCart(items) {
  window.localStorage.setItem('cove-cart:clay-studio', JSON.stringify(items));
}

function product(id, overrides = {}) {
  return { id, name: 'Clay Mug', price: 650, available: true, stockQuantity: 10, images: [], ...overrides };
}

function renderCheckout() {
  function Layout() {
    return (
      <CartProvider slug="clay-studio">
        <Outlet context={{ business: BUSINESS }} />
      </CartProvider>
    );
  }
  return render(
    <MemoryRouter initialEntries={['/store/clay-studio/checkout']}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/store/:slug/checkout" element={<StoreCheckoutPage />} />
          <Route path="/store/:slug/order/:orderNumber" element={<div>Confirmed</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function totalText() {
  return screen.getByText('Total to pay seller').parentElement.textContent;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('StoreCheckoutPage price check', () => {
  it('shows the current price, not the one saved when the item was added', async () => {
    seedCart([{ productId: 'mug', name: 'Clay Mug', price: 500, quantity: 2, stockQuantity: 10 }]);
    vi.mocked(getStoreProduct).mockResolvedValue({ product: product('mug') });

    renderCheckout();
    expect(screen.getByRole('button', { name: 'Checking prices...' }).disabled).toBe(true);

    await screen.findByRole('button', { name: 'Place order' });
    expect(getStoreProduct).toHaveBeenCalledWith('clay-studio', 'mug');
    expect(totalText()).toContain('₹1,300');
    expect(totalText()).not.toContain('₹1,000');
    expect(screen.getByText('Price updated: Clay Mug.')).toBeTruthy();
  });

  it('drops items the shop no longer sells and lowers quantities to the stock left', async () => {
    seedCart([
      { productId: 'gone', name: 'Old Vase', price: 900, quantity: 1, stockQuantity: 5 },
      { productId: 'mug', name: 'Clay Mug', price: 650, quantity: 4, stockQuantity: 10 },
    ]);
    vi.mocked(getStoreProduct).mockImplementation(async (slug, id) => {
      if (id === 'gone') throw Object.assign(new Error('Not found'), { response: { status: 404 } });
      return { product: product(id, { stockQuantity: 3 }) };
    });

    renderCheckout();
    await screen.findByRole('button', { name: 'Place order' });
    expect(screen.queryByText(/Old Vase ×/)).toBeNull();
    expect(screen.getByText('Clay Mug × 3')).toBeTruthy();
    expect(screen.getByText('No longer available, removed: Old Vase.')).toBeTruthy();
    expect(screen.getByText('Quantity lowered to what is in stock: Clay Mug.')).toBeTruthy();
    expect(totalText()).toContain('₹1,950');
  });

  it('keeps the cart and still allows ordering when the check cannot reach the shop', async () => {
    seedCart([{ productId: 'mug', name: 'Clay Mug', price: 500, quantity: 1, stockQuantity: 10 }]);
    vi.mocked(getStoreProduct).mockRejectedValue(new Error('Network Error'));
    vi.mocked(createStoreOrder).mockResolvedValue({ order: { orderNumber: 'COVE-000001' }, confirmationToken: 'tok' });

    renderCheckout();
    const button = await screen.findByRole('button', { name: 'Place order' });
    expect(screen.getByText('Clay Mug × 1')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.change(screen.getByLabelText(/Your name/i), { target: { value: 'Asha' } });
    fireEvent.change(screen.getByLabelText(/^Phone/i), { target: { value: '9876543210' } });
    fireEvent.click(button);
    await waitFor(() => expect(createStoreOrder).toHaveBeenCalledTimes(1));
  });
});

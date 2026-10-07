import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import StoreCheckoutPage from './StoreCheckoutPage';
import { createStoreOrder } from '../../services/storeService';
import * as CartContextModule from '../../context/CartContext';

vi.mock('../../services/storeService', () => ({
  createStoreOrder: vi.fn(),
}));

const mockClear = vi.fn();
const mockCart = {
  items: [
    { productId: 'prod_1', name: 'Cotton Shirt', price: 500, quantity: 2 },
  ],
  subtotal: 1000,
  clear: mockClear,
};

function defaultBusiness(overrides = {}) {
  return {
    name: 'Artisan Co',
    currency: 'INR',
    city: 'Mumbai',
    pickupEnabled: true,
    deliveryEnabled: true,
    deliveryFee: 60,
    payments: {
      hasConfiguredMethod: true,
      cashOnDeliveryEnabled: true,
    },
    ...overrides,
  };
}

function renderCheckout({ business = defaultBusiness(), cart = mockCart } = {}) {
  vi.spyOn(CartContextModule, 'useCart').mockReturnValue(cart);

  function LayoutWrapper() {
    return <Outlet context={{ business }} />;
  }

  return render(
    <MemoryRouter initialEntries={['/store/artisan-co/checkout']}>
      <Routes>
        <Route element={<LayoutWrapper />}>
          <Route path="/store/:slug/checkout" element={<StoreCheckoutPage />} />
          <Route path="/store/:slug/order/:orderNumber" element={<div data-testid="order-page">Confirmed</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

if (typeof window !== 'undefined' && window.HTMLElement) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('StoreCheckoutPage', () => {
  it('renders empty cart state when cart has no items', () => {
    renderCheckout({
      cart: { items: [], subtotal: 0, clear: mockClear },
    });

    expect(screen.getByText('Your cart is empty. Add a product before checking out.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse products' })).toBeTruthy();
  });

  describe('delivery fee calculation', () => {
    it('calculates zero delivery fee for Pickup and full delivery fee for Delivery', () => {
      renderCheckout({
        business: defaultBusiness({ deliveryFee: 75, pickupEnabled: true, deliveryEnabled: true }),
        cart: {
          items: [{ productId: 'p1', name: 'Notebook', price: 200, quantity: 1 }],
          subtotal: 200,
          clear: mockClear,
        },
      });

      // Default is Pickup
      expect(screen.getByRole('combobox', { name: /How should we get this to you/i }).value).toBe('Pickup');
      // Delivery fee should be 0 for Pickup
      const deliveryFeeLine = screen.getByText('Delivery fee').parentElement;
      expect(deliveryFeeLine.textContent).toContain('₹0');
      const totalLine = screen.getByText('Total to pay seller').parentElement;
      expect(totalLine.textContent).toContain('₹200');

      // Switch to Delivery
      fireEvent.change(screen.getByRole('combobox', { name: /How should we get this to you/i }), {
        target: { value: 'Delivery' },
      });

      expect(screen.getByRole('combobox', { name: /How should we get this to you/i }).value).toBe('Delivery');
      // Delivery fee should now be ₹75 and total ₹275
      expect(deliveryFeeLine.textContent).toContain('₹75');
      expect(totalLine.textContent).toContain('₹275');
    });
  });

  describe('validation', () => {
    it('validates name, phone, and delivery address before submitting', async () => {
      renderCheckout({
        business: defaultBusiness({ pickupEnabled: false, deliveryEnabled: true }),
      });

      // Delivery is selected automatically since pickup is disabled
      const submitButton = screen.getByRole('button', { name: 'Place order' });
      fireEvent.click(submitButton);

      expect(await screen.findByText('Please enter your name.')).toBeTruthy();
      expect(screen.getByText('Please enter a valid phone number.')).toBeTruthy();
      expect(screen.getByText('Please enter your house / flat number and building.')).toBeTruthy();
      expect(createStoreOrder).not.toHaveBeenCalled();
    });

    it('validates phone format when invalid phone is entered', async () => {
      renderCheckout();

      fireEvent.change(screen.getByLabelText(/Your name/i), { target: { value: 'Rohit Sharma' } });
      fireEvent.change(screen.getByLabelText(/^Phone/i), { target: { value: 'abc' } });

      fireEvent.click(screen.getByRole('button', { name: 'Place order' }));

      expect(await screen.findByText('Please enter a valid phone number.')).toBeTruthy();
      expect(createStoreOrder).not.toHaveBeenCalled();
    });
  });

  describe('idempotency key behavior and submission flow', () => {
    it('uses a 48-character hex idempotency key and reuses the exact same key across retries', async () => {
      let callCount = 0;
      let recordedKeys = [];

      vi.mocked(createStoreOrder).mockImplementation((slug, payload) => {
        callCount += 1;
        recordedKeys.push(payload.checkoutKey);
        if (callCount === 1) {
          const err = new Error('Network error');
          err.response = { data: { message: 'Temporary network glitch. Please retry.' } };
          return Promise.reject(err);
        }
        return Promise.resolve({
          order: { orderNumber: 'COV-5001' },
          business: { name: 'Artisan Co' },
          confirmationToken: 'conf_token_abc',
        });
      });

      renderCheckout({
        business: defaultBusiness({ pickupEnabled: true }),
      });

      fireEvent.change(screen.getByLabelText(/Your name/i), { target: { value: 'Anita Desai' } });
      fireEvent.change(screen.getByLabelText(/^Phone/i), { target: { value: '9876543210' } });

      const submitBtn = screen.getByRole('button', { name: 'Place order' });

      // First submit - fails with network error
      fireEvent.click(submitBtn);

      expect(await screen.findByText('Temporary network glitch. Please retry.')).toBeTruthy();
      expect(createStoreOrder).toHaveBeenCalledTimes(1);
      expect(mockClear).not.toHaveBeenCalled();

      const firstKey = recordedKeys[0];
      expect(firstKey).toBeDefined();
      expect(firstKey).toHaveLength(48); // 24 bytes in hex = 48 chars
      expect(/^[0-9a-f]+$/.test(firstKey)).toBe(true);

      // Second submit (retry)
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(createStoreOrder).toHaveBeenCalledTimes(2);
      });

      const secondKey = recordedKeys[1];
      expect(secondKey).toBe(firstKey); // Idempotency key MUST be identical across retries
      expect(mockClear).toHaveBeenCalledTimes(1);
    });

    it('navigates to order confirmation page on successful checkout', async () => {
      vi.mocked(createStoreOrder).mockResolvedValue({
        order: { orderNumber: 'COV-9999' },
        business: { name: 'Artisan Co' },
        confirmationToken: 'token_xyz',
      });

      renderCheckout();

      fireEvent.change(screen.getByLabelText(/Your name/i), { target: { value: 'Priya Patel' } });
      fireEvent.change(screen.getByLabelText(/^Phone/i), { target: { value: '+919876543210' } });

      fireEvent.click(screen.getByRole('button', { name: 'Place order' }));

      await waitFor(() => {
        expect(createStoreOrder).toHaveBeenCalledWith('artisan-co', expect.objectContaining({
          customer: {
            name: 'Priya Patel',
            phone: '+919876543210',
            email: '',
          },
          deliveryMethod: 'Pickup',
        }));
      });

      expect(mockClear).toHaveBeenCalledTimes(1);
      expect(await screen.findByTestId('order-page')).toBeTruthy();
    });
  });
});

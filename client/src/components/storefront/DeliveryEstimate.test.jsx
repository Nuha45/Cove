import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import DeliveryEstimate from './DeliveryEstimate';
import StoreCheckoutPage from '../../pages/store/StoreCheckoutPage';
import { useCart } from '../../context/CartContext';
import { previewDeliveryEstimate } from '../../utils/deliveryEstimate';

vi.mock('../../context/CartContext', () => ({ useCart: vi.fn() }));
vi.mock('../../services/storeService', () => ({ createStoreOrder: vi.fn() }));

const NOTE = 'Orders placed before 2 PM are usually delivered the same day.';

function renderCheckout(business) {
  vi.mocked(useCart).mockReturnValue({
    items: [{ productId: 'p1', name: 'Gift Box', price: 500, quantity: 1 }],
    subtotal: 500,
    clear: vi.fn(),
  });
  const view = render(
    <MemoryRouter initialEntries={['/store/eta/checkout']}>
      <Routes>
        <Route element={<Outlet context={{ business }} />}>
          <Route path="/store/:slug/checkout" element={<StoreCheckoutPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
  return view;
}

const shop = {
  name: 'Eta Shop',
  currency: 'INR',
  pickupEnabled: true,
  deliveryEnabled: true,
  deliveryFee: 50,
  payments: { hasConfiguredMethod: false },
  deliveryEstimate: { text: '1–2 days', note: NOTE },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DeliveryEstimate', () => {
  it('labels the estimate and says it is not a guarantee', () => {
    render(<DeliveryEstimate estimate={{ text: 'Same day', note: NOTE }} />);
    expect(screen.getByText('Estimated delivery')).toBeTruthy();
    expect(screen.getByText('Same day')).toBeTruthy();
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(screen.getByText('This is an estimate from the shop, not a guarantee.')).toBeTruthy();
  });

  it('renders nothing without an estimate', () => {
    const { container } = render(<DeliveryEstimate estimate={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('previews what shoppers will see for each setting', () => {
    expect(previewDeliveryEstimate({ deliveryEstimate: '5_7_days', deliveryEstimateNote: '' })).toEqual({ text: '5–7 days', note: '' });
    expect(previewDeliveryEstimate({ deliveryEstimate: 'same_day', deliveryEstimateNote: `  ${NOTE} ` })).toEqual({ text: 'Same day', note: NOTE });
    expect(previewDeliveryEstimate({ deliveryEstimate: 'custom', deliveryEstimateNote: 'Within 48 hours' })).toEqual({ text: 'Within 48 hours', note: '' });
    expect(previewDeliveryEstimate({ deliveryEstimate: 'custom', deliveryEstimateNote: ' ' })).toBeNull();
  });
});

describe('checkout estimated delivery', () => {
  it('shows the estimate only when the shopper chooses delivery', () => {
    const { container } = renderCheckout(shop);
    expect(screen.queryByText('Estimated delivery')).toBeNull();

    fireEvent.change(container.querySelector('select[name="deliveryMethod"]'), { target: { value: 'Delivery' } });
    expect(screen.getByText('Estimated delivery')).toBeTruthy();
    expect(screen.getByText('1–2 days')).toBeTruthy();
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(screen.getByText(/not a guarantee/)).toBeTruthy();
  });

  it('shows nothing when the shop has no estimate', () => {
    const { container } = renderCheckout({ ...shop, deliveryEstimate: null });
    fireEvent.change(container.querySelector('select[name="deliveryMethod"]'), { target: { value: 'Delivery' } });
    expect(screen.queryByText('Estimated delivery')).toBeNull();
  });
});

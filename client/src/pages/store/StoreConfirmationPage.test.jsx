import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StoreConfirmationPage from './StoreConfirmationPage';
import { getStoreOrderConfirmation } from '../../services/storeService';

vi.mock('../../services/storeService', () => ({
  getStoreOrderConfirmation: vi.fn(),
  submitStorePaymentReference: vi.fn(),
}));

function confirmation(order) {
  return {
    business: {
      name: 'Cash Kitchen',
      currency: 'INR',
      payments: { hasConfiguredMethod: true, cashOnDeliveryEnabled: true, linkEnabled: true, paymentLink: 'https://pay.example.com' },
    },
    order: {
      orderNumber: 'COV-1001',
      createdAt: '2026-10-03T10:00:00.000Z',
      status: 'New',
      paymentStatus: 'Payment Pending',
      deliveryMethod: 'Delivery',
      deliveryAddress: '12 Baker Street',
      subtotal: 300,
      deliveryFee: 0,
      total: 300,
      items: [{ name: 'Cash Cake', quantity: 1, price: 300, subtotal: 300 }],
      customer: { name: 'Asha' },
      ...order,
    },
  };
}

async function renderPage(order) {
  vi.mocked(getStoreOrderConfirmation).mockResolvedValue(confirmation(order));
  render(
    <MemoryRouter initialEntries={['/store/cash-kitchen/order/COV-1001?c=token123']}>
      <Routes>
        <Route path="/store/:slug/order/:orderNumber" element={<StoreConfirmationPage />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByText('Order details');
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('StoreConfirmationPage cash on delivery', () => {
  it('tells the customer to pay cash on delivery and hides the payment reference form', async () => {
    await renderPage({ paymentMethod: 'cash_on_delivery' });
    expect(screen.getByText('Next step: pay Cash Kitchen on delivery')).toBeTruthy();
    expect(screen.getByText('Method: Cash on delivery')).toBeTruthy();
    expect(screen.getByText(/keep the cash ready and pay when your order is delivered/)).toBeTruthy();
    expect(screen.getByText(/Pay in cash when your order is delivered. The seller marks it paid/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Cash on delivery' })).toBeTruthy();
    expect(screen.queryByText(/share a reference/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit payment reference' })).toBeNull();
  });

  it('still offers the reference form for transfer methods', async () => {
    await renderPage({ paymentMethod: 'payment_link' });
    expect(await screen.findByRole('button', { name: 'Submit payment reference' })).toBeTruthy();
    expect(screen.queryByText('Next step: pay Cash Kitchen on delivery')).toBeNull();
  });

  it('shows the estimated delivery saved on the order', async () => {
    await renderPage({ paymentMethod: 'cash_on_delivery', deliveryEstimate: { text: '2–3 days', note: 'Weekends may take longer.' } });
    expect(screen.getByText('Estimated delivery')).toBeTruthy();
    expect(screen.getByText('2–3 days')).toBeTruthy();
    expect(screen.getByText('Weekends may take longer.')).toBeTruthy();
    expect(screen.getByText(/not a guarantee/)).toBeTruthy();
  });

  it('hides the estimate for orders without one, completed orders and pickup orders', async () => {
    await renderPage({ paymentMethod: 'payment_link', deliveryEstimate: null });
    expect(screen.queryByText('Estimated delivery')).toBeNull();
    cleanup();
    await renderPage({ status: 'Completed', deliveryEstimate: { text: '2–3 days', note: '' } });
    expect(screen.queryByText('Estimated delivery')).toBeNull();
    cleanup();
    await renderPage({ deliveryMethod: 'Pickup', deliveryEstimate: { text: '2–3 days', note: '' } });
    expect(screen.queryByText('Estimated delivery')).toBeNull();
  });

  it('shows a paid COD order as paid with nothing left to do', async () => {
    await renderPage({ paymentMethod: 'cash_on_delivery', paymentStatus: 'Paid' });
    expect(screen.getByText(/The seller marked this order as paid/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Submit payment reference' })).toBeNull();
  });
});

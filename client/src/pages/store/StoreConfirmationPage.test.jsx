import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StoreConfirmationPage from './StoreConfirmationPage';
import { getStoreOrderConfirmation } from '../../services/storeService';

vi.mock('../../services/storeService', () => ({
  getStoreOrderConfirmation: vi.fn(),
  submitStorePaymentReference: vi.fn(),
  storeInvoiceUrl: (slug, token, { download = false } = {}) => (
    `/api/store/${slug}/orders/confirm/${token}/invoice${download ? '?download=1' : ''}`
  ),
}));

function confirmation(order, extra = {}) {
  return {
    ...extra,
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

async function renderPage(order, extra, path = '/store/cash-kitchen/order/COV-1001?c=token123') {
  vi.mocked(getStoreOrderConfirmation).mockResolvedValue(confirmation(order, extra));
  render(
    <MemoryRouter initialEntries={[path]}>
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

  it('hides the reference form while the shop is paused, since the server refuses it', async () => {
    const data = confirmation({ paymentMethod: 'payment_link' });
    data.business.paused = true;
    vi.mocked(getStoreOrderConfirmation).mockResolvedValue(data);
    render(
      <MemoryRouter initialEntries={['/store/cash-kitchen/order/COV-1001?c=token123']}>
        <Routes>
          <Route path="/store/:slug/order/:orderNumber" element={<StoreConfirmationPage />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText('Order details');
    expect(screen.queryByRole('button', { name: 'Submit payment reference' })).toBeNull();
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

describe('StoreConfirmationPage invoice', () => {
  it('links to the invoice through the private confirmation token when the shop offers invoices', async () => {
    await renderPage({ paymentMethod: 'cash_on_delivery' }, { invoiceAvailable: true });
    expect(screen.getByRole('heading', { name: 'Invoice' })).toBeTruthy();
    const view = screen.getByRole('link', { name: 'View invoice' });
    expect(view.getAttribute('href')).toBe('/api/store/cash-kitchen/orders/confirm/token123/invoice');
    expect(view.getAttribute('target')).toBe('_blank');
    expect(view.getAttribute('rel')).toContain('noreferrer');
    expect(screen.getByRole('link', { name: 'Download PDF' }).getAttribute('href'))
      .toBe('/api/store/cash-kitchen/orders/confirm/token123/invoice?download=1');
  });

  it('hides the invoice when the shop does not offer invoices', async () => {
    await renderPage({ paymentMethod: 'cash_on_delivery' }, { invoiceAvailable: false });
    expect(screen.queryByRole('heading', { name: 'Invoice' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'View invoice' })).toBeNull();
  });

  it('hides the invoice without the confirmation token, even from a saved copy', async () => {
    window.sessionStorage.clear();
    await renderPage({ paymentMethod: 'cash_on_delivery' }, { invoiceAvailable: true });
    cleanup();
    await renderPage({ paymentMethod: 'cash_on_delivery' }, { invoiceAvailable: true }, '/store/cash-kitchen/order/COV-1001');
    expect(getStoreOrderConfirmation).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: 'View invoice' })).toBeNull();
    window.sessionStorage.clear();
  });
});

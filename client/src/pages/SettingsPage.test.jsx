import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import SettingsPage from './SettingsPage';
import { useAuth } from '../context/AuthContext';
import { getBusinessSettings, updateBusinessSettings } from '../services/businessService';
import { PAYMENT_CURRENCY_NOTES } from '../components/settings/PaymentCurrencyNote';
import { formatPrice, setDefaultCurrency } from '../utils/display';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../services/businessService', () => ({
  getBusinessSettings: vi.fn(),
  updateBusinessSettings: vi.fn(),
}));

const PAYMENT_FIELDS = {
  paymentQrEnabled: true,
  paymentLinkEnabled: true,
  paymentInstructionsEnabled: true,
  payOnPickupEnabled: true,
  paymentLink: 'https://pay.example.com/shop',
  paymentQrImage: 'https://res.cloudinary.com/demo/image/upload/qr.png',
  paymentUpiId: '',
  paymentInstructions: 'Bank transfer to Shop LLC',
};

function business(currency) {
  return {
    id: 'b1',
    name: 'Nuha Jewelry',
    slug: 'nuha-jewelry',
    category: 'Jewelry & Accessories',
    currency,
    pickupEnabled: true,
    deliveryEnabled: true,
    deliveryFee: 0,
    storefrontActive: true,
    ...PAYMENT_FIELDS,
  };
}

const METHODS = [
  { key: 'qr', description: 'Show your payment QR on checkout and confirmation.', toggle: 'paymentQrEnabled' },
  { key: 'link', description: 'Share a link customers can open to pay you.', toggle: 'paymentLinkEnabled' },
  { key: 'instructions', description: 'Bank transfer details or other written instructions.', toggle: 'paymentInstructionsEnabled' },
  { key: 'pickup', description: 'Let pickup customers pay when they collect the order.', toggle: 'payOnPickupEnabled' },
];

const refresh = vi.fn(() => Promise.resolve());

function Shell() {
  return <Outlet context={{ notify: vi.fn(), plan: {} }} />;
}

async function renderPayments(currency) {
  vi.mocked(useAuth).mockReturnValue({ user: { email: 'seller@example.com', emailVerified: true }, refresh });
  vi.mocked(getBusinessSettings).mockResolvedValue({ business: business(currency) });
  const view = render(
    <MemoryRouter initialEntries={['/settings?tab=payments']}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
  await screen.findByText('Currency & payment methods');
  return view;
}

function methodRow(description) {
  return screen.getByText(description).closest('label');
}

function toggleStates(container) {
  return Object.fromEntries(
    METHODS.map(({ toggle }) => [toggle, container.querySelector(`input[name="${toggle}"]`).checked])
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  setDefaultCurrency('INR');
});

describe('SettingsPage payment currency notes', () => {
  it('shows the currency note and helper text under each of the four payment methods', async () => {
    const { container } = await renderPayments('AED');

    expect(screen.getByText(/Your store currency controls the prices shown to customers/)).toBeTruthy();
    const titles = METHODS.map(({ description }) => methodRow(description).querySelector('strong').textContent);
    expect(titles).toEqual(['QR code', 'Payment link', 'Payment instructions', 'Pay on pickup']);

    for (const { key, description, toggle } of METHODS) {
      const row = methodRow(description);
      const note = row.querySelector('.payment-currency-note');
      expect(note, key).toBeTruthy();
      expect(note.querySelector('.payment-currency-label').textContent).toBe(PAYMENT_CURRENCY_NOTES[key].label);
      expect(note.querySelector('.payment-currency-help').textContent).toBe(PAYMENT_CURRENCY_NOTES[key].help);
      expect(container.querySelector(`input[name="${toggle}"]`).disabled).toBe(false);
    }
  });

  it('uses the agreed wording', () => {
    expect(PAYMENT_CURRENCY_NOTES.qr).toEqual({
      label: 'Currency: Seller-defined',
      help: 'The QR provider determines which currencies this QR can accept.',
    });
    expect(PAYMENT_CURRENCY_NOTES.link).toEqual({
      label: 'Currency: Depends on payment provider',
      help: 'International currencies require the payment provider to support them and may require international payments to be enabled.',
    });
    expect(PAYMENT_CURRENCY_NOTES.instructions).toEqual({
      label: 'Currency: Seller-defined',
      help: 'Cove does not process these payments.',
    });
    expect(PAYMENT_CURRENCY_NOTES.pickup).toEqual({
      label: 'Currency: Your store currency',
      help: 'Payment is handled directly by the seller.',
    });
  });

  it('shows the same notes for every store currency', async () => {
    for (const currency of ['INR', 'AED', 'USD', 'GBP', 'EUR']) {
      await renderPayments(currency);
      expect(screen.getAllByText('Currency: Seller-defined')).toHaveLength(2);
      expect(screen.getByText('Currency: Depends on payment provider')).toBeTruthy();
      expect(screen.getByText('Currency: Your store currency')).toBeTruthy();
      cleanup();
    }
  });

  it('changing the store currency leaves the payment-method configuration untouched', async () => {
    vi.mocked(updateBusinessSettings).mockImplementation(async (payload) => ({ business: { ...business('INR'), ...payload } }));
    const { container } = await renderPayments('INR');
    const before = toggleStates(container);

    fireEvent.click(screen.getByRole('button', { name: 'Storefront' }));
    fireEvent.change(container.querySelector('select[name="currency"]'), { target: { value: 'AED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Customer payments' }));

    expect(toggleStates(container)).toEqual(before);
    for (const { description } of METHODS) {
      expect(methodRow(description).querySelector('.payment-currency-note')).toBeTruthy();
    }

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    expect(updateBusinessSettings).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(updateBusinessSettings).mock.calls[0][0];
    expect(payload.currency).toBe('AED');
    for (const [field, value] of Object.entries(PAYMENT_FIELDS)) {
      expect(payload[field], field).toBe(value);
    }
  });

  it('keeps Cove subscription prices in INR when the store currency is AED', async () => {
    await renderPayments('AED');
    setDefaultCurrency('AED');
    expect(formatPrice(599, 'INR')).toBe('₹599');
    expect(formatPrice(899, 'INR')).toBe('₹899');
    expect(screen.queryByText(/599|899/)).toBeNull();
  });
});

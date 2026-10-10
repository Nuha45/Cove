import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PaymentHistory from './PaymentHistory';
import { getBillingReceiptInvoice, listBillingReceipts } from '../../services/billingService';

vi.mock('../../services/billingService', () => ({
  listBillingReceipts: vi.fn(),
  getBillingReceiptInvoice: vi.fn(),
}));

const INVOICE_URL = 'https://rzp.io/i/AbC123';

function receipt(overrides = {}) {
  return {
    id: 'r1',
    receiptNumber: 'CR-000001',
    plan: 'pro',
    planName: 'Cove Basic',
    amountPaise: 49900,
    amount: 499,
    currency: 'INR',
    paidAt: '2026-10-01T12:00:00.000Z',
    periodStartAt: '2026-10-01T12:00:00.000Z',
    periodEndAt: '2026-11-01T12:00:00.000Z',
    invoiceAvailable: true,
    invoiceLookupAvailable: false,
    ...overrides,
  };
}

function page(receipts, extra = {}) {
  return { receipts, page: 1, limit: 10, total: receipts.length, ...extra };
}

function apiError(status, message) {
  return Object.assign(new Error(message), { response: { status, data: { message } } });
}

function renderHistory() {
  const notify = vi.fn();
  const view = render(<PaymentHistory notify={notify} />);
  return { notify, ...view };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('PaymentHistory', () => {
  it('lists each payment with plan, amount, currency, paid date and billing period', async () => {
    listBillingReceipts.mockResolvedValue(page([
      receipt(),
      receipt({
        id: 'r2',
        receiptNumber: 'CR-000002',
        plan: 'advanced',
        planName: 'Cove Plus',
        amountPaise: 99900,
        amount: 999,
        periodStartAt: null,
        periodEndAt: null,
      }),
    ]));
    const { container } = renderHistory();

    await screen.findByText('Cove Basic');
    expect(listBillingReceipts).toHaveBeenCalledWith({ page: 1, limit: 10 });
    expect(screen.getByText('Cove Plus')).toBeTruthy();
    expect(screen.getByText('₹499')).toBeTruthy();
    expect(screen.getByText('₹999')).toBeTruthy();
    expect(screen.getAllByText(/INR · Paid 1 Oct 2026/)).toHaveLength(2);
    expect(screen.getByText('Billing period 1 Oct 2026 – 1 Nov 2026')).toBeTruthy();
    expect(screen.getAllByText(/Billing period/)).toHaveLength(1);

    const html = container.innerHTML;
    expect(html).not.toContain('CR-');
    expect(html).not.toContain('rzp.io');
    expect(screen.queryByText('No payments yet')).toBeNull();
  });

  it('shows View invoice only for payments with an available invoice', async () => {
    listBillingReceipts.mockResolvedValue(page([
      receipt(),
      receipt({ id: 'r2', receiptNumber: 'CR-000002', invoiceAvailable: false }),
    ]));
    renderHistory();

    await screen.findAllByText('Cove Basic');
    expect(screen.getAllByRole('button', { name: /View invoice/ })).toHaveLength(1);
    expect(screen.getByText('Invoice not available yet')).toBeTruthy();
    expect(getBillingReceiptInvoice).not.toHaveBeenCalled();
  });

  it('fetches the invoice URL on click and opens it in a new tab without opener or referrer', async () => {
    listBillingReceipts.mockResolvedValue(page([receipt()]));
    getBillingReceiptInvoice.mockResolvedValue({ url: INVOICE_URL });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { notify } = renderHistory();

    fireEvent.click(await screen.findByRole('button', { name: /View invoice/ }));

    const link = await screen.findByRole('link', { name: /View invoice/ });
    expect(getBillingReceiptInvoice).toHaveBeenCalledWith('r1');
    expect(open).toHaveBeenCalledWith(INVOICE_URL, '_blank', 'noopener,noreferrer');
    expect(link.getAttribute('href')).toBe(INVOICE_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports invoice API errors without opening a tab and keeps the action for a retry', async () => {
    listBillingReceipts.mockResolvedValue(page([receipt()]));
    getBillingReceiptInvoice.mockRejectedValue(apiError(502, 'We could not load this invoice right now.'));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { notify, container } = renderHistory();

    fireEvent.click(await screen.findByRole('button', { name: /View invoice/ }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('We could not load this invoice right now.'));
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /View invoice/ }).disabled).toBe(false);
    expect(container.innerHTML).not.toContain('rzp.io');
  });

  it('offers View invoice for a payment whose invoice the server can still look up', async () => {
    listBillingReceipts.mockResolvedValue(page([
      receipt({ invoiceAvailable: false, invoiceLookupAvailable: true }),
    ]));
    getBillingReceiptInvoice.mockResolvedValue({ url: INVOICE_URL });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderHistory();

    fireEvent.click(await screen.findByRole('button', { name: /View invoice/ }));

    await screen.findByRole('link', { name: /View invoice/ });
    expect(getBillingReceiptInvoice).toHaveBeenCalledWith('r1');
    expect(open).toHaveBeenCalledWith(INVOICE_URL, '_blank', 'noopener,noreferrer');
  });

  it('marks the invoice unavailable when the lookup finds none', async () => {
    listBillingReceipts.mockResolvedValue(page([
      receipt({ invoiceAvailable: false, invoiceLookupAvailable: true }),
    ]));
    getBillingReceiptInvoice.mockRejectedValue(
      apiError(404, 'Razorpay has not issued an invoice for this payment yet. Please try again later.'),
    );
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { notify } = renderHistory();

    fireEvent.click(await screen.findByRole('button', { name: /View invoice/ }));

    await screen.findByText('Invoice not available yet');
    expect(notify).toHaveBeenCalledWith('Razorpay has not issued an invoice for this payment yet. Please try again later.');
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /View invoice/ })).toBeNull();
  });

  it('refuses to open a non-HTTPS invoice URL', async () => {
    listBillingReceipts.mockResolvedValue(page([receipt()]));
    getBillingReceiptInvoice.mockResolvedValue({ url: 'javascript:alert(1)' });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { notify } = renderHistory();

    fireEvent.click(await screen.findByRole('button', { name: /View invoice/ }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith(
      'This invoice isn’t available right now. Please try again later.',
    ));
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /View invoice/ })).toBeNull();
  });

  it('shows the list error and retries on Try again', async () => {
    listBillingReceipts
      .mockRejectedValueOnce(apiError(500, 'Couldn’t load payments.'))
      .mockResolvedValueOnce(page([receipt()]));
    renderHistory();

    expect(screen.getByText('Loading payments...')).toBeTruthy();
    await screen.findByText('Couldn’t load payments.');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('Cove Basic');
    expect(listBillingReceipts).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Couldn’t load payments.')).toBeNull();
  });

  it('shows an empty state when there are no payments', async () => {
    listBillingReceipts.mockResolvedValue(page([]));
    renderHistory();

    await screen.findByText('No payments yet');
    expect(screen.queryByRole('button', { name: /View invoice/ })).toBeNull();
    expect(screen.queryByText(/Page \d of/)).toBeNull();
  });

  it('pages through payments', async () => {
    listBillingReceipts
      .mockResolvedValueOnce(page([receipt()], { total: 25 }))
      .mockResolvedValueOnce(page([receipt({ id: 'r11', planName: 'Cove Plus' })], { page: 2, total: 25 }));
    renderHistory();

    await screen.findByText('Page 1 of 3');
    expect(screen.getByRole('button', { name: 'Previous' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByText('Cove Plus');
    expect(listBillingReceipts).toHaveBeenLastCalledWith({ page: 2, limit: 10 });
    expect(screen.getByText('Page 2 of 3')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous' }).disabled).toBe(false);
  });
});

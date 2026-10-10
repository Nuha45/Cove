import { afterEach, describe, expect, it, vi } from 'vitest';
import api from './api';
import { getBillingReceiptInvoice, listBillingReceipts } from './billingService';

vi.mock('./api', () => ({ default: { get: vi.fn() } }));

afterEach(() => {
  vi.clearAllMocks();
});

describe('billing receipts service', () => {
  it('lists receipts through the authenticated API client', async () => {
    api.get.mockResolvedValue({ data: { receipts: [], page: 2, limit: 10, total: 0 } });

    const result = await listBillingReceipts({ page: 2, limit: 10 });

    expect(api.get).toHaveBeenCalledWith('/billing/receipts', { params: { page: 2, limit: 10 } });
    expect(result).toEqual({ receipts: [], page: 2, limit: 10, total: 0 });
  });

  it('requests the invoice URL for one receipt', async () => {
    api.get.mockResolvedValue({ data: { url: 'https://rzp.io/i/AbC123' } });

    const result = await getBillingReceiptInvoice('64f0c0ffee/../x');

    expect(api.get).toHaveBeenCalledWith('/billing/receipts/64f0c0ffee%2F..%2Fx/invoice');
    expect(result).toEqual({ url: 'https://rzp.io/i/AbC123' });
  });
});

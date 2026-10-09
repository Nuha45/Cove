import { afterEach, describe, expect, it, vi } from 'vitest';
import api from './api';
import { storeInvoiceUrl } from './storeService';

vi.mock('./api', () => ({ default: { defaults: { baseURL: '/api' } } }));

afterEach(() => {
  api.defaults.baseURL = '/api';
});

describe('storeInvoiceUrl', () => {
  it('builds the customer invoice link under a relative API base', () => {
    expect(storeInvoiceUrl('cash-kitchen', 'abc123')).toBe('/api/store/cash-kitchen/orders/confirm/abc123/invoice');
    expect(storeInvoiceUrl('cash-kitchen', 'abc123', { download: true }))
      .toBe('/api/store/cash-kitchen/orders/confirm/abc123/invoice?download=1');
  });

  it('builds the customer invoice link under an absolute API base', () => {
    api.defaults.baseURL = 'https://api.example.com/api/';
    expect(storeInvoiceUrl('cash-kitchen', 'abc123'))
      .toBe('https://api.example.com/api/store/cash-kitchen/orders/confirm/abc123/invoice');
  });

  it('encodes the slug and token', () => {
    expect(storeInvoiceUrl('shop', 'a/b?c')).toBe('/api/store/shop/orders/confirm/a%2Fb%3Fc/invoice');
  });
});

import { describe, expect, it } from 'vitest';
import {
  enabledCheckoutMethods,
  paymentMethodHint,
  paymentMethodLabel,
  paymentStatusCustomerCopy,
  PAYMENT_METHODS,
} from './payments';

const payments = {
  qrEnabled: false,
  linkEnabled: true,
  instructionsEnabled: false,
  payOnPickupEnabled: true,
  cashOnDeliveryEnabled: true,
};

describe('cash on delivery payment helpers', () => {
  it('labels the method the same in every currency', () => {
    expect(PAYMENT_METHODS).toContain('cash_on_delivery');
    for (const currency of ['INR', 'AED', 'USD']) {
      expect(paymentMethodLabel('cash_on_delivery', currency)).toBe('Cash on delivery');
    }
    expect(paymentMethodHint('cash_on_delivery')).toBe('Pay in cash when your order is delivered.');
  });

  it('offers cash on delivery only for delivery orders when the seller enabled it', () => {
    const delivery = enabledCheckoutMethods(payments, 'Delivery').map((option) => option.value);
    const pickup = enabledCheckoutMethods(payments, 'Pickup').map((option) => option.value);
    expect(delivery).toEqual(['payment_link', 'cash_on_delivery']);
    expect(pickup).toEqual(['payment_link', 'pay_on_pickup']);

    const off = enabledCheckoutMethods({ ...payments, cashOnDeliveryEnabled: false }, 'Delivery').map((o) => o.value);
    expect(off).toEqual(['payment_link']);
  });

  it('explains pending cash payments without asking for a transfer', () => {
    expect(paymentStatusCustomerCopy('Payment Pending', 'cash_on_delivery')).toMatch(/Pay in cash when your order is delivered/);
    expect(paymentStatusCustomerCopy('Pending', 'cash_on_delivery')).toMatch(/Pay in cash/);
    expect(paymentStatusCustomerCopy('Paid', 'cash_on_delivery')).toBe('The seller confirmed they received your payment.');
    expect(paymentStatusCustomerCopy('Payment Pending', 'payment_link')).toMatch(/share a reference/);
  });
});

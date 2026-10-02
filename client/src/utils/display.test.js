import { afterEach, describe, expect, it } from 'vitest';
import { currencySymbol, formatPrice, getDefaultCurrency, setDefaultCurrency } from './display';

afterEach(() => {
  setDefaultCurrency('INR');
});

describe('formatPrice', () => {
  it('formats INR with the rupee sign and Indian grouping', () => {
    expect(formatPrice(125000, 'INR')).toBe('₹1,25,000');
    expect(formatPrice(99.5, 'INR')).toBe('₹99.50');
  });

  it('formats AED with the dirham sign', () => {
    expect(formatPrice(20.4, 'AED')).toBe('د.إ 20.40');
    expect(formatPrice(1250, 'AED')).toBe('د.إ 1,250');
  });

  it('formats USD, GBP and EUR', () => {
    expect(formatPrice(1250.5, 'USD')).toBe('$1,250.50');
    expect(formatPrice(1250.5, 'GBP')).toBe('£1,250.50');
    expect(formatPrice(1250.5, 'EUR')).toBe('€1,250.50');
  });

  it('follows the store currency when none is passed', () => {
    setDefaultCurrency('AED');
    expect(getDefaultCurrency()).toBe('AED');
    expect(formatPrice(250)).toBe('د.إ 250');
    expect(currencySymbol()).toBe('د.إ');
  });

  it('only changes the symbol, never the amount', () => {
    const price = 1250.5;
    for (const code of ['INR', 'AED', 'USD', 'GBP', 'EUR']) {
      setDefaultCurrency(code);
      expect(formatPrice(price)).toMatch(/1,250\.50$/);
    }
    expect(price).toBe(1250.5);
  });

  it('falls back to INR for unknown currencies', () => {
    expect(currencySymbol('XYZ')).toBe('₹');
    expect(formatPrice(10, 'XYZ')).toBe('₹10');
  });

  it('keeps Cove plan prices in INR whatever the store currency is', () => {
    setDefaultCurrency('AED');
    expect(formatPrice(599, 'INR')).toBe('₹599');
    expect(formatPrice(899, 'INR')).toBe('₹899');
  });
});

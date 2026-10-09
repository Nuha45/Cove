const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { CURRENCIES, currencySymbol, formatMoney } = require('../utils/currencies');
const { formatMoney: formatPdfMoney } = require('../utils/invoicePdf');
const { formatMoney: formatEmailMoney } = require('../services/emailService');
const { COVE_PRO, COVE_ADVANCED, getPlan } = require('../utils/covePlan');

describe('currencies', () => {
  it('supports exactly INR, USD, AED, GBP and EUR', () => {
    assert.deepEqual([...CURRENCIES].sort(), ['AED', 'EUR', 'GBP', 'INR', 'USD']);
  });

  it('maps each store currency to its symbol', () => {
    assert.equal(currencySymbol('INR'), '₹');
    assert.equal(currencySymbol('AED'), 'د.إ');
    assert.equal(currencySymbol('USD'), '$');
    assert.equal(currencySymbol('GBP'), '£');
    assert.equal(currencySymbol('EUR'), '€');
    assert.equal(currencySymbol('aed'), 'د.إ');
    assert.equal(currencySymbol('XYZ'), '₹');
    assert.equal(currencySymbol(undefined), '₹');
  });

  it('formats INR prices with Indian grouping', () => {
    assert.equal(formatMoney(125000, 'INR'), '₹1,25,000');
    assert.equal(formatMoney(250, 'INR'), '₹250');
    assert.equal(formatMoney(99.5, 'INR'), '₹99.50');
  });

  it('formats AED prices with the dirham sign', () => {
    assert.equal(formatMoney(20.4, 'AED'), 'د.إ\u200E 20.40');
    assert.equal(formatMoney(1250, 'AED'), 'د.إ\u200E 1,250');
  });

  it('formats USD, GBP and EUR prices', () => {
    assert.equal(formatMoney(1250.5, 'USD'), '$1,250.50');
    assert.equal(formatMoney(1250.5, 'GBP'), '£1,250.50');
    assert.equal(formatMoney(1250.5, 'EUR'), '€1,250.50');
  });

  it('never converts the amount between currencies', () => {
    for (const code of CURRENCIES) {
      assert.match(formatMoney(1250.5, code), /1,250\.50$/);
    }
  });

  it('handles invalid and negative amounts', () => {
    assert.equal(formatMoney('abc', 'USD'), '$0');
    assert.equal(formatMoney(-15, 'GBP'), '-£15');
  });

  it('uses the store currency in emails', () => {
    assert.equal(formatEmailMoney(20.4, 'AED'), 'د.إ\u200E 20.40');
    assert.equal(formatEmailMoney(250, 'USD'), '$250');
    assert.equal(formatEmailMoney(250), '₹250');
  });

  it('uses symbols the invoice fonts can draw, and a code for AED', () => {
    assert.equal(formatPdfMoney(1250, 'INR'), '₹1,250.00');
    assert.equal(formatPdfMoney(20.4, 'AED'), 'AED 20.40');
    assert.equal(formatPdfMoney(1250, 'USD'), '$1,250.00');
    assert.equal(formatPdfMoney(1250, 'GBP'), '£1,250.00');
    assert.equal(formatPdfMoney(1250, 'EUR'), '€1,250.00');
  });

  it('keeps Cove Basic and Plus priced in INR', () => {
    assert.equal(COVE_PRO.currency, 'INR');
    assert.equal(COVE_PRO.amountDisplay, 599);
    assert.equal(COVE_PRO.amountPaise, 59900);
    assert.equal(COVE_ADVANCED.currency, 'INR');
    assert.equal(COVE_ADVANCED.amountDisplay, 899);
    assert.equal(COVE_ADVANCED.amountPaise, 89900);
    assert.equal(formatMoney(getPlan('pro').amountDisplay, getPlan('pro').currency), '₹599');
    assert.equal(formatMoney(getPlan('advanced').amountDisplay, getPlan('advanced').currency), '₹899');
  });
});

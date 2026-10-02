// Keep this list small. Amounts are stored as plain numbers in the shop's currency; the code is display-only.
// Cove never converts between currencies, and Cove's own subscription plans are always INR (see covePlan.js).
const CURRENCIES = ['INR', 'USD', 'AED', 'GBP', 'EUR'];

const CURRENCY_SYMBOLS = {
  INR: '₹',
  AED: 'د.إ',
  USD: '$',
  GBP: '£',
  EUR: '€',
};

function currencyCode(currency) {
  const code = String(currency || '').toUpperCase();
  return CURRENCIES.includes(code) ? code : 'INR';
}

function currencySymbol(currency) {
  return CURRENCY_SYMBOLS[currencyCode(currency)];
}

// "₹1,25,000", "$1,250.50", "د.إ 20.40". Whole amounts drop the decimals.
function formatMoney(amount, currency = 'INR', { decimals = 'auto' } = {}) {
  const code = currencyCode(currency);
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  const whole = Math.abs(safe - Math.round(safe)) < 0.001;
  const digits = decimals === 'auto' ? (whole ? 0 : 2) : decimals;
  const number = new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(safe));
  const sign = safe < 0 ? '-' : '';
  // The dirham sign is right-to-left Arabic script: the left-to-right mark stops browsers and mail apps
  // from drawing the amount before it ("20.40 د.إ"), and the space keeps it off the digits.
  const symbol = CURRENCY_SYMBOLS[code];
  return code === 'AED' ? `${sign}${symbol}\u200E ${number}` : `${sign}${symbol}${number}`;
}

module.exports = { CURRENCIES, CURRENCY_SYMBOLS, currencyCode, currencySymbol, formatMoney };

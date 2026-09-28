import QRCode from 'qrcode';

/**
 * Basic UPI VPA (UPI ID) validation — format only.
 */
export function normalizeUpiId(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidUpiId(value) {
  const vpa = normalizeUpiId(value);
  if (!vpa) return false;
  return /^[a-z0-9.\-_]{2,256}@[a-z][a-z0-9.\-]{1,63}$/i.test(vpa);
}

/**
 * Build a standard UPI deep-link with amount and order note prefilled.
 * Does not verify payment — opens the customer's UPI app when supported.
 */
export function buildUpiPayUri({
  upiId,
  payeeName = '',
  amount,
  currency = 'INR',
  transactionNote = '',
}) {
  const pa = normalizeUpiId(upiId);
  if (!pa || !isValidUpiId(pa)) return '';
  if (currency !== 'INR') return '';

  const am = Number(amount);
  if (!Number.isFinite(am) || am <= 0) return '';

  const params = [['pa', pa]];
  const pn = String(payeeName || '').trim().slice(0, 50);
  if (pn) params.push(['pn', pn]);
  // Two decimal places for INR amounts in UPI intents
  params.push(['am', am.toFixed(2)]);
  params.push(['cu', 'INR']);
  const tn = String(transactionNote || '').trim().slice(0, 80);
  if (tn) params.push(['tn', tn]);

  // Some UPI apps show "+" literally and reject an escaped "@", so use %20 and keep "@" as is.
  const query = params
    .map(([key, value]) => `${key}=${encodeURIComponent(value).replace(/%40/g, '@')}`)
    .join('&');
  return `upi://pay?${query}`;
}

/**
 * Android shows a chooser for upi:// links. iOS has no chooser: upi:// opens whichever single
 * app claimed the scheme (often WhatsApp), so iPhone users get per-app links instead.
 */
export function detectPaymentPlatform(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav) return 'desktop';
  const ua = nav.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

// iOS URL schemes registered by each app; a browser cannot tell which ones are installed.
export const IOS_UPI_APPS = [
  { id: 'gpay', label: 'Google Pay', prefix: 'tez://upi/pay' },
  { id: 'phonepe', label: 'PhonePe', prefix: 'phonepe://pay' },
  { id: 'paytm', label: 'Paytm', prefix: 'paytmmp://upi/pay' },
  { id: 'bhim', label: 'BHIM', prefix: 'bhim://upi/pay' },
];

export function buildUpiAppUri(upiUri, prefix) {
  const query = String(upiUri || '').split('?')[1];
  if (!query || !prefix) return '';
  return `${prefix}?${query}`;
}

export async function upiQrDataUrl(upiUri) {
  if (!upiUri) return '';
  try {
    return await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
      color: { dark: '#1f2937', light: '#ffffff' },
    });
  } catch {
    return '';
  }
}

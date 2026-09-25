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

  const params = new URLSearchParams();
  params.set('pa', pa);
  const pn = String(payeeName || '').trim().slice(0, 50);
  if (pn) params.set('pn', pn);
  // Two decimal places for INR amounts in UPI intents
  params.set('am', am.toFixed(2));
  params.set('cu', 'INR');
  const tn = String(transactionNote || '').trim().slice(0, 80);
  if (tn) params.set('tn', tn);

  return `upi://pay?${params.toString()}`;
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

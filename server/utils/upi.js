/**
 * Basic UPI VPA (UPI ID) validation.
 * Does not prove the ID exists — format check only.
 */
function normalizeUpiId(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidUpiId(value) {
  const vpa = normalizeUpiId(value);
  if (!vpa) return false;
  // Common VPA shape: user@handle (e.g. name@oksbi, shop@paytm)
  return /^[a-z0-9.\-_]{2,256}@[a-z][a-z0-9.\-]{1,63}$/i.test(vpa);
}

module.exports = { normalizeUpiId, isValidUpiId };

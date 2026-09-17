// Matching key only. The original phone string stays on the customer for display.
function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';

  // Common India formats seen in Cove checkouts. Do not invent other country rules.
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function displayPhone(value) {
  return String(value || '').trim().slice(0, 20);
}

module.exports = {
  normalizePhone,
  displayPhone,
};

const crypto = require('crypto');

const TOKEN_BYTES = 32;

function createConfirmationToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Same checkout key → same token, so a retried checkout finds the order it already created
 * instead of placing a second one. The key is random per checkout and only the shopper's
 * browser holds it; the server secret keeps the token unguessable from the key's shape.
 */
function confirmationTokenForCheckout(businessId, checkoutKey) {
  const { jwtSecret } = require('../config/env');
  return crypto
    .createHmac('sha256', jwtSecret)
    .update(`cove-checkout:${String(businessId)}:${checkoutKey}`, 'utf8')
    .digest('base64url');
}

function hashConfirmationToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function isConfirmationTokenShape(token) {
  if (typeof token !== 'string') return false;
  // 32 bytes → 43 base64url characters. Allow a small range for future length changes.
  if (token.length < 32 || token.length > 64) return false;
  return /^[A-Za-z0-9_-]+$/.test(token);
}

module.exports = {
  createConfirmationToken,
  confirmationTokenForCheckout,
  hashConfirmationToken,
  isConfirmationTokenShape,
};

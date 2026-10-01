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

function sealKey() {
  const { jwtSecret } = require('../config/env');
  return crypto.createHash('sha256').update(`cove-confirmation-seal:${jwtSecret}`, 'utf8').digest();
}

// Encrypted copy of the raw token so later order emails can repeat the same tracking link.
// Useless without the server secret; the hash stays the only lookup key.
function sealConfirmationToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sealKey(), iv);
  const data = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url')).join('.');
}

function openConfirmationToken(sealed) {
  try {
    const [iv, tag, data] = String(sealed || '').split('.').map((part) => Buffer.from(part, 'base64url'));
    if (!iv?.length || !tag?.length || !data?.length) return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', sealKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
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
  sealConfirmationToken,
  openConfirmationToken,
  isConfirmationTokenShape,
};

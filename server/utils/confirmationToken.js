const crypto = require('crypto');

const TOKEN_BYTES = 32;

function createConfirmationToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
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
  hashConfirmationToken,
  isConfirmationTokenShape,
};

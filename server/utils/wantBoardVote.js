const crypto = require('crypto');
const env = require('../config/env');

/**
 * Privacy-conscious vote fingerprint: salted hash of IP + User-Agent + want id.
 * Raw IP is never stored — only this hash is persisted for uniqueness.
 */
function buildVoterKeyHash(req, wantId) {
  const ip = String(req.ip || req.socket?.remoteAddress || '');
  const ua = String(req.get?.('user-agent') || '');
  const secret = env.jwtSecret;
  return crypto
    .createHash('sha256')
    .update(`${secret}|want-vote|${wantId}|${ip}|${ua}`, 'utf8')
    .digest('hex');
}

module.exports = { buildVoterKeyHash };

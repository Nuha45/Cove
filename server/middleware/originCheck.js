const env = require('../config/env');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

// CSRF defence for cookie-authenticated writes. Browsers always attach Origin (or at least
// Referer) to cross-site POST/PATCH/DELETE, so a foreign or opaque ("null") origin is refused.
// Requests without either header come from non-browser clients, which cannot ride a
// seller's cookie; Razorpay webhooks and cron jobs authenticate separately.
function requireTrustedOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const originHeader = req.get('origin');
  const refererHeader = req.get('referer');
  let origin = '';
  if (originHeader !== undefined) origin = originHeader === 'null' ? 'null' : originOf(originHeader);
  else if (refererHeader) origin = originOf(refererHeader) || 'null';

  if (!origin || env.clientOrigins.includes(origin)) {
    next();
    return;
  }

  res.status(403).json({ message: 'This request was blocked. Please reload Cove and try again.' });
}

module.exports = { requireTrustedOrigin };

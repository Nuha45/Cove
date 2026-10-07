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
// A write with neither header cannot come from a browser riding a seller's cookie: outside
// production it stays open for local tools and the test suite; in production it must prove it
// is a non-browser caller by presenting an Authorization header (the weekly-reports scheduler).
// Razorpay webhooks are mounted outside /api and never reach this middleware.
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

  if (origin && env.clientOrigins.includes(origin)) {
    next();
    return;
  }

  // Unauthenticated public storefront endpoints carry no session cookies or credentials.
  // In-app webviews (Instagram, TikTok, WhatsApp) or sandboxed iframes frequently omit
  // Origin/Referer or report an opaque "null" origin. Exempt these unauthenticated public writes
  // when Origin/Referer is missing or null, while maintaining strict checks for foreign origins
  // and full CSRF protection on authenticated cookie-bearing routes.
  const isPublicStoreWrite =
    (req.baseUrl === '/api' && req.path?.startsWith('/store/')) ||
    (typeof req.originalUrl === 'string' && req.originalUrl.startsWith('/api/store/'));

  if ((!origin || origin === 'null') && isPublicStoreWrite) {
    next();
    return;
  }

  // No Origin and no Referer. Browsers always send at least one on cross-site writes, so this
  // is a non-browser client. Production still requires proof (Authorization header present).
  if (!origin && (!env.isProduction || req.get('authorization'))) {
    next();
    return;
  }

  res.status(403).json({ message: 'This request was blocked. Please reload Cove and try again.' });
}

module.exports = { requireTrustedOrigin };

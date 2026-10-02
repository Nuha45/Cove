const ApiError = require('../utils/ApiError');

const EMAIL_UNVERIFIED_MESSAGE = 'Please verify your email address to continue.';
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Must run after protect. Unverified sellers can look around their dashboard but cannot change anything.
function requireVerifiedEmail(req, res, next) {
  if (READ_METHODS.has(req.method) || req.user?.isEmailVerified()) {
    return next();
  }
  return next(new ApiError(403, EMAIL_UNVERIFIED_MESSAGE, [
    { field: 'email', message: 'email_unverified' },
  ]));
}

module.exports = { requireVerifiedEmail, EMAIL_UNVERIFIED_MESSAGE };

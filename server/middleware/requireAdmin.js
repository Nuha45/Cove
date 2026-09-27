const ApiError = require('../utils/ApiError');

// Must run after `protect`, which reloads the user from MongoDB on every request,
// so revoking admin in the database takes effect immediately.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.isPlatformAdmin !== true) {
    next(new ApiError(403, 'You do not have access to this area.'));
    return;
  }
  next();
}

module.exports = { requireAdmin };

const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { COOKIE_NAME, verifyToken } = require('../services/tokenService');

// The browser sends the httpOnly cookie automatically.
// We trust the user row in MongoDB, not an id sent in the request body.
async function protect(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      throw new ApiError(401, 'Please log in to continue.');
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new ApiError(401, 'Please log in to continue.');
    }

    const user = await User.findById(payload.sub);
    if (!user || user.tokenVersion !== payload.tv) {
      throw new ApiError(401, 'Please log in to continue.');
    }

    if (String(user.businessId) !== String(payload.businessId)) {
      throw new ApiError(401, 'Please log in to continue.');
    }

    req.user = user;
    req.businessId = user.businessId;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { protect };

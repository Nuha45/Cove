const ApiError = require('../utils/ApiError');

function notFound(req, res, next) {
  next(new ApiError(404, 'We could not find that address.'));
}

module.exports = notFound;

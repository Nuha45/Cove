const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many attempts. Please wait a few minutes and try again.',
  },
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many changes. Please wait a few minutes and try again.',
  },
});

module.exports = authLimiter;
module.exports.writeLimiter = writeLimiter;

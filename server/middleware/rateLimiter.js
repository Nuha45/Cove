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

const publicOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many orders from this device. Please wait a few minutes and try again.',
  },
});

const publicWantLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many requests from this device. Please wait a few minutes and try again.',
  },
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many AI requests. Please wait a few minutes and try again.',
  },
});

module.exports = authLimiter;
module.exports.writeLimiter = writeLimiter;
module.exports.publicOrderLimiter = publicOrderLimiter;
module.exports.publicWantLimiter = publicWantLimiter;
module.exports.aiLimiter = aiLimiter;

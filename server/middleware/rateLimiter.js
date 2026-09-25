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

const publicWantBoardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many board lookups from this device. Please wait a few minutes and try again.',
  },
});

const publicWantVoteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many votes from this device. Please wait a few minutes and try again.',
  },
});

const publicConfirmationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many confirmation lookups from this device. Please wait a few minutes and try again.',
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

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many password reset requests. Please wait a few minutes and try again.',
  },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many password reset attempts. Please wait a few minutes and try again.',
  },
});

module.exports = authLimiter;
module.exports.writeLimiter = writeLimiter;
module.exports.publicOrderLimiter = publicOrderLimiter;
module.exports.publicWantLimiter = publicWantLimiter;
module.exports.publicWantBoardLimiter = publicWantBoardLimiter;
module.exports.publicWantVoteLimiter = publicWantVoteLimiter;
module.exports.publicConfirmationLimiter = publicConfirmationLimiter;
module.exports.aiLimiter = aiLimiter;
module.exports.forgotPasswordLimiter = forgotPasswordLimiter;
module.exports.resetPasswordLimiter = resetPasswordLimiter;

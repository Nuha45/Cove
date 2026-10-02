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

// Seller writes run after protect. Keying per shop keeps one busy shop from using up another's
// allowance when several sellers share an IP (office network, or a proxy in front of the API).
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `business:${req.businessId}`,
  message: {
    message: 'Too many changes. Please wait a few minutes and try again.',
  },
});

// CSV exports scan a whole date range. Runs after protect, so it is keyed per shop.
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `business:${req.businessId}`,
  message: {
    message: 'Too many exports. Please wait a few minutes and try again.',
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

const publicEventLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many requests from this device. Please wait a few minutes and try again.',
  },
});

const cronLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many job requests. Please wait a few minutes and try again.',
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

const verifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many verification attempts. Please wait a few minutes and try again.',
  },
});

// Runs after protect, so each account gets its own small allowance of verification emails.
const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user._id}`,
  message: {
    message: 'Too many verification emails requested. Please wait a while and try again.',
  },
});

module.exports = authLimiter;
module.exports.writeLimiter = writeLimiter;
module.exports.exportLimiter = exportLimiter;
module.exports.publicOrderLimiter = publicOrderLimiter;
module.exports.publicWantLimiter = publicWantLimiter;
module.exports.publicWantBoardLimiter = publicWantBoardLimiter;
module.exports.publicWantVoteLimiter = publicWantVoteLimiter;
module.exports.publicConfirmationLimiter = publicConfirmationLimiter;
module.exports.publicEventLimiter = publicEventLimiter;
module.exports.cronLimiter = cronLimiter;
module.exports.forgotPasswordLimiter = forgotPasswordLimiter;
module.exports.resetPasswordLimiter = resetPasswordLimiter;
module.exports.verifyEmailLimiter = verifyEmailLimiter;
module.exports.resendVerificationLimiter = resendVerificationLimiter;

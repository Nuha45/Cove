const express = require('express');
const authLimiter = require('../middleware/rateLimiter');
const {
  forgotPasswordLimiter,
  resetPasswordLimiter,
  verifyEmailLimiter,
  resendVerificationLimiter,
  changePasswordLimiter,
} = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const {
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  changePasswordRules,
  verifyEmailRules,
} = require('../validators/authValidator');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register', authLimiter, registerRules, validate, authController.register);
router.post('/login', authLimiter, loginRules, validate, authController.login);
router.post('/logout', authController.logout);
router.get('/me', protect, authController.me);
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  forgotPasswordRules,
  validate,
  authController.forgotPassword
);
router.post(
  '/reset-password',
  resetPasswordLimiter,
  resetPasswordRules,
  validate,
  authController.resetPassword
);
router.post(
  '/change-password',
  protect,
  changePasswordLimiter,
  changePasswordRules,
  validate,
  authController.changePassword
);
// POST, not GET, so link scanners that prefetch URLs in emails cannot use up the token.
router.post('/verify-email', verifyEmailLimiter, verifyEmailRules, validate, authController.verifyEmail);
router.post(
  '/resend-verification',
  protect,
  resendVerificationLimiter,
  authController.resendVerification
);

module.exports = router;

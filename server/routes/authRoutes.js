const express = require('express');
const authLimiter = require('../middleware/rateLimiter');
const {
  forgotPasswordLimiter,
  resetPasswordLimiter,
} = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const {
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
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

module.exports = router;

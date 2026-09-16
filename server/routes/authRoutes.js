const express = require('express');
const authLimiter = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { registerRules, loginRules } = require('../validators/authValidator');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register', authLimiter, registerRules, validate, authController.register);
router.post('/login', authLimiter, loginRules, validate, authController.login);
router.post('/logout', authController.logout);
router.get('/me', protect, authController.me);

module.exports = router;

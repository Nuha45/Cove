const express = require('express');
const { protect } = require('../middleware/auth');
const { requireVerifiedEmail } = require('../middleware/requireVerifiedEmail');
const { writeLimiter } = require('../middleware/rateLimiter');
const billingController = require('../controllers/billingController');

const router = express.Router();

router.use(protect, requireVerifiedEmail);
router.get('/', billingController.getBilling);
router.post('/subscription', writeLimiter, billingController.createSubscription);
router.post('/subscription/cancel', writeLimiter, billingController.cancelSubscription);

module.exports = router;

const express = require('express');
const { protect } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');
const billingController = require('../controllers/billingController');

const router = express.Router();

router.use(protect);
router.get('/', billingController.getBilling);
router.post('/subscription', writeLimiter, billingController.createSubscription);
router.post('/subscription/cancel', writeLimiter, billingController.cancelSubscription);

module.exports = router;

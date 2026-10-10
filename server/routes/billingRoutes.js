const express = require('express');
const { protect } = require('../middleware/auth');
const { requireVerifiedEmail } = require('../middleware/requireVerifiedEmail');
const { writeLimiter, billingInvoiceLimiter } = require('../middleware/rateLimiter');
const billingController = require('../controllers/billingController');

const router = express.Router();

router.use(protect, requireVerifiedEmail);
router.get('/', billingController.getBilling);
router.post('/subscription', writeLimiter, billingController.createSubscription);
router.post('/subscription/cancel', writeLimiter, billingController.cancelSubscription);
router.get('/receipts', billingController.listReceipts);
router.get('/receipts/:id/invoice', billingInvoiceLimiter, billingController.getReceiptInvoice);

module.exports = router;

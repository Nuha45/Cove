const express = require('express');
const webhookController = require('../controllers/webhookController');

const router = express.Router();

// Public: Razorpay calls this directly. No Cove seller auth.
router.post('/razorpay', webhookController.handleRazorpay);

module.exports = router;

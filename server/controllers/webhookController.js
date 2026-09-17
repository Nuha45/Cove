const asyncHandler = require('../utils/asyncHandler');
const webhookService = require('../services/webhookService');

const handleRazorpay = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const eventId = req.headers['x-razorpay-event-id'];
  const rawBody = req.body;

  const result = await webhookService.processRazorpayWebhook({
    rawBody,
    signature,
    eventIdHeader: eventId,
  });

  res.json({ received: true, ...result });
});

module.exports = { handleRazorpay };

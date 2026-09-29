const asyncHandler = require('../utils/asyncHandler');
const billingService = require('../services/billingService');

const getBilling = asyncHandler(async (req, res) => {
  const result = await billingService.getBilling(req.businessId);
  res.json(result);
});

const createSubscription = asyncHandler(async (req, res) => {
  // Only the plan key is read from the client. businessId, planId, amount, and status are ignored.
  const result = await billingService.startSubscriptionCheckout(req.businessId, {
    plan: typeof req.body?.plan === 'string' ? req.body.plan : undefined,
  });
  res.status(201).json(result);
});

const cancelSubscription = asyncHandler(async (req, res) => {
  const result = await billingService.cancelSubscription(req.businessId);
  res.json(result);
});

module.exports = {
  getBilling,
  createSubscription,
  cancelSubscription,
};

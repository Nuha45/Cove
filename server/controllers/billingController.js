const asyncHandler = require('../utils/asyncHandler');
const billingService = require('../services/billingService');

const getBilling = asyncHandler(async (req, res) => {
  const result = await billingService.getBilling(req.businessId);
  res.json(result);
});

const createSubscription = asyncHandler(async (req, res) => {
  // Ignore any client-supplied businessId, planId, amount, or status.
  const result = await billingService.startSubscriptionCheckout(req.businessId);
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

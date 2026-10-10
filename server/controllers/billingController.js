const asyncHandler = require('../utils/asyncHandler');
const billingService = require('../services/billingService');
const subscriptionReceiptService = require('../services/subscriptionReceiptService');

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

const listReceipts = asyncHandler(async (req, res) => {
  const result = await subscriptionReceiptService.listForBusiness(req.businessId, {
    page: req.query.page,
    limit: req.query.limit,
  });
  res.json(result);
});

// The hosted invoice URL opens without a login, so it is never cached along the way.
const getReceiptInvoice = asyncHandler(async (req, res) => {
  const url = await subscriptionReceiptService.invoiceUrlForReceipt(req.businessId, req.params.id);
  res.set('Cache-Control', 'no-store');
  res.json({ url });
});

module.exports = {
  getBilling,
  createSubscription,
  cancelSubscription,
  listReceipts,
  getReceiptInvoice,
};

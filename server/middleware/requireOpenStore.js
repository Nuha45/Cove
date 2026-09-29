const billingService = require('../services/billingService');

// Must run after protect. Blocks new orders while the shop is paused for billing.
async function requireOpenStore(req, res, next) {
  try {
    await billingService.assertStoreOpen(req.businessId, { audience: 'seller' });
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireOpenStore };

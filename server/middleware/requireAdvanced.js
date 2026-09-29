const ApiError = require('../utils/ApiError');
const billingService = require('../services/billingService');

const ADVANCED_REQUIRED_MESSAGE = 'This feature is part of Cove Plus. Upgrade in Billing to use it.';

// Must run after protect. Plan access is always read from the database for req.businessId.
async function requireAdvanced(req, res, next) {
  try {
    const access = await billingService.getPlanAccess(req.businessId);
    if (!access.advanced) {
      throw new ApiError(403, ADVANCED_REQUIRED_MESSAGE, [
        { field: 'plan', message: 'advanced_required' },
      ]);
    }
    req.planAccess = access;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAdvanced, ADVANCED_REQUIRED_MESSAGE };

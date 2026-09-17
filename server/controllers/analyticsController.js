const asyncHandler = require('../utils/asyncHandler');
const analyticsService = require('../services/analyticsService');

const getOverview = asyncHandler(async (req, res) => {
  // businessId always comes from the authenticated session.
  const analytics = await analyticsService.getOverview(req.businessId);
  res.json({ analytics });
});

module.exports = { getOverview };

const asyncHandler = require('../utils/asyncHandler');
const businessService = require('../services/businessService');

const getBusiness = asyncHandler(async (req, res) => {
  const business = await businessService.getOwnBusiness(req.businessId);
  res.json({ business: business.toPublic() });
});

module.exports = { getBusiness };

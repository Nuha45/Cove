const Business = require('../models/Business');
const ApiError = require('../utils/ApiError');

async function getOwnBusiness(businessId) {
  const business = await Business.findById(businessId);
  if (!business) {
    throw new ApiError(404, 'We could not find your business.');
  }
  return business;
}

module.exports = { getOwnBusiness };

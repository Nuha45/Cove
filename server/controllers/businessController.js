const asyncHandler = require('../utils/asyncHandler');
const businessService = require('../services/businessService');

const getBusiness = asyncHandler(async (req, res) => {
  const business = await businessService.getOwnBusiness(req.businessId);
  res.json({ business: business.toPublic() });
});

const getSettings = asyncHandler(async (req, res) => {
  const business = await businessService.getOwnBusiness(req.businessId);
  res.json({ business: business.toSettings() });
});

const updateSettings = asyncHandler(async (req, res) => {
  const input = {};
  const fields = [
    'name', 'slug', 'category', 'description', 'phone', 'email', 'city',
    'logo', 'currency', 'pickupEnabled', 'deliveryEnabled', 'deliveryFee', 'storefrontActive',
    'paymentQrEnabled', 'paymentLinkEnabled', 'paymentInstructionsEnabled', 'payOnPickupEnabled',
    'paymentLink', 'paymentQrImage', 'paymentUpiId', 'paymentInstructions',
    'emailNewOrders', 'emailPayments', 'emailCustomerWants',
  ];
  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      input[field] = req.body[field];
    }
  });

  // Never trust client businessId. Session businessId is the only source of truth.
  const business = await businessService.updateSettings(req.businessId, input);

  res.json({
    message: 'Settings saved.',
    business: business.toSettings(),
  });
});

module.exports = { getBusiness, getSettings, updateSettings };

const asyncHandler = require('../utils/asyncHandler');
const marketingService = require('../services/marketingService');
const { TONES } = require('../utils/marketingContent');

const getStatus = asyncHandler(async (req, res) => {
  const status = await marketingService.getStatus();
  res.json(status);
});

const generate = asyncHandler(async (req, res) => {
  const result = await marketingService.generate(req.businessId, {
    productId: req.body.productId,
    contentType: req.body.contentType,
    tone: req.body.tone || TONES[0],
  });
  res.json(result);
});

module.exports = {
  getStatus,
  generate,
};

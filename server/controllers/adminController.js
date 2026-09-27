const asyncHandler = require('../utils/asyncHandler');
const adminService = require('../services/adminService');

const getOverview = asyncHandler(async (req, res) => {
  const overview = await adminService.getOverview();
  res.json({ overview });
});

const listBusinesses = asyncHandler(async (req, res) => {
  const result = await adminService.listBusinesses({
    search: req.query.search,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.json(result);
});

const getBusiness = asyncHandler(async (req, res) => {
  const business = await adminService.getBusinessDetail(req.params.id);
  res.json({ business });
});

module.exports = { getOverview, listBusinesses, getBusiness };

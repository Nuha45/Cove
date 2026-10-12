const asyncHandler = require('../utils/asyncHandler');
const adminService = require('../services/adminService');

const getOverview = asyncHandler(async (req, res) => {
  const overview = await adminService.getOverview();
  res.json({ overview });
});

const listBusinesses = asyncHandler(async (req, res) => {
  const result = await adminService.listBusinesses({
    search: req.query.search,
    filter: req.query.filter,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.json(result);
});

const getBusiness = asyncHandler(async (req, res) => {
  const business = await adminService.getBusinessDetail(req.params.id, new Date(), req.user);
  res.json({ business });
});

const setOwnerPlatformAdmin = asyncHandler(async (req, res) => {
  const business = await adminService.setOwnerPlatformAdmin(req.params.id, req.user, {
    grant: req.body?.grant,
    confirmEmail: req.body?.confirmEmail,
  });
  res.json({ business });
});

const archiveBusiness = asyncHandler(async (req, res) => {
  const business = await adminService.archiveBusiness(req.params.id, req.user);
  res.json({ business });
});

const restoreBusiness = asyncHandler(async (req, res) => {
  const business = await adminService.restoreBusiness(req.params.id, req.user);
  res.json({ business });
});

const deleteBusiness = asyncHandler(async (req, res) => {
  const result = await adminService.deleteBusiness(req.params.id, req.user, {
    confirmSlug: req.body?.confirmSlug,
  });
  res.json(result);
});

module.exports = {
  getOverview,
  listBusinesses,
  getBusiness,
  archiveBusiness,
  restoreBusiness,
  deleteBusiness,
  setOwnerPlatformAdmin,
};

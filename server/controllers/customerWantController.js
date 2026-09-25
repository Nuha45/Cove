const asyncHandler = require('../utils/asyncHandler');
const customerWantService = require('../services/customerWantService');

const list = asyncHandler(async (req, res) => {
  const result = await customerWantService.list(req.businessId, {
    search: req.query.search,
    status: req.query.status,
    page: req.query.page,
    limit: req.query.limit,
  });

  res.json({
    wants: result.wants.map((want) => want.toPublic()),
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  });
});

const getOne = asyncHandler(async (req, res) => {
  const want = await customerWantService.getById(req.businessId, req.params.id);
  res.json({ want: want.toPublic() });
});

const update = asyncHandler(async (req, res) => {
  const input = {};
  if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
    input.status = req.body.status;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'sellerNotes')) {
    input.sellerNotes = req.body.sellerNotes;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'boardApproved')) {
    input.boardApproved = req.body.boardApproved;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'publicRequestText')) {
    input.publicRequestText = req.body.publicRequestText;
  }
  const want = await customerWantService.update(req.businessId, req.params.id, input);
  res.json({ want: want.toPublic() });
});

module.exports = {
  list,
  getOne,
  update,
};

const asyncHandler = require('../utils/asyncHandler');
const orderService = require('../services/orderService');

const list = asyncHandler(async (req, res) => {
  const result = await orderService.list(req.businessId, {
    search: req.query.search,
    status: req.query.status,
    paymentStatus: req.query.paymentStatus,
    page: req.query.page,
    limit: req.query.limit,
  });

  res.json({
    orders: result.orders.map((order) => order.toPublic()),
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
    summary: result.summary,
  });
});

const getOne = asyncHandler(async (req, res) => {
  const order = await orderService.getById(req.businessId, req.params.id);
  res.json({ order: order.toPublic() });
});

const create = asyncHandler(async (req, res) => {
  const customer = req.body.customer || {};
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const order = await orderService.create(req.businessId, {
    customer: {
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
    },
    items: items.map((item) => ({
      productId: item?.productId,
      quantity: item?.quantity,
    })),
    deliveryMethod: req.body.deliveryMethod,
    deliveryAddress: req.body.deliveryAddress,
    notes: req.body.notes,
    paymentMethod: req.body.paymentMethod,
  });
  res.status(201).json({ order: order.toPublic() });
});

const update = asyncHandler(async (req, res) => {
  const input = {};
  if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
    input.status = req.body.status;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'paymentStatus')) {
    input.paymentStatus = req.body.paymentStatus;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'paymentRejectionNote')) {
    input.paymentRejectionNote = req.body.paymentRejectionNote;
  }
  const order = await orderService.update(
    req.businessId,
    req.params.id,
    input,
    req.user?._id || null
  );
  res.json({ order: order.toPublic() });
});

module.exports = {
  list,
  getOne,
  create,
  update,
};

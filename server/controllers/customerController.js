const asyncHandler = require('../utils/asyncHandler');
const customerService = require('../services/customerService');

const list = asyncHandler(async (req, res) => {
  const result = await customerService.list(req.businessId, {
    search: req.query.search,
    page: req.query.page,
    limit: req.query.limit,
  });

  res.json({
    customers: result.customers.map((customer) => customer.toPublic()),
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  });
});

const getOne = asyncHandler(async (req, res) => {
  const customer = await customerService.getById(req.businessId, req.params.id);
  res.json({ customer: customer.toPublic() });
});

const update = asyncHandler(async (req, res) => {
  const input = {};
  ['name', 'phone', 'email', 'notes'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      input[field] = req.body[field];
    }
  });
  const customer = await customerService.update(req.businessId, req.params.id, input);
  res.json({ customer: customer.toPublic() });
});

const listOrders = asyncHandler(async (req, res) => {
  const result = await customerService.listOrders(req.businessId, req.params.id, {
    page: req.query.page,
    limit: req.query.limit,
  });

  res.json({
    orders: result.orders.map((order) => ({
      id: order._id.toString(),
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: order.total,
      deliveryMethod: order.deliveryMethod,
      createdAt: order.createdAt,
    })),
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  });
});

module.exports = {
  list,
  getOne,
  update,
  listOrders,
};

const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const productService = require('../services/productService');
const businessService = require('../services/businessService');
const { sendCsv } = require('../utils/csv');

function productInput(body, fields) {
  const input = {};
  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      input[field] = body[field];
    }
  });
  return input;
}

const list = asyncHandler(async (req, res) => {
  const result = await productService.list(req.businessId, {
    search: req.query.search,
    status: req.query.status,
    category: req.query.category,
    page: req.query.page,
    limit: req.query.limit,
  });

  res.json({
    products: result.products.map((product) => product.toPublic()),
    categories: result.categories,
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  });
});

const getOne = asyncHandler(async (req, res) => {
  const product = await productService.getById(req.businessId, req.params.id);
  res.json({ product: product.toPublic() });
});

const create = asyncHandler(async (req, res) => {
  const product = await productService.create(req.businessId, productInput(req.body, [
    'name',
    'description',
    'price',
    'stockQuantity',
    'category',
    'images',
    'status',
  ]));
  res.status(201).json({ product: product.toPublic() });
});

const update = asyncHandler(async (req, res) => {
  const product = await productService.update(
    req.businessId,
    req.params.id,
    productInput(req.body, [
      'name',
      'description',
      'price',
      'stockQuantity',
      'category',
      'images',
      'status',
    ])
  );
  res.json({ product: product.toPublic() });
});

const remove = asyncHandler(async (req, res) => {
  const product = await productService.archive(req.businessId, req.params.id);
  res.json({
    message: 'This product has been archived. It is hidden from your active list.',
    product: product.toPublic(),
  });
});

const bulkUpdate = asyncHandler(async (req, res) => {
  const result = await productService.bulkUpdate(req.businessId, {
    ids: req.body.ids,
    action: req.body.action,
    value: req.body.value,
  });
  res.json({
    message: result.matched === 1 ? '1 product updated.' : `${result.matched} products updated.`,
    ...result,
  });
});

const exportCsv = asyncHandler(async (req, res) => {
  const ids = typeof req.query.ids === 'string' && req.query.ids
    ? req.query.ids.split(',').filter((id) => mongoose.isValidObjectId(id)).slice(0, 500)
    : [];
  const products = await productService.listForExport(req.businessId, { ids });
  const date = new Date().toISOString().slice(0, 10);
  sendCsv(
    res,
    `cove-products-${date}.csv`,
    ['Name', 'Category', 'Price', 'Stock', 'Status', 'Created'],
    products.map((product) => [
      product.name,
      product.category || '',
      product.price,
      product.stockQuantity,
      product.status,
      product.createdAt ? new Date(product.createdAt).toISOString().slice(0, 10) : '',
    ])
  );
});

const inventory = asyncHandler(async (req, res) => {
  const business = await businessService.getOwnBusiness(req.businessId);
  const threshold = Number.isFinite(business.lowStockThreshold) ? business.lowStockThreshold : 5;
  res.json(await productService.inventory(req.businessId, threshold));
});

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
  bulkUpdate,
  exportCsv,
  inventory,
};

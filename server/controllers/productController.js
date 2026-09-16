const asyncHandler = require('../utils/asyncHandler');
const productService = require('../services/productService');

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

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
};

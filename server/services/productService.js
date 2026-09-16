const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const { saveImages, removeOwnedFile } = require('../utils/productImages');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function buildFilter(businessId, { search, status, category }) {
  const filter = { businessId };

  if (status && status !== 'all') {
    filter.status = status;
  } else if (!status) {
    filter.status = { $in: ['Active', 'Draft'] };
  }

  if (category) {
    filter.category = category;
  }

  if (search) {
    filter.name = new RegExp(escapeRegex(search), 'i');
  }

  return filter;
}

async function list(businessId, input) {
  const limit = Number(input.limit) || 12;
  let page = Number(input.page) || 1;
  const filter = buildFilter(businessId, input);
  const total = await Product.countDocuments(filter);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  if (totalPages > 0 && page > totalPages) page = totalPages;

  const products = await Product.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  const categories = await Product.distinct('category', {
    businessId,
    category: { $nin: ['', null] },
  });

  return {
    products,
    categories: categories.sort((a, b) => a.localeCompare(b)),
    page,
    limit,
    total,
    totalPages,
  };
}

async function getById(businessId, id) {
  const product = await Product.findOne({ _id: id, businessId });
  if (!product) {
    throw new ApiError(404, 'We could not find that product.');
  }
  return product;
}

async function create(businessId, input) {
  const images = await saveImages(businessId, input.images || []);
  try {
    return await Product.create({
      businessId,
      name: input.name,
      description: input.description || '',
      price: roundMoney(input.price),
      stockQuantity: Number(input.stockQuantity),
      category: input.category || '',
      images,
      status: input.status || 'Active',
    });
  } catch (err) {
    await Promise.all(images.map((image) => removeOwnedFile(businessId, image)));
    throw err;
  }
}

async function update(businessId, id, input) {
  const fields = Object.keys(input).filter((key) => input[key] !== undefined);
  if (!fields.length) {
    throw new ApiError(400, 'Please change something on the product.');
  }

  const product = await getById(businessId, id);
  if (input.name !== undefined) product.name = input.name;
  if (input.description !== undefined) product.description = input.description || '';
  if (input.price !== undefined) product.price = roundMoney(input.price);
  if (input.stockQuantity !== undefined) product.stockQuantity = Number(input.stockQuantity);
  if (input.category !== undefined) product.category = input.category || '';
  if (input.status !== undefined) product.status = input.status;
  if (input.images !== undefined) {
    product.images = await saveImages(businessId, input.images, product.images);
  }

  await product.save();
  return product;
}

// Archive instead of a hard delete so a later order can still refer to the product.
async function archive(businessId, id) {
  const product = await getById(businessId, id);
  if (product.status !== 'Archived') {
    product.status = 'Archived';
    await product.save();
  }
  return product;
}

module.exports = {
  list,
  getById,
  create,
  update,
  archive,
};

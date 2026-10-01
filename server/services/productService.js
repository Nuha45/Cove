const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const { saveImages, removeOwnedFile } = require('../utils/productImages');
const { createImageChanges } = require('../utils/imageUpload');

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
  const imageChanges = createImageChanges();
  if (input.images !== undefined) {
    product.images = await saveImages(businessId, input.images, product.images, imageChanges);
  }

  try {
    await product.save();
  } catch (err) {
    await imageChanges.rollback();
    throw err;
  }
  await imageChanges.commit();
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

const BULK_ACTIONS = ['setPrice', 'adjustPricePercent', 'setStock', 'adjustStock', 'setStatus', 'archive'];
const MAX_PRICE = 10000000;
const MAX_STOCK = 1000000;

// Every bulk update is scoped to { businessId } so foreign ids silently match nothing.
async function bulkUpdate(businessId, { ids, action, value }) {
  const uniqueIds = [...new Set((ids || []).map(String))];
  if (!uniqueIds.length) throw new ApiError(400, 'Select at least one product.');
  if (!BULK_ACTIONS.includes(action)) throw new ApiError(400, 'Choose a valid bulk action.');

  const filter = { _id: { $in: uniqueIds }, businessId, status: { $ne: 'Archived' } };
  const number = Number(value);
  let update;

  if (action === 'setPrice') {
    if (!Number.isFinite(number) || number < 0 || number > MAX_PRICE) {
      throw new ApiError(400, 'Enter a price between 0 and 1,00,00,000.');
    }
    update = { $set: { price: roundMoney(number) } };
  } else if (action === 'adjustPricePercent') {
    if (!Number.isFinite(number) || number < -90 || number > 500 || number === 0) {
      throw new ApiError(400, 'Enter a percentage between -90 and 500.');
    }
    const factor = 1 + number / 100;
    update = [{
      $set: {
        price: {
          $min: [MAX_PRICE, { $max: [0, { $round: [{ $multiply: ['$price', factor] }, 2] }] }],
        },
      },
    }];
  } else if (action === 'setStock') {
    if (!Number.isInteger(number) || number < 0 || number > MAX_STOCK) {
      throw new ApiError(400, 'Enter a whole stock number between 0 and 10,00,000.');
    }
    update = { $set: { stockQuantity: number } };
  } else if (action === 'adjustStock') {
    if (!Number.isInteger(number) || number === 0 || Math.abs(number) > MAX_STOCK) {
      throw new ApiError(400, 'Enter a whole number to add or remove, for example 5 or -3.');
    }
    update = [{
      $set: {
        stockQuantity: { $min: [MAX_STOCK, { $max: [0, { $add: ['$stockQuantity', number] }] }] },
      },
    }];
  } else if (action === 'setStatus') {
    if (!['Active', 'Draft'].includes(value)) {
      throw new ApiError(400, 'Choose Active or Draft.');
    }
    update = { $set: { status: value } };
  } else if (action === 'archive') {
    update = { $set: { status: 'Archived' } };
  }

  const result = await Product.updateMany(filter, update, { runValidators: true });
  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
  };
}

async function listForExport(businessId, { ids } = {}) {
  const filter = { businessId, status: { $in: ['Active', 'Draft'] } };
  if (Array.isArray(ids) && ids.length) filter._id = { $in: ids };
  return Product.find(filter)
    .sort({ createdAt: -1 })
    .limit(5000)
    .select('name category price stockQuantity status createdAt')
    .lean();
}

async function inventory(businessId, threshold) {
  const base = { businessId, status: { $in: ['Active', 'Draft'] } };
  const [outOfStock, lowStock, counts] = await Promise.all([
    Product.find({ ...base, stockQuantity: 0 })
      .sort({ updatedAt: -1 })
      .limit(20)
      .select('name stockQuantity status category'),
    Product.find({ ...base, stockQuantity: { $gt: 0, $lte: threshold } })
      .sort({ stockQuantity: 1, name: 1 })
      .limit(20)
      .select('name stockQuantity status category'),
    Product.aggregate([
      { $match: base },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          outOfStock: { $sum: { $cond: [{ $eq: ['$stockQuantity', 0] }, 1, 0] } },
          lowStock: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ['$stockQuantity', 0] }, { $lte: ['$stockQuantity', threshold] }] },
                1,
                0,
              ],
            },
          },
          units: { $sum: '$stockQuantity' },
        },
      },
    ]),
  ]);
  const summary = counts[0] || { total: 0, outOfStock: 0, lowStock: 0, units: 0 };
  const shape = (product) => ({
    id: product._id.toString(),
    name: product.name,
    stockQuantity: product.stockQuantity,
    status: product.status,
    category: product.category || '',
  });
  return {
    threshold,
    counts: {
      total: summary.total,
      outOfStock: summary.outOfStock,
      lowStock: summary.lowStock,
      units: summary.units,
    },
    outOfStock: outOfStock.map(shape),
    lowStock: lowStock.map(shape),
  };
}

module.exports = {
  list,
  getById,
  create,
  update,
  archive,
  bulkUpdate,
  listForExport,
  inventory,
  BULK_ACTIONS,
};

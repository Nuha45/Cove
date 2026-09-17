const Business = require('../models/Business');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const orderService = require('./orderService');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

async function getBusinessBySlug(slug) {
  const business = await Business.findOne({ slug: String(slug || '').toLowerCase().trim() });
  if (!business) {
    throw new ApiError(404, 'We could not find that shop.');
  }
  return business;
}

async function getStorefront(slug, { search, category } = {}) {
  const business = await getBusinessBySlug(slug);
  const filter = {
    businessId: business._id,
    status: 'Active',
  };

  if (category) {
    filter.category = category;
  }
  if (search) {
    filter.name = new RegExp(escapeRegex(search), 'i');
  }

  // Inactive shops still resolve so the public UI can show a closed state.
  const products = business.storefrontActive === false
    ? []
    : await Product.find(filter).sort({ createdAt: -1 }).limit(48);

  const categories = business.storefrontActive === false
    ? []
    : await Product.distinct('category', {
      businessId: business._id,
      status: 'Active',
      category: { $nin: ['', null] },
    });

  return {
    business,
    products,
    categories: categories.sort((a, b) => a.localeCompare(b)),
  };
}

async function getProduct(slug, productId) {
  const business = await getBusinessBySlug(slug);
  if (business.storefrontActive === false) {
    throw new ApiError(403, 'This shop is not accepting orders right now.');
  }
  const product = await Product.findOne({
    _id: productId,
    businessId: business._id,
    status: 'Active',
  });
  if (!product) {
    throw new ApiError(404, 'We could not find that product.');
  }
  return { business, product };
}

async function createOrder(slug, input) {
  const business = await getBusinessBySlug(slug);

  if (business.storefrontActive === false) {
    throw new ApiError(403, 'This shop is not accepting orders right now.');
  }

  const pickupEnabled = business.pickupEnabled !== false;
  const deliveryEnabled = business.deliveryEnabled !== false;

  if (!pickupEnabled && !deliveryEnabled) {
    throw new ApiError(403, 'This shop is not accepting orders right now.');
  }

  const method = input.deliveryMethod;
  if (method === 'Pickup' && !pickupEnabled) {
    throw new ApiError(400, 'Pickup is not available for this shop.', [
      { field: 'deliveryMethod', message: 'Pickup is not available for this shop.' },
    ]);
  }
  if (method === 'Delivery' && !deliveryEnabled) {
    throw new ApiError(400, 'Delivery is not available for this shop.', [
      { field: 'deliveryMethod', message: 'Delivery is not available for this shop.' },
    ]);
  }

  // Resolve the shop from the public slug. Ignore any businessId / fee from the browser.
  const deliveryFee = method === 'Delivery' ? roundMoney(business.deliveryFee || 0) : 0;

  const order = await orderService.create(business._id, {
    customer: {
      name: input.customer.name,
      phone: input.customer.phone,
      email: input.customer.email,
    },
    items: (input.items || []).map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
    deliveryMethod: method,
    deliveryAddress: input.deliveryAddress,
    deliveryFee,
    notes: input.notes,
  });

  return { business, order };
}

module.exports = {
  getStorefront,
  getProduct,
  createOrder,
};

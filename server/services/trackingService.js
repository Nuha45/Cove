const crypto = require('crypto');
const mongoose = require('mongoose');
const Business = require('../models/Business');
const Product = require('../models/Product');
const StoreEvent = require('../models/StoreEvent');
const env = require('../config/env');
const { COOKIE_NAME, verifyToken } = require('./tokenService');

// Repeat visits / views from the same browser inside this window count once.
const DEDUPE_WINDOW_MS = {
  visit: 30 * 60 * 1000,
  product_view: 30 * 60 * 1000,
  add_to_cart: 0,
};

const VISITOR_ID_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

function isVisitorId(value) {
  return typeof value === 'string' && VISITOR_ID_PATTERN.test(value);
}

function hashVisitor(businessId, visitorId) {
  return crypto
    .createHmac('sha256', env.jwtSecret)
    .update(`${businessId}:${visitorId}`)
    .digest('hex')
    .slice(0, 32);
}

// Sellers browsing their own storefront while logged in should not inflate their analytics.
function isOwnerRequest(req, businessId) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return false;
  try {
    const payload = verifyToken(token);
    return String(payload.businessId) === String(businessId);
  } catch {
    return false;
  }
}

async function recordEvent(req, slug, { type, productId, visitorId, quantity }) {
  if (!StoreEvent.EVENT_TYPES.includes(type) || !isVisitorId(visitorId)) {
    return { recorded: false, reason: 'invalid' };
  }

  const business = await Business.findOne({ slug: String(slug || '').toLowerCase().trim(), archivedAt: null })
    .select('_id storefrontActive')
    .lean();
  if (!business || business.storefrontActive === false) {
    return { recorded: false, reason: 'unavailable' };
  }
  if (await require('./billingService').isStorePaused(business._id)) {
    return { recorded: false, reason: 'unavailable' };
  }
  if (isOwnerRequest(req, business._id)) {
    return { recorded: false, reason: 'owner' };
  }

  let product = null;
  if (type !== 'visit') {
    if (!productId || !mongoose.isValidObjectId(productId)) {
      return { recorded: false, reason: 'invalid' };
    }
    product = await Product.findOne({ _id: productId, businessId: business._id, status: 'Active' })
      .select('_id category price')
      .lean();
    if (!product) return { recorded: false, reason: 'invalid' };
  }

  const visitorHash = hashVisitor(business._id, visitorId);
  const windowMs = DEDUPE_WINDOW_MS[type];
  if (windowMs) {
    const recent = await StoreEvent.exists({
      businessId: business._id,
      visitorHash,
      type,
      ...(product ? { productId: product._id } : {}),
      createdAt: { $gte: new Date(Date.now() - windowMs) },
    });
    if (recent) return { recorded: false, reason: 'duplicate' };
  }

  const qty = Number(quantity);
  await StoreEvent.create({
    businessId: business._id,
    type,
    productId: product?._id || null,
    category: product?.category || '',
    price: product ? Number(product.price) : null,
    quantity: type === 'add_to_cart' && Number.isInteger(qty) && qty >= 1 && qty <= 1000 ? qty : 1,
    visitorHash,
  });
  return { recorded: true };
}

module.exports = {
  recordEvent,
  isVisitorId,
  hashVisitor,
};

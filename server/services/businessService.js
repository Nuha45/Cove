const Business = require('../models/Business');
const ApiError = require('../utils/ApiError');
const { saveLogo } = require('../utils/businessLogo');

function asBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

async function getOwnBusiness(businessId) {
  const business = await Business.findById(businessId);
  if (!business) {
    throw new ApiError(404, 'We could not find your business.');
  }
  return business;
}

async function updateSettings(businessId, input) {
  const business = await getOwnBusiness(businessId);

  if (Object.prototype.hasOwnProperty.call(input, 'name')) {
    business.name = String(input.name || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(input, 'slug')) {
    const nextSlug = String(input.slug || '').toLowerCase().trim();
    if (nextSlug !== business.slug) {
      const taken = await Business.exists({ slug: nextSlug, _id: { $ne: business._id } });
      if (taken) {
        throw new ApiError(409, 'That storefront link is already taken.', [
          { field: 'slug', message: 'That storefront link is already taken.' },
        ]);
      }
      business.slug = nextSlug;
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, 'category')) {
    business.category = input.category;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'description')) {
    business.description = String(input.description || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(input, 'phone')) {
    business.phone = String(input.phone || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(input, 'email')) {
    business.email = String(input.email || '').trim().toLowerCase();
  }
  if (Object.prototype.hasOwnProperty.call(input, 'city')) {
    business.city = String(input.city || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(input, 'currency')) {
    business.currency = input.currency;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'pickupEnabled')) {
    business.pickupEnabled = asBoolean(input.pickupEnabled, business.pickupEnabled);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'deliveryEnabled')) {
    business.deliveryEnabled = asBoolean(input.deliveryEnabled, business.deliveryEnabled);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'deliveryFee')) {
    business.deliveryFee = Math.round(Number(input.deliveryFee) * 100) / 100;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'storefrontActive')) {
    business.storefrontActive = asBoolean(input.storefrontActive, business.storefrontActive);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'logo')) {
    business.logo = await saveLogo(businessId, input.logo, business.logo || '');
  }

  try {
    await business.save();
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.slug) {
      throw new ApiError(409, 'That storefront link is already taken.', [
        { field: 'slug', message: 'That storefront link is already taken.' },
      ]);
    }
    throw err;
  }

  return business;
}

module.exports = { getOwnBusiness, updateSettings };

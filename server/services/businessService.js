const Business = require('../models/Business');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');

const ADVANCED_SETTING_FIELDS = [
  'lowStockThreshold',
  'storefrontAnnouncement',
  'storefrontPromoTitle',
  'storefrontPromoText',
  'storefrontFeaturedProductIds',
  'storefrontFeaturedCategories',
];
const { saveLogo } = require('../utils/businessLogo');
const { savePaymentQr } = require('../utils/paymentQrImage');
const { saveStorefrontCover } = require('../utils/storefrontCover');
const { createImageChanges } = require('../utils/imageUpload');
const {
  normalizeTheme,
  normalizeAccent,
  normalizeBackground,
  normalizeCoverFocus,
  isPlusTheme,
  isPlusAccent,
} = require('../utils/storefrontAppearance');
const { isValidUpiId, normalizeUpiId } = require('../utils/upi');

// Theme and accent are shared fields: only the Cove Plus values need Cove Plus.
// Clearing the background back to the theme default is allowed on every plan.
function requestsPlusAppearance(input) {
  const has = (field) => Object.prototype.hasOwnProperty.call(input, field);
  return (has('storefrontTheme') && isPlusTheme(normalizeTheme(input.storefrontTheme)))
    || (has('storefrontAccent') && isPlusAccent(normalizeAccent(input.storefrontAccent)))
    || (has('storefrontBackground') && Boolean(normalizeBackground(input.storefrontBackground)));
}

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

// Old logo/cover/QR files are deleted only after the settings save; new uploads are removed if it fails.
async function updateSettings(businessId, input) {
  const imageChanges = createImageChanges();
  let business;
  try {
    business = await applySettings(businessId, input, imageChanges);
  } catch (err) {
    await imageChanges.rollback();
    throw err;
  }
  await imageChanges.commit();
  return business;
}

async function applySettings(businessId, input, imageChanges) {
  const business = await getOwnBusiness(businessId);

  if (requestsPlusAppearance(input)) {
    const billingService = require('./billingService');
    if (!(await billingService.hasAdvancedAccess(businessId))) {
      throw new ApiError(403, 'The Atelier and Luxe themes and the extra storefront colors are part of Cove Plus.', [
        { field: 'plan', message: 'advanced_required' },
      ]);
    }
  }

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
  if (Object.prototype.hasOwnProperty.call(input, 'storefrontTheme')) {
    business.storefrontTheme = normalizeTheme(input.storefrontTheme);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'storefrontAccent')) {
    business.storefrontAccent = normalizeAccent(input.storefrontAccent);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'storefrontBackground')) {
    business.storefrontBackground = normalizeBackground(input.storefrontBackground);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'storefrontCoverImage')) {
    business.storefrontCoverImage = await saveStorefrontCover(
      businessId,
      input.storefrontCoverImage,
      business.storefrontCoverImage || '',
      imageChanges
    );
    if (!business.storefrontCoverImage) {
      business.storefrontCoverFocusX = 50;
      business.storefrontCoverFocusY = 50;
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, 'storefrontCoverFocusX')) {
    business.storefrontCoverFocusX = normalizeCoverFocus(input.storefrontCoverFocusX);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'storefrontCoverFocusY')) {
    business.storefrontCoverFocusY = normalizeCoverFocus(input.storefrontCoverFocusY);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'paymentQrEnabled')) {
    business.paymentQrEnabled = asBoolean(input.paymentQrEnabled, business.paymentQrEnabled);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'paymentLinkEnabled')) {
    business.paymentLinkEnabled = asBoolean(input.paymentLinkEnabled, business.paymentLinkEnabled);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'paymentInstructionsEnabled')) {
    business.paymentInstructionsEnabled = asBoolean(
      input.paymentInstructionsEnabled,
      business.paymentInstructionsEnabled
    );
  }
  if (Object.prototype.hasOwnProperty.call(input, 'payOnPickupEnabled')) {
    business.payOnPickupEnabled = asBoolean(input.payOnPickupEnabled, business.payOnPickupEnabled);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'paymentLink')) {
    business.paymentLink = String(input.paymentLink || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(input, 'paymentUpiId')) {
    const nextUpi = normalizeUpiId(input.paymentUpiId);
    if (nextUpi && !isValidUpiId(nextUpi)) {
      throw new ApiError(400, 'Please check the form and try again.', [
        { field: 'paymentUpiId', message: 'Enter a valid UPI ID like name@oksbi or shop@paytm.' },
      ]);
    }
    business.paymentUpiId = nextUpi;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'paymentInstructions')) {
    business.paymentInstructions = String(input.paymentInstructions || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(input, 'emailNewOrders')) {
    business.emailNewOrders = asBoolean(input.emailNewOrders, business.emailNewOrders !== false);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'emailPayments')) {
    business.emailPayments = asBoolean(input.emailPayments, business.emailPayments !== false);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'emailCustomerWants')) {
    business.emailCustomerWants = asBoolean(
      input.emailCustomerWants,
      business.emailCustomerWants !== false
    );
  }
  ['emailLowStock', 'emailWeeklyReport', 'emailOrderConfirmation', 'emailOrderUpdates'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      business[field] = asBoolean(input[field], business[field] !== false);
    }
  });

  const advancedFields = ADVANCED_SETTING_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(input, field));
  if (advancedFields.length) {
    const billingService = require('./billingService');
    if (!(await billingService.hasAdvancedAccess(businessId))) {
      throw new ApiError(403, 'Storefront promotions and low stock levels are part of Cove Plus.', [
        { field: 'plan', message: 'advanced_required' },
      ]);
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, 'lowStockThreshold')) {
    business.lowStockThreshold = Math.max(0, Math.min(1000, Math.round(Number(input.lowStockThreshold) || 0)));
  }
  if (Object.prototype.hasOwnProperty.call(input, 'storefrontAnnouncement')) {
    business.storefrontAnnouncement = String(input.storefrontAnnouncement || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(input, 'storefrontPromoTitle')) {
    business.storefrontPromoTitle = String(input.storefrontPromoTitle || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(input, 'storefrontPromoText')) {
    business.storefrontPromoText = String(input.storefrontPromoText || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(input, 'storefrontFeaturedProductIds')) {
    const requested = [...new Set((input.storefrontFeaturedProductIds || []).map(String))].slice(0, 8);
    // Keep only products this business owns; order follows the seller's selection.
    const owned = requested.length
      ? await Product.find({ _id: { $in: requested }, businessId, status: { $ne: 'Archived' } }).select('_id').lean()
      : [];
    const ownedIds = new Set(owned.map((product) => String(product._id)));
    business.storefrontFeaturedProductIds = requested.filter((id) => ownedIds.has(id));
  }
  if (Object.prototype.hasOwnProperty.call(input, 'storefrontFeaturedCategories')) {
    business.storefrontFeaturedCategories = [
      ...new Set((input.storefrontFeaturedCategories || []).map((item) => String(item).trim()).filter(Boolean)),
    ].slice(0, 6);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'logo')) {
    business.logo = await saveLogo(businessId, input.logo, business.logo || '', imageChanges);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'paymentQrImage')) {
    business.paymentQrImage = await savePaymentQr(
      businessId,
      input.paymentQrImage,
      business.paymentQrImage || '',
      imageChanges
    );
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

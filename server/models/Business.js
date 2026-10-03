const mongoose = require('mongoose');
const { CATEGORY_MIN, CATEGORY_MAX, CATEGORY_PATTERN } = require('../utils/categories');
const { CURRENCIES } = require('../utils/currencies');
const { normalizeUpiId } = require('../utils/upi');
const {
  DELIVERY_ESTIMATES,
  DELIVERY_ESTIMATE_NOTE_MAX,
  deliveryEstimateFor,
} = require('../utils/deliveryEstimate');
const {
  STOREFRONT_THEMES,
  DEFAULT_STOREFRONT_THEME,
  DEFAULT_STOREFRONT_ACCENT,
  publicAppearance,
} = require('../utils/storefrontAppearance');

const businessSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      minlength: CATEGORY_MIN,
      maxlength: CATEGORY_MAX,
      match: CATEGORY_PATTERN,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120,
      default: '',
    },
    city: {
      type: String,
      trim: true,
      maxlength: 60,
      default: '',
    },
    logo: {
      type: String,
      trim: true,
      maxlength: 260,
      default: '',
    },
    currency: {
      type: String,
      enum: CURRENCIES,
      default: 'INR',
    },
    pickupEnabled: {
      type: Boolean,
      default: true,
    },
    deliveryEnabled: {
      type: Boolean,
      default: true,
    },
    deliveryFee: {
      type: Number,
      min: 0,
      max: 100000,
      default: 0,
    },
    storefrontActive: {
      type: Boolean,
      default: true,
    },
    // Curated storefront appearance. Advanced customization can extend these later.
    storefrontTheme: {
      type: String,
      enum: STOREFRONT_THEMES,
      default: DEFAULT_STOREFRONT_THEME,
    },
    storefrontAccent: {
      type: String,
      trim: true,
      maxlength: 7,
      default: DEFAULT_STOREFRONT_ACCENT,
    },
    // Cove Plus background preset. Empty means the theme's own background.
    storefrontBackground: {
      type: String,
      trim: true,
      maxlength: 7,
      default: '',
    },
    storefrontCoverImage: {
      type: String,
      trim: true,
      maxlength: 260,
      default: '',
    },
    // Focal point for cover crop (object-position). 0–100, default center.
    storefrontCoverFocusX: {
      type: Number,
      min: 0,
      max: 100,
      default: 50,
    },
    storefrontCoverFocusY: {
      type: Number,
      min: 0,
      max: 100,
      default: 50,
    },
    // Seller-controlled customer payment methods. Cove never collects these funds.
    paymentQrEnabled: {
      type: Boolean,
      default: false,
    },
    paymentLinkEnabled: {
      type: Boolean,
      default: false,
    },
    paymentInstructionsEnabled: {
      type: Boolean,
      default: false,
    },
    payOnPickupEnabled: {
      type: Boolean,
      default: true,
    },
    cashOnDeliveryEnabled: {
      type: Boolean,
      default: false,
    },
    deliveryEstimateEnabled: {
      type: Boolean,
      default: false,
    },
    deliveryEstimate: {
      type: String,
      enum: DELIVERY_ESTIMATES,
      default: '2_3_days',
    },
    deliveryEstimateNote: {
      type: String,
      trim: true,
      maxlength: DELIVERY_ESTIMATE_NOTE_MAX,
      default: '',
    },
    paymentLink: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    paymentQrImage: {
      type: String,
      trim: true,
      maxlength: 260,
      default: '',
    },
    // Seller UPI VPA used to build order-specific upi:// pay links (gateway-free).
    paymentUpiId: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 320,
      default: '',
    },
    paymentInstructions: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    emailNewOrders: {
      type: Boolean,
      default: true,
    },
    emailPayments: {
      type: Boolean,
      default: true,
    },
    emailCustomerWants: {
      type: Boolean,
      default: true,
    },
    // Low-stock and weekly report emails are sent only while the shop has Cove Plus.
    emailLowStock: {
      type: Boolean,
      default: true,
    },
    emailWeeklyReport: {
      type: Boolean,
      default: true,
    },
    // Customer-facing emails sent on the seller's behalf.
    emailOrderConfirmation: {
      type: Boolean,
      default: true,
    },
    emailOrderUpdates: {
      type: Boolean,
      default: true,
    },
    lowStockThreshold: {
      type: Number,
      min: 0,
      max: 1000,
      default: 5,
    },
    // Cove Plus storefront promotions. Kept on downgrade but hidden from the storefront.
    storefrontAnnouncement: {
      type: String,
      trim: true,
      maxlength: 140,
      default: '',
    },
    storefrontPromoTitle: {
      type: String,
      trim: true,
      maxlength: 60,
      default: '',
    },
    storefrontPromoText: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    storefrontFeaturedProductIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
      default: [],
      validate: {
        validator: (ids) => ids.length <= 8,
        message: 'You can feature up to 8 products.',
      },
    },
    storefrontFeaturedCategories: {
      type: [{ type: String, trim: true, maxlength: 40 }],
      default: [],
      validate: {
        validator: (items) => items.length <= 6,
        message: 'You can feature up to 6 categories.',
      },
    },
    // Set by a platform admin. Archived shops are hidden from the public and their owners cannot log in.
    archivedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

function notificationSettings(doc) {
  return {
    emailNewOrders: doc.emailNewOrders !== false,
    emailPayments: doc.emailPayments !== false,
    emailCustomerWants: doc.emailCustomerWants !== false,
    emailLowStock: doc.emailLowStock !== false,
    emailWeeklyReport: doc.emailWeeklyReport !== false,
    emailOrderConfirmation: doc.emailOrderConfirmation !== false,
    emailOrderUpdates: doc.emailOrderUpdates !== false,
    lowStockThreshold: Number.isFinite(doc.lowStockThreshold) ? doc.lowStockThreshold : 5,
  };
}

function promotionSettings(doc) {
  return {
    storefrontAnnouncement: doc.storefrontAnnouncement || '',
    storefrontPromoTitle: doc.storefrontPromoTitle || '',
    storefrontPromoText: doc.storefrontPromoText || '',
    storefrontFeaturedProductIds: (doc.storefrontFeaturedProductIds || []).map((id) => id.toString()),
    storefrontFeaturedCategories: (doc.storefrontFeaturedCategories || []).slice(),
  };
}

function paymentSettings(doc) {
  return {
    paymentQrEnabled: Boolean(doc.paymentQrEnabled),
    paymentLinkEnabled: Boolean(doc.paymentLinkEnabled),
    paymentInstructionsEnabled: Boolean(doc.paymentInstructionsEnabled),
    payOnPickupEnabled: doc.payOnPickupEnabled !== false,
    cashOnDeliveryEnabled: Boolean(doc.cashOnDeliveryEnabled),
    paymentLink: doc.paymentLink || '',
    paymentQrImage: doc.paymentQrImage || '',
    paymentUpiId: normalizeUpiId(doc.paymentUpiId),
    paymentInstructions: doc.paymentInstructions || '',
    ...notificationSettings(doc),
  };
}

// Only enable methods that are turned on and have the required content.
function publicPayments(doc) {
  const upiId = normalizeUpiId(doc.paymentUpiId);
  const hasUpi = Boolean(upiId);
  const hasQrImage = Boolean(doc.paymentQrImage);
  // QR / UPI method: uploaded static QR and/or UPI ID for order-specific intents.
  const qrEnabled = Boolean(doc.paymentQrEnabled) && (hasUpi || hasQrImage);
  const linkEnabled = Boolean(doc.paymentLinkEnabled) && Boolean(doc.paymentLink);
  const instructionsEnabled = Boolean(doc.paymentInstructionsEnabled)
    && Boolean(String(doc.paymentInstructions || '').trim());
  const payOnPickupEnabled = doc.payOnPickupEnabled !== false;
  const cashOnDeliveryEnabled = Boolean(doc.cashOnDeliveryEnabled);

  return {
    qrEnabled,
    linkEnabled,
    instructionsEnabled,
    payOnPickupEnabled,
    cashOnDeliveryEnabled,
    paymentLink: linkEnabled ? doc.paymentLink : '',
    paymentQrImage: qrEnabled && hasQrImage ? doc.paymentQrImage : '',
    upiId: qrEnabled && hasUpi ? upiId : '',
    paymentInstructions: instructionsEnabled ? String(doc.paymentInstructions || '').trim() : '',
    hasConfiguredMethod: qrEnabled || linkEnabled || instructionsEnabled || payOnPickupEnabled
      || cashOnDeliveryEnabled,
  };
}

// Seller's own view: saved values as chosen, including Cove Plus choices kept after a downgrade.
businessSchema.methods.toPublic = function toPublic() {
  const appearance = publicAppearance(this, { plus: true });
  return {
    id: this._id.toString(),
    name: this.name,
    slug: this.slug,
    category: this.category,
    description: this.description || '',
    phone: this.phone || '',
    email: this.email || '',
    city: this.city || '',
    logo: this.logo || '',
    currency: this.currency || 'INR',
    pickupEnabled: this.pickupEnabled !== false,
    deliveryEnabled: this.deliveryEnabled !== false,
    deliveryFee: Number(this.deliveryFee) || 0,
    deliveryEstimateEnabled: Boolean(this.deliveryEstimateEnabled),
    deliveryEstimate: this.deliveryEstimate || '2_3_days',
    deliveryEstimateNote: this.deliveryEstimateNote || '',
    storefrontActive: this.storefrontActive !== false,
    storefrontTheme: appearance.theme,
    storefrontAccent: appearance.accent,
    storefrontBackground: appearance.background,
    storefrontCoverImage: appearance.coverImage,
    storefrontCoverFocusX: appearance.coverFocusX,
    storefrontCoverFocusY: appearance.coverFocusY,
    appearance,
    ...paymentSettings(this),
    ...promotionSettings(this),
  };
};

businessSchema.methods.toSettings = function toSettings() {
  return this.toPublic();
};

// Public shop page. Never include Mongo ids or owner details.
// Promotions and Cove Plus appearance are only included when the caller confirmed the shop has Cove Plus.
businessSchema.methods.toStorefront = function toStorefront({ promotions = null, plus = false } = {}) {
  return {
    name: this.name,
    slug: this.slug,
    category: this.category,
    description: this.description || '',
    phone: this.phone || '',
    email: this.email || '',
    city: this.city || '',
    logo: this.logo || '',
    currency: this.currency || 'INR',
    pickupEnabled: this.pickupEnabled !== false,
    deliveryEnabled: this.deliveryEnabled !== false,
    deliveryFee: Number(this.deliveryFee) || 0,
    deliveryEstimate: deliveryEstimateFor(this),
    storefrontActive: this.storefrontActive !== false,
    appearance: publicAppearance(this, { plus }),
    payments: publicPayments(this),
    promotions,
  };
};

// Billing-paused shop: branding only. No contact, payment, product or billing details.
businessSchema.methods.toPausedStorefront = function toPausedStorefront() {
  return {
    name: this.name,
    slug: this.slug,
    logo: this.logo || '',
    storefrontActive: false,
    paused: true,
    appearance: publicAppearance(this),
  };
};

// A paused shop keeps showing existing orders but no longer offers payment options.
businessSchema.methods.toConfirmation = function toConfirmation({ paused = false } = {}) {
  return {
    name: this.name,
    slug: this.slug,
    currency: this.currency || 'INR',
    phone: this.phone || '',
    paused,
    payments: paused ? publicPayments({ payOnPickupEnabled: false }) : publicPayments(this),
  };
};

module.exports = mongoose.model('Business', businessSchema);

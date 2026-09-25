const mongoose = require('mongoose');
const { CATEGORIES } = require('../utils/categories');
const { CURRENCIES } = require('../utils/currencies');
const { normalizeUpiId } = require('../utils/upi');
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
      enum: CATEGORIES,
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
    storefrontCoverImage: {
      type: String,
      trim: true,
      maxlength: 260,
      default: '',
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
  },
  { timestamps: true }
);

function paymentSettings(doc) {
  return {
    paymentQrEnabled: Boolean(doc.paymentQrEnabled),
    paymentLinkEnabled: Boolean(doc.paymentLinkEnabled),
    paymentInstructionsEnabled: Boolean(doc.paymentInstructionsEnabled),
    payOnPickupEnabled: doc.payOnPickupEnabled !== false,
    paymentLink: doc.paymentLink || '',
    paymentQrImage: doc.paymentQrImage || '',
    paymentUpiId: normalizeUpiId(doc.paymentUpiId),
    paymentInstructions: doc.paymentInstructions || '',
    emailNewOrders: doc.emailNewOrders !== false,
    emailPayments: doc.emailPayments !== false,
    emailCustomerWants: doc.emailCustomerWants !== false,
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

  return {
    qrEnabled,
    linkEnabled,
    instructionsEnabled,
    payOnPickupEnabled,
    paymentLink: linkEnabled ? doc.paymentLink : '',
    paymentQrImage: qrEnabled && hasQrImage ? doc.paymentQrImage : '',
    upiId: qrEnabled && hasUpi ? upiId : '',
    paymentInstructions: instructionsEnabled ? String(doc.paymentInstructions || '').trim() : '',
    hasConfiguredMethod: qrEnabled || linkEnabled || instructionsEnabled || payOnPickupEnabled,
  };
}

businessSchema.methods.toPublic = function toPublic() {
  const appearance = publicAppearance(this);
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
    storefrontActive: this.storefrontActive !== false,
    storefrontTheme: appearance.theme,
    storefrontAccent: appearance.accent,
    storefrontCoverImage: appearance.coverImage,
    appearance,
    ...paymentSettings(this),
  };
};

businessSchema.methods.toSettings = function toSettings() {
  return this.toPublic();
};

// Public shop page. Never include Mongo ids or owner details.
businessSchema.methods.toStorefront = function toStorefront() {
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
    storefrontActive: this.storefrontActive !== false,
    appearance: publicAppearance(this),
    payments: publicPayments(this),
  };
};

businessSchema.methods.toConfirmation = function toConfirmation() {
  return {
    name: this.name,
    slug: this.slug,
    currency: this.currency || 'INR',
    phone: this.phone || '',
    payments: publicPayments(this),
  };
};

module.exports = mongoose.model('Business', businessSchema);

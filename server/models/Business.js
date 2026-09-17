const mongoose = require('mongoose');
const { CATEGORIES } = require('../utils/categories');
const { CURRENCIES } = require('../utils/currencies');

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
  },
  { timestamps: true }
);

businessSchema.methods.toPublic = function toPublic() {
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
  };
};

// Seller settings editor. Same safe fields as toPublic for now.
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
  };
};

module.exports = mongoose.model('Business', businessSchema);

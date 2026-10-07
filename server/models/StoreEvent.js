const mongoose = require('mongoose');

const EVENT_TYPES = ['visit', 'product_view', 'add_to_cart'];
const RETENTION_DAYS = 400;

// Anonymous storefront interaction. No names, emails, phones, IPs, or user agents are stored.
// visitorHash is a per-shop hash of a random browser id, so visitors cannot be linked across shops.
const storeEventSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
    },
    type: {
      type: String,
      enum: EVENT_TYPES,
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    // Snapshots let category and price-range insights survive later product edits.
    category: {
      type: String,
      trim: true,
      maxlength: 40,
      default: '',
    },
    price: {
      type: Number,
      min: 0,
      default: null,
    },
    quantity: {
      type: Number,
      min: 1,
      max: 1000,
      default: 1,
    },
    visitorHash: {
      type: String,
      required: true,
      maxlength: 32,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

storeEventSchema.index({ businessId: 1, createdAt: -1 });
storeEventSchema.index({ businessId: 1, type: 1, createdAt: -1 });
storeEventSchema.index({ businessId: 1, productId: 1, type: 1, createdAt: -1 });
storeEventSchema.index({ businessId: 1, visitorHash: 1, type: 1, createdAt: -1 });
storeEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });

module.exports = mongoose.model('StoreEvent', storeEventSchema);
module.exports.EVENT_TYPES = EVENT_TYPES;
module.exports.RETENTION_DAYS = RETENTION_DAYS;

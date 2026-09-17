const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    // Always set from the business that owns the order, never from the request.
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
      default: '',
    },
    // Digits-only key for matching within one business.
    phoneNormalized: {
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
    // Seller-only. Never return this from public storefront APIs.
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    totalOrders: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalSpent: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    lastOrderAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Same phone can exist in two businesses. Empty phones are not unique-matched.
customerSchema.index(
  { businessId: 1, phoneNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: { phoneNormalized: { $type: 'string', $gt: '' } },
  }
);
customerSchema.index({ businessId: 1, lastOrderAt: -1, createdAt: -1 });
customerSchema.index({ businessId: 1, name: 1 });

customerSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    phone: this.phone || '',
    email: this.email || '',
    notes: this.notes || '',
    totalOrders: this.totalOrders,
    totalSpent: this.totalSpent,
    lastOrderAt: this.lastOrderAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('Customer', customerSchema);

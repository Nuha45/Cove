const mongoose = require('mongoose');
const { STATUSES } = require('../utils/customerWantStatus');

const customerWantSchema = new mongoose.Schema(
  {
    // Always set from slug → business, never from the request body.
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
    },
    // Optional. Set only when phone matches an existing Customer for this business.
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
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
      required: true,
      trim: true,
      maxlength: 20,
    },
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
    request: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 500,
    },
    quantity: {
      type: Number,
      min: 1,
      max: 100000,
      default: null,
    },
    // Optional note from the customer when submitting the request.
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    // Seller-only. Never return from public storefront APIs.
    sellerNotes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'New',
    },
  },
  { timestamps: true }
);

customerWantSchema.index({ businessId: 1, createdAt: -1 });
customerWantSchema.index({ businessId: 1, status: 1, createdAt: -1 });
customerWantSchema.index({ businessId: 1, phoneNormalized: 1 });

customerWantSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    customerId: this.customerId ? this.customerId.toString() : null,
    name: this.name,
    phone: this.phone || '',
    email: this.email || '',
    request: this.request,
    quantity: this.quantity,
    notes: this.notes || '',
    sellerNotes: this.sellerNotes || '',
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('CustomerWant', customerWantSchema);

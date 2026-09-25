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
    // Explicit customer opt-in for anonymous board sharing. Never default true.
    shareOnBoardOptIn: {
      type: Boolean,
      default: false,
    },
    // Seller-controlled board visibility — independent of workflow status.
    boardApproved: {
      type: Boolean,
      default: false,
    },
    // Public-facing text when on the board. Seller may edit; defaults to request on approve.
    publicRequestText: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    voteCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    boardPublishedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

customerWantSchema.index({ businessId: 1, createdAt: -1 });
customerWantSchema.index({ businessId: 1, status: 1, createdAt: -1 });
customerWantSchema.index({ businessId: 1, phoneNormalized: 1 });
customerWantSchema.index({ businessId: 1, boardApproved: 1, voteCount: -1, boardPublishedAt: -1 });

// Seller dashboard serializer. Includes private contact fields — never use on public board APIs.
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
    shareOnBoardOptIn: Boolean(this.shareOnBoardOptIn),
    boardApproved: Boolean(this.boardApproved),
    publicRequestText: this.publicRequestText || '',
    voteCount: Number(this.voteCount) || 0,
    boardPublishedAt: this.boardPublishedAt || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// Public request board only. No names, phones, emails, notes, or customer ids.
customerWantSchema.methods.toBoardPublic = function toBoardPublic() {
  const text = String(this.publicRequestText || this.request || '').trim();
  return {
    id: this._id.toString(),
    text,
    voteCount: Number(this.voteCount) || 0,
    status: this.status,
    publishedAt: this.boardPublishedAt || this.createdAt,
  };
};

module.exports = mongoose.model('CustomerWant', customerWantSchema);

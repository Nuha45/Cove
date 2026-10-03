const mongoose = require('mongoose');
const { STATUSES, PAYMENT_STATUSES, DELIVERY_METHODS } = require('../utils/orderStatus');
const { PAYMENT_METHODS } = require('../utils/paymentMethods');
const { publicOrderEstimate } = require('../utils/deliveryEstimate');

const itemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Price the customer was charged. Not a live link to Product.price.
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 1000,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const customerSchema = new mongoose.Schema(
  {
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
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120,
      default: '',
    },
  },
  { _id: false }
);

const paymentEventSchema = new mongoose.Schema(
  {
    at: {
      type: Date,
      required: true,
      default: Date.now,
    },
    fromStatus: {
      type: String,
      required: true,
    },
    toStatus: {
      type: String,
      required: true,
    },
    actorType: {
      type: String,
      enum: ['system', 'customer', 'seller'],
      required: true,
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    // Always set from the logged-in user's business, never from the request.
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
    },
    orderNumber: {
      type: String,
      required: true,
      trim: true,
    },
    customer: {
      type: customerSchema,
      required: true,
    },
    items: {
      type: [itemSchema],
      required: true,
      validate: {
        validator: (items) => items.length >= 1 && items.length <= 30,
        message: 'An order needs between 1 and 30 products.',
      },
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    deliveryFee: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'Payment Pending',
    },
    paymentMethod: {
      type: String,
      enum: ['', ...PAYMENT_METHODS],
      default: '',
    },
    paymentReference: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    paymentReferenceSubmittedAt: {
      type: Date,
      default: null,
    },
    paymentVerifiedAt: {
      type: Date,
      default: null,
    },
    paymentVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    paymentRejectionNote: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
    paymentEvents: {
      type: [paymentEventSchema],
      default: [],
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'New',
    },
    deliveryMethod: {
      type: String,
      enum: DELIVERY_METHODS,
      required: true,
    },
    deliveryAddress: {
      type: String,
      trim: true,
      maxlength: 400,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    // Copy of the seller's estimate shown at checkout, so later setting changes do not rewrite old orders.
    deliveryEstimate: {
      text: { type: String, trim: true, maxlength: 160, default: '' },
      note: { type: String, trim: true, maxlength: 160, default: '' },
    },
    // Links to Customers. Optional so Phase 3 orders created before Phase 5 still load.
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    // Set once, in the same transaction that puts stock back.
    stockRestored: {
      type: Boolean,
      default: false,
    },
    // SHA-256 of the one-time public confirmation token. Raw token is never stored.
    // Only public storefront orders set this; seller-created orders leave it unset.
    confirmationTokenHash: {
      type: String,
      select: false,
      default: undefined,
    },
    // AES-GCM sealed raw token (see utils/confirmationToken) for tracking links in later emails.
    confirmationTokenSealed: {
      type: String,
      select: false,
      default: undefined,
    },
  },
  { timestamps: true }
);

orderSchema.index({ businessId: 1, orderNumber: 1 }, { unique: true });
orderSchema.index({ businessId: 1, createdAt: -1 });
orderSchema.index({ businessId: 1, status: 1, createdAt: -1 });
orderSchema.index({ businessId: 1, paymentStatus: 1, createdAt: -1 });
orderSchema.index({ businessId: 1, customerId: 1, createdAt: -1 });
orderSchema.index(
  { confirmationTokenHash: 1 },
  { unique: true, sparse: true }
);

function paymentPublicFields(doc) {
  return {
    paymentStatus: doc.paymentStatus,
    paymentMethod: doc.paymentMethod || '',
    paymentReference: doc.paymentReference || '',
    paymentReferenceSubmittedAt: doc.paymentReferenceSubmittedAt || null,
    paymentVerifiedAt: doc.paymentVerifiedAt || null,
    paymentVerifiedBy: doc.paymentVerifiedBy ? doc.paymentVerifiedBy.toString() : null,
    paymentRejectionNote: doc.paymentRejectionNote || '',
    paymentEvents: (doc.paymentEvents || []).map((event) => ({
      at: event.at,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actorType: event.actorType,
      actorUserId: event.actorUserId ? event.actorUserId.toString() : null,
      note: event.note || '',
    })),
  };
}

orderSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    orderNumber: this.orderNumber,
    customerId: this.customerId ? this.customerId.toString() : null,
    customer: {
      name: this.customer.name,
      phone: this.customer.phone || '',
      email: this.customer.email || '',
    },
    items: this.items.map((item) => ({
      productId: item.productId.toString(),
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
    subtotal: this.subtotal,
    deliveryFee: this.deliveryFee,
    total: this.total,
    ...paymentPublicFields(this),
    status: this.status,
    deliveryMethod: this.deliveryMethod,
    deliveryAddress: this.deliveryAddress || '',
    deliveryEstimate: publicOrderEstimate(this),
    notes: this.notes || '',
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// Guest confirmation. No Mongo ids and no seller-only verification actor ids.
orderSchema.methods.toCustomerConfirmation = function toCustomerConfirmation() {
  return {
    orderNumber: this.orderNumber,
    customer: {
      name: this.customer.name,
    },
    items: this.items.map((item) => ({
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
    subtotal: this.subtotal,
    deliveryFee: this.deliveryFee,
    total: this.total,
    paymentStatus: this.paymentStatus,
    paymentMethod: this.paymentMethod || '',
    paymentReference: this.paymentReference || '',
    paymentReferenceSubmittedAt: this.paymentReferenceSubmittedAt || null,
    paymentVerifiedAt: this.paymentVerifiedAt || null,
    status: this.status,
    deliveryMethod: this.deliveryMethod,
    deliveryAddress: this.deliveryAddress || '',
    deliveryEstimate: publicOrderEstimate(this),
    notes: this.notes || '',
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('Order', orderSchema);

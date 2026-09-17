const mongoose = require('mongoose');
const { STATUSES, PAYMENT_STATUSES, DELIVERY_METHODS } = require('../utils/orderStatus');

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
      default: 'Pending',
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
      maxlength: 200,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    // Set once, in the same transaction that puts stock back.
    stockRestored: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

orderSchema.index({ businessId: 1, orderNumber: 1 }, { unique: true });
orderSchema.index({ businessId: 1, createdAt: -1 });
orderSchema.index({ businessId: 1, status: 1, createdAt: -1 });
orderSchema.index({ businessId: 1, paymentStatus: 1, createdAt: -1 });

orderSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    orderNumber: this.orderNumber,
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
    paymentStatus: this.paymentStatus,
    status: this.status,
    deliveryMethod: this.deliveryMethod,
    deliveryAddress: this.deliveryAddress || '',
    notes: this.notes || '',
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('Order', orderSchema);

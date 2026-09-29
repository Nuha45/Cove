const mongoose = require('mongoose');

const lineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// Snapshot of an order at the time it was invoiced. Payment/order status is read live from the order.
// Tax and discount lines are intentionally absent: Cove orders do not record either.
const invoiceSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
    },
    orderNumber: {
      type: String,
      required: true,
      trim: true,
    },
    issuedAt: {
      type: Date,
      required: true,
    },
    orderDate: {
      type: Date,
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    seller: {
      name: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      city: { type: String, default: '' },
    },
    customer: {
      name: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
    deliveryMethod: {
      type: String,
      default: '',
    },
    deliveryAddress: {
      type: String,
      default: '',
    },
    items: {
      type: [lineSchema],
      default: [],
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    deliveryFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

invoiceSchema.index({ businessId: 1, orderId: 1 }, { unique: true });
invoiceSchema.index({ businessId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ businessId: 1, issuedAt: -1 });

invoiceSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    orderId: this.orderId.toString(),
    invoiceNumber: this.invoiceNumber,
    orderNumber: this.orderNumber,
    issuedAt: this.issuedAt,
    orderDate: this.orderDate,
    currency: this.currency || 'INR',
    customer: {
      name: this.customer?.name || '',
    },
    total: this.total,
  };
};

module.exports = mongoose.model('Invoice', invoiceSchema);

const mongoose = require('mongoose');
const { PLAN_KEYS } = require('../utils/covePlan');

// A seller's Cove subscription payment that Razorpay reported as captured. One per Razorpay payment.
const subscriptionReceiptSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      required: true,
    },
    providerSubscriptionId: {
      type: String,
      trim: true,
      required: true,
    },
    providerPaymentId: {
      type: String,
      trim: true,
      required: true,
    },
    // Razorpay's own invoice for this payment (inv_...). Sellers view that invoice; Cove issues no second one.
    providerInvoiceId: {
      type: String,
      trim: true,
      default: '',
    },
    // When the seller last asked Razorpay for an invoice this receipt has no id for. Spaces out repeat lookups.
    invoiceLookupAt: {
      type: Date,
      default: null,
    },
    // Cove-wide sequence (CR-000001), separate from each shop's order and invoice numbers.
    receiptNumber: {
      type: String,
      trim: true,
      required: true,
    },
    plan: {
      type: String,
      enum: PLAN_KEYS,
      required: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'amountPaise must be a whole number of paise.' },
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
    },
    paidAt: {
      type: Date,
      required: true,
    },
    periodStartAt: {
      type: Date,
      default: null,
    },
    periodEndAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

subscriptionReceiptSchema.index({ providerPaymentId: 1 }, { unique: true });
subscriptionReceiptSchema.index({ receiptNumber: 1 }, { unique: true });
subscriptionReceiptSchema.index({ businessId: 1, paidAt: -1 });

module.exports = mongoose.model('SubscriptionReceipt', subscriptionReceiptSchema);

const mongoose = require('mongoose');

const TYPES = [
  'NEW_ORDER',
  'PAYMENT_SUBMITTED',
  'CUSTOMER_WANT',
  'ORDER_STATUS_UPDATE',
  'PAYMENT_VERIFIED',
  'LOW_STOCK',
];

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: TYPES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 400,
    },
    relatedEntityType: {
      type: String,
      enum: ['order', 'customerWant', 'product', ''],
      default: '',
    },
    relatedEntityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // Soft dedupe key for retries (type + entity).
    dedupeKey: {
      type: String,
      default: '',
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ businessId: 1, userId: 1, createdAt: -1 });
notificationSchema.index(
  { businessId: 1, dedupeKey: 1 },
  { unique: true, sparse: true, partialFilterExpression: { dedupeKey: { $type: 'string', $gt: '' } } }
);

notificationSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    type: this.type,
    title: this.title,
    message: this.message,
    relatedEntityType: this.relatedEntityType || '',
    relatedEntityId: this.relatedEntityId ? this.relatedEntityId.toString() : null,
    isRead: Boolean(this.isRead),
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = TYPES;

const mongoose = require('mongoose');

// One row per logical email (for example WEEKLY_REPORT:<week>). The unique key stops duplicates
// when a job is retried or an event handler runs twice.
const emailDeliverySchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
    },
    dedupeKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    kind: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    status: {
      type: String,
      enum: ['sending', 'sent', 'skipped', 'failed'],
      default: 'sending',
    },
    error: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
  },
  { timestamps: true }
);

emailDeliverySchema.index({ businessId: 1, dedupeKey: 1 }, { unique: true });
emailDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.model('EmailDelivery', emailDeliverySchema);

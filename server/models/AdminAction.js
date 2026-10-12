const mongoose = require('mongoose');

const ADMIN_ACTIONS = ['archive', 'restore', 'delete', 'grant_admin', 'revoke_admin'];

// Permanent record of what a platform admin changed. Kept after the shop is deleted, so it snapshots
// names instead of relying on the referenced documents still existing.
const adminActionSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ADMIN_ACTIONS,
      required: true,
    },
    adminUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    adminEmail: {
      type: String,
      trim: true,
      default: '',
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
    },
    businessName: {
      type: String,
      trim: true,
      default: '',
    },
    businessSlug: {
      type: String,
      trim: true,
      default: '',
    },
    // The account whose admin access changed. Empty for shop actions.
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    targetEmail: {
      type: String,
      trim: true,
      default: '',
    },
    summary: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

adminActionSchema.index({ businessId: 1, createdAt: -1 });
adminActionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdminAction', adminActionSchema);
module.exports.ADMIN_ACTIONS = ADMIN_ACTIONS;

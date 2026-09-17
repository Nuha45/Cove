const mongoose = require('mongoose');
const { STATUSES, PROVIDER } = require('../utils/subscriptionStatus');

const subscriptionSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
    },
    provider: {
      type: String,
      enum: [PROVIDER],
      default: PROVIDER,
    },
    providerCustomerId: {
      type: String,
      trim: true,
      default: '',
    },
    providerSubscriptionId: {
      type: String,
      trim: true,
      default: '',
    },
    providerPlanId: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'incomplete',
    },
    // Once true, this business never gets another free trial.
    trialUsed: {
      type: Boolean,
      default: false,
    },
    trialStartAt: {
      type: Date,
      default: null,
    },
    trialEndAt: {
      type: Date,
      default: null,
    },
    currentPeriodStartAt: {
      type: Date,
      default: null,
    },
    currentPeriodEndAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    lastProviderStatus: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

// One Cove SaaS subscription record per business.
subscriptionSchema.index({ businessId: 1 }, { unique: true });
subscriptionSchema.index(
  { providerSubscriptionId: 1 },
  { unique: true, partialFilterExpression: { providerSubscriptionId: { $type: 'string', $gt: '' } } }
);
subscriptionSchema.index({ providerCustomerId: 1 });

subscriptionSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    status: this.status,
    trialUsed: Boolean(this.trialUsed),
    trialStartAt: this.trialStartAt,
    trialEndAt: this.trialEndAt,
    currentPeriodStartAt: this.currentPeriodStartAt,
    currentPeriodEndAt: this.currentPeriodEndAt,
    cancelledAt: this.cancelledAt,
    cancelAtPeriodEnd: Boolean(this.cancelAtPeriodEnd),
    hasProviderSubscription: Boolean(this.providerSubscriptionId),
    provider: this.provider,
  };
};

module.exports = mongoose.model('Subscription', subscriptionSchema);

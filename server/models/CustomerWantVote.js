const mongoose = require('mongoose');

// Anonymous interest votes for the public request board.
// Stores only a salted hash — never raw IP, name, phone, or email.
const customerWantVoteSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    wantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerWant',
      required: true,
    },
    voterKeyHash: {
      type: String,
      required: true,
      maxlength: 64,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

customerWantVoteSchema.index({ wantId: 1, voterKeyHash: 1 }, { unique: true });
customerWantVoteSchema.index({ businessId: 1, createdAt: -1 });

module.exports = mongoose.model('CustomerWantVote', customerWantVoteSchema);

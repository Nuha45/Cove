const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ['owner'],
      default: 'owner',
    },
    // Every seller belongs to one business. Later staff accounts can share this id.
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    // Increased on logout / password reset so an old stolen cookie stops working.
    tokenVersion: {
      type: Number,
      default: 0,
    },
    // SHA-256 of the one-time password reset token. Raw token is never stored.
    passwordResetTokenHash: {
      type: String,
      select: false,
      default: undefined,
    },
    passwordResetExpiresAt: {
      type: Date,
      select: false,
      default: undefined,
    },
  },
  { timestamps: true }
);

userSchema.index(
  { passwordResetTokenHash: 1 },
  { unique: true, sparse: true }
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
  };
};

module.exports = mongoose.model('User', userSchema);

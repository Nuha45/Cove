const mongoose = require('mongoose');
const { CATEGORIES } = require('../utils/categories');

const businessSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: CATEGORIES,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
      default: '',
    },
    city: {
      type: String,
      trim: true,
      maxlength: 60,
      default: '',
    },
  },
  { timestamps: true }
);

businessSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    slug: this.slug,
    category: this.category,
    description: this.description,
    phone: this.phone,
    city: this.city,
  };
};

module.exports = mongoose.model('Business', businessSchema);

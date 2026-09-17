const mongoose = require('mongoose');
const { STATUSES } = require('../utils/productStatus');

const productSchema = new mongoose.Schema(
  {
    // Always set from the logged-in user's business, never from the request.
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      max: 10000000,
    },
    stockQuantity: {
      type: Number,
      required: true,
      min: 0,
      max: 1000000,
      default: 0,
    },
    category: {
      type: String,
      trim: true,
      maxlength: 40,
      default: '',
    },
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (images) => images.length <= 4,
        message: 'You can add up to 4 images.',
      },
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'Active',
    },
  },
  { timestamps: true }
);

// List, search, and status filters are always scoped to one business.
productSchema.index({ businessId: 1, status: 1, createdAt: -1 });

productSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    description: this.description,
    price: this.price,
    stockQuantity: this.stockQuantity,
    category: this.category,
    images: this.images,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

productSchema.methods.toStorefront = function toStorefront() {
  const available = this.stockQuantity > 0;
  return {
    id: this._id.toString(),
    name: this.name,
    description: this.description || '',
    price: this.price,
    images: this.images,
    category: this.category || '',
    stockAvailability: available ? 'In stock' : 'Out of stock',
    stockQuantity: this.stockQuantity,
    available,
  };
};

module.exports = mongoose.model('Product', productSchema);

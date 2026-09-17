const mongoose = require('mongoose');

// One sequence per business so two orders cannot receive the same number.
const orderCounterSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    unique: true,
  },
  seq: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
});

module.exports = mongoose.model('OrderCounter', orderCounterSchema);

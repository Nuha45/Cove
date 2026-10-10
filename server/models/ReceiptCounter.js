const mongoose = require('mongoose');

// Cove-wide sequences for documents Cove itself issues, keyed by name (e.g. "subscription").
const receiptCounterSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
    },
    seq: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { versionKey: false }
);

module.exports = mongoose.model('ReceiptCounter', receiptCounterSchema);

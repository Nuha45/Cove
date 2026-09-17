const { body } = require('express-validator');
const mongoose = require('mongoose');
const { CONTENT_TYPES, TONES } = require('../utils/marketingContent');

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

const generateRules = [
  body('productId')
    .custom(isObjectId)
    .withMessage('Please choose a product.'),
  body('contentType')
    .isIn(CONTENT_TYPES)
    .withMessage('Please choose a valid content type.'),
  body('tone')
    .optional()
    .isIn(TONES)
    .withMessage('Please choose a valid tone.'),
];

module.exports = {
  generateRules,
  CONTENT_TYPES,
  TONES,
};

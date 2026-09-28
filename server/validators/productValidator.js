const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');
const { STATUSES } = require('../utils/productStatus');
const { isAcceptedImageValue } = require('../utils/imageUpload');

function requiredMoney(field, missingMessage) {
  return body(field).custom((value) => {
    if (value === undefined || value === null || value === '') {
      throw new Error(missingMessage);
    }
    return checkMoney(value);
  });
}

function optionalMoney(field) {
  return body(field).optional().custom(checkMoney);
}

function checkMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error('Please enter a valid price.');
  }
  if (number < 0) {
    throw new Error('Price cannot be negative.');
  }
  if (number > 10000000) {
    throw new Error('That price is too high.');
  }
  return true;
}

function requiredStock() {
  return body('stockQuantity').custom((value) => {
    if (value === undefined || value === null || value === '') {
      throw new Error('Please enter a stock quantity.');
    }
    return checkStock(value);
  });
}

function optionalStock() {
  return body('stockQuantity').optional().custom(checkStock);
}

function checkStock(value) {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw new Error('Stock must be a whole number.');
  }
  if (number < 0) {
    throw new Error('Stock cannot be negative.');
  }
  if (number > 1000000) {
    throw new Error('That stock quantity is too high.');
  }
  return true;
}

const imageRules = [
  body('images')
    .optional()
    .isArray({ max: 4 })
    .withMessage('You can add up to 4 images.'),
  body('images.*')
    .isString()
    .withMessage('Please upload a JPG, PNG, or WebP image.')
    .isLength({ max: 700000 })
    .withMessage('That image is too large. Please use a smaller photo.')
    .custom((value) => {
      if (isAcceptedImageValue('products', value)) return true;
      throw new Error('Please upload a JPG, PNG, or WebP image.');
    }),
];

const statusRule = body('status')
  .optional()
  .isIn(STATUSES)
  .withMessage('Please choose Active, Draft, or Archived.');

const descriptionRule = body('description')
  .optional({ values: 'falsy' })
  .trim()
  .isLength({ max: 500 })
  .withMessage('Description must be 500 characters or fewer.');

const categoryRule = body('category')
  .optional({ values: 'falsy' })
  .trim()
  .isLength({ max: 40 })
  .withMessage('Category must be 40 characters or fewer.');

const nameRule = body('name')
  .trim()
  .notEmpty()
  .withMessage('Please enter a product name.')
  .isLength({ min: 2, max: 80 })
  .withMessage('Name must be between 2 and 80 characters.');

const idRule = param('id')
  .custom((value) => mongoose.Types.ObjectId.isValid(value))
  .withMessage('That product link is not valid.');

const createRules = [
  nameRule,
  descriptionRule,
  requiredMoney('price', 'Please enter a price.'),
  requiredStock(),
  categoryRule,
  statusRule,
  ...imageRules,
];

const updateRules = [
  idRule,
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Please enter a product name.')
    .isLength({ min: 2, max: 80 })
    .withMessage('Name must be between 2 and 80 characters.'),
  descriptionRule,
  optionalMoney('price'),
  optionalStock(),
  categoryRule,
  statusRule,
  ...imageRules,
];

const listRules = [
  query('search').optional().trim().isLength({ max: 80 }).withMessage('Search is too long.'),
  query('status')
    .optional()
    .isIn([...STATUSES, 'all'])
    .withMessage('That status filter is not valid.'),
  query('category').optional().trim().isLength({ max: 40 }).withMessage('That category filter is not valid.'),
  query('page').optional().isInt({ min: 1, max: 10000 }).withMessage('That page is not valid.'),
  query('limit').optional().isInt({ min: 1, max: 24 }).withMessage('Please request between 1 and 24 products.'),
];

module.exports = {
  createRules,
  updateRules,
  listRules,
  idRule,
};

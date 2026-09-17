const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');
const { STATUSES, PAYMENT_STATUSES, DELIVERY_METHODS } = require('../utils/orderStatus');

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function checkMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error('Please enter a valid delivery fee.');
  }
  if (number < 0) {
    throw new Error('Delivery fee cannot be negative.');
  }
  if (number > 10000000) {
    throw new Error('That delivery fee is too high.');
  }
  return true;
}

const idRule = param('id')
  .custom(isObjectId)
  .withMessage('That order link is not valid.');

const createRules = [
  body('customer')
    .isObject()
    .withMessage('Please enter the customer.'),
  body('customer.name')
    .trim()
    .notEmpty()
    .withMessage('Please enter the customer name.')
    .isLength({ min: 2, max: 80 })
    .withMessage('Customer name must be between 2 and 80 characters.'),
  body('customer.phone')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^[+0-9][0-9\s()-]{6,19}$/)
    .withMessage('Please enter a valid phone number.'),
  body('customer.email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email.')
    .isLength({ max: 120 })
    .withMessage('Email is too long.'),
  body('items')
    .isArray({ min: 1, max: 30 })
    .withMessage('Add between 1 and 30 products.'),
  body('items.*.productId')
    .custom(isObjectId)
    .withMessage('One of the products is not valid.'),
  body('items.*.quantity')
    .isInt({ min: 1, max: 1000 })
    .withMessage('Quantity must be a whole number from 1 to 1000.'),
  body('items').custom((items) => {
    if (!Array.isArray(items)) return true;
    const ids = items.map((item) => String(item?.productId || ''));
    if (new Set(ids).size !== ids.length) {
      throw new Error('Each product can only appear once. Increase the quantity instead.');
    }
    return true;
  }),
  body('deliveryMethod')
    .isIn(DELIVERY_METHODS)
    .withMessage('Please choose Pickup or Delivery.'),
  body('deliveryAddress').custom((value, { req }) => {
    if (req.body.deliveryMethod !== 'Delivery') return true;
    const text = String(value || '').trim();
    if (text.length < 5) {
      throw new Error('Please enter a delivery address.');
    }
    if (text.length > 200) {
      throw new Error('Delivery address must be 200 characters or fewer.');
    }
    return true;
  }),
  body('deliveryFee').custom((value, { req }) => {
    if (req.body.deliveryMethod !== 'Delivery') {
      if (value === undefined || value === null || value === '' || Number(value) === 0) return true;
      throw new Error('Pickup orders do not include a delivery fee.');
    }
    if (value === undefined || value === null || value === '') return true;
    return checkMoney(value);
  }),
  body('notes')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be 500 characters or fewer.'),
];

const updateRules = [
  idRule,
  body('status')
    .optional()
    .isIn(STATUSES)
    .withMessage('Please choose a valid order status.'),
  body('paymentStatus')
    .optional()
    .isIn(PAYMENT_STATUSES)
    .withMessage('Payment can only be Pending or Paid.'),
  body().custom((value) => {
    if (!value || (value.status === undefined && value.paymentStatus === undefined)) {
      throw new Error('Please change the order status or payment status.');
    }
    return true;
  }),
];

const listRules = [
  query('search').optional().trim().isLength({ max: 80 }).withMessage('Search is too long.'),
  query('status')
    .optional()
    .isIn(STATUSES)
    .withMessage('That status filter is not valid.'),
  query('paymentStatus')
    .optional()
    .isIn(PAYMENT_STATUSES)
    .withMessage('That payment filter is not valid.'),
  query('page').optional().isInt({ min: 1, max: 10000 }).withMessage('That page is not valid.'),
  query('limit').optional().isInt({ min: 1, max: 24 }).withMessage('Please request between 1 and 24 orders.'),
];

module.exports = {
  createRules,
  updateRules,
  listRules,
  idRule,
};
